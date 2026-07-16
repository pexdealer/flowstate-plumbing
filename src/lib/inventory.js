// Inventory engine: stock math + the single path all stock mutations go
// through. The StockMovement ledger is the source of truth; the item's
// quantity_on_hand is a display cache that can always be rebuilt from it.
//
// Movements try the `applyStockMovements` backend function first (hardened,
// service-role path — see docs/inventory.md). If that function isn't deployed
// (and only then), they fall back to direct entity writes with
// idempotency-key checks — fine for a single-company install with light
// concurrency. Real backend errors are rethrown, never masked.

import { base44 } from "@/api/base44Client";

export const CATEGORY_LABELS = {
  pipe_fittings: "Pipe Fittings",
  pipe: "Pipe",
  valves: "Valves",
  water_heaters: "Water Heaters",
  fixtures: "Fixtures",
  drainage: "Drainage",
  gas: "Gas",
  tools_equipment: "Tools & Equipment",
  consumables: "Consumables",
  other: "Other",
};

export const UNIT_LABELS = {
  each: "each",
  ft: "ft",
  box: "box",
  roll: "roll",
  lb: "lb",
  gal: "gal",
  kit: "kit",
};

export const ADJUSTMENT_REASONS = [
  { value: "count_correction", label: "Count correction" },
  { value: "damaged", label: "Damaged" },
  { value: "lost_stolen", label: "Lost / stolen" },
  { value: "warranty", label: "Warranty swap" },
  { value: "other", label: "Other" },
];

// Low stock: at/below a positive reorder point, or below zero. A reorder
// point of 0 (or unset) means "not tracked" — an intentionally-empty item
// should not wear a permanent low-stock badge.
export function isLowStock(item) {
  if (!item) return false;
  const qty = item.quantity_on_hand || 0;
  if (qty < 0) return true;
  return (item.reorder_point || 0) > 0 && qty <= item.reorder_point;
}

export function isNegativeStock(item) {
  return (item?.quantity_on_hand || 0) < 0;
}

// Suggested PO quantity: at least the default reorder amount, and at least
// enough to get back above the reorder point.
export function suggestedReorderQty(item) {
  const onHand = item.quantity_on_hand || 0;
  const shortfall = (item.reorder_point || 0) - onHand;
  return Math.max(item.reorder_qty || 0, shortfall, 1);
}

// Weighted average cost after receiving stock. If on-hand was zero/negative,
// the average resets to the new purchase price.
export function newAvgCost(onHand, avgCost, receivedQty, unitCost) {
  if (!receivedQty || unitCost == null) return avgCost || 0;
  if (!onHand || onHand <= 0 || !avgCost) return unitCost;
  return (onHand * avgCost + receivedQty * unitCost) / (onHand + receivedQty);
}

export function inventoryValue(items) {
  return (items || []).reduce(
    (sum, i) => sum + Math.max(i.quantity_on_hand || 0, 0) * (i.avg_cost || 0),
    0
  );
}

// Fetch a single item by id; null if missing.
async function getItem(id) {
  try {
    return await base44.entities.InventoryItem.get(id);
  } catch {
    return null;
  }
}

// The backend function is optional. Fall back ONLY when it clearly doesn't
// exist / isn't reachable — auth or validation rejections must surface.
function isFunctionMissing(err) {
  const status = err?.status ?? err?.response?.status;
  if (status === 404 || status === 405 || status === 501) return true;
  return /not\s*found|404|does not exist|no such function/i.test(err?.message || "");
}

/**
 * Apply a batch of stock movements. Each movement:
 * { item_id, type, qty_delta, unit_cost?, job_id?, purchase_order_id?,
 *   reason?, reason_note?, idempotency_key? }
 * Returns { results }, where each result is
 * { item_id, qty_after } | { item_id, skipped } | { item_id, error }.
 * Throws only on transport-level failures; per-item problems are in results.
 */
export async function applyMovements(movements, { performedBy } = {}) {
  if (!movements?.length) return { results: [] };
  try {
    return await base44.functions.invoke("applyStockMovements", { movements });
  } catch (err) {
    if (!isFunctionMissing(err)) throw err;
    return applyMovementsClientSide(movements, { performedBy });
  }
}

/** Split an applyMovements result into successes and failures. */
export function movementFailures(result) {
  return (result?.results || []).filter((r) => r.error);
}

async function applyMovementsClientSide(movements, { performedBy } = {}) {
  const results = [];
  for (const m of movements) {
    try {
      if (m.idempotency_key) {
        const existing = await base44.entities.StockMovement.filter({
          idempotency_key: m.idempotency_key,
        });
        if (existing?.length) {
          results.push({ item_id: m.item_id, skipped: true });
          continue;
        }
      }
      const item = m._item || (await getItem(m.item_id));
      if (!item) {
        results.push({ item_id: m.item_id, error: "item not found" });
        continue;
      }
      const { _item, ...movement } = m;
      const qtyAfter = (item.quantity_on_hand || 0) + m.qty_delta;
      // Ledger first, cache second: if the cache update fails, reconcile
      // rebuilds it from the ledger and nothing is lost.
      await base44.entities.StockMovement.create({
        ...movement,
        item_sku: item.sku,
        item_name: item.name,
        qty_after: qtyAfter,
        performed_by: performedBy || undefined,
      });
      const patch = { quantity_on_hand: qtyAfter };
      if (m.type === "purchase_receipt" && m.unit_cost != null) {
        patch.avg_cost = newAvgCost(
          item.quantity_on_hand || 0,
          item.avg_cost || 0,
          m.qty_delta,
          m.unit_cost
        );
        patch.last_cost = m.unit_cost;
      }
      await base44.entities.InventoryItem.update(m.item_id, patch);
      results.push({ item_id: m.item_id, qty_after: qtyAfter });
    } catch (err) {
      results.push({ item_id: m.item_id, error: err?.message || "failed" });
    }
  }
  return { results };
}

/**
 * Reconcile a job's line items against what has already been deducted, and
 * apply only the difference. Safe to call repeatedly — a second call with the
 * same lines is a no-op (recorded usage is derived from the ledger, so a
 * retry after partial failure only re-applies what's genuinely missing).
 * Idempotency keys encode the from→to transition per item, which also blocks
 * concurrent duplicate submissions of the same change.
 * Returns { deducted, returned, oversold, failed } — failed is an array of
 * { item_id, error }; the caller must treat any failure as "not confirmed".
 */
export async function recordUsageForJob(job, { performedBy } = {}) {
  const lines = (job.line_items || []).filter((l) => l.item_id);

  // Desired usage per item across all lines.
  const desired = {};
  for (const l of lines) {
    desired[l.item_id] = (desired[l.item_id] || 0) + (parseFloat(l.quantity) || 0);
  }

  // What's already been recorded for this job (usage is negative, returns positive).
  const priorMovements = await base44.entities.StockMovement.filter({ job_id: job.id });
  const recorded = {};
  for (const mv of priorMovements || []) {
    if (mv.type === "usage" || mv.type === "return") {
      recorded[mv.item_id] = (recorded[mv.item_id] || 0) - (mv.qty_delta || 0);
    }
  }

  const itemIds = [...new Set([...Object.keys(desired), ...Object.keys(recorded)])];
  const movements = [];
  const oversold = [];
  for (const itemId of itemIds) {
    const from = recorded[itemId] || 0;
    const to = desired[itemId] || 0;
    const diff = to - from;
    if (!diff) continue;
    // Fetch once; pass along via _item so the fallback path doesn't re-fetch.
    const item = await getItem(itemId);
    // Key identifies the logical transition, not a sequence number: retrying
    // the same change reuses the same key; a genuine new change gets a new one.
    const idempotency_key = `job:${job.id}:item:${itemId}:from:${from}:to:${to}`;
    if (diff > 0) {
      if (item && (item.quantity_on_hand || 0) < diff) {
        oversold.push({
          item_id: itemId,
          name: item.name,
          short: diff - (item.quantity_on_hand || 0),
        });
      }
      movements.push({
        item_id: itemId,
        type: "usage",
        qty_delta: -diff,
        unit_cost: item?.avg_cost,
        job_id: job.id,
        idempotency_key,
        _item: item,
      });
    } else {
      movements.push({
        item_id: itemId,
        type: "return",
        qty_delta: -diff, // diff is negative → positive delta back into stock
        job_id: job.id,
        idempotency_key,
        _item: item,
      });
    }
  }

  const result = await applyMovements(movements, { performedBy });
  const failed = movementFailures(result);

  // Only stamp confirmation when everything landed; a partial failure must
  // stay visibly unconfirmed so the tech retries.
  if (failed.length === 0) {
    await base44.entities.Job.update(job.id, {
      parts_confirmed_at: new Date().toISOString(),
    });
  }

  return {
    deducted: movements.filter((m) => m.type === "usage").length,
    returned: movements.filter((m) => m.type === "return").length,
    oversold,
    failed,
  };
}

/**
 * Rebuild every item's cached quantity from the movement ledger and repair
 * drift. Returns { checked, repaired, drift: [{sku, cached, ledger}] }.
 * In-app counterpart of the documented backend reconcileStock function.
 */
export async function reconcileFromLedger() {
  const [items, movements] = await Promise.all([
    base44.entities.InventoryItem.list("-created_date", 2000),
    base44.entities.StockMovement.list("-created_date", 10000),
  ]);
  const ledger = {};
  for (const mv of movements || []) {
    ledger[mv.item_id] = (ledger[mv.item_id] || 0) + (mv.qty_delta || 0);
  }
  const drift = [];
  for (const item of items || []) {
    const ledgerQty = ledger[item.id] || 0;
    if (ledgerQty !== (item.quantity_on_hand || 0)) {
      drift.push({ sku: item.sku, cached: item.quantity_on_hand || 0, ledger: ledgerQty });
      await base44.entities.InventoryItem.update(item.id, { quantity_on_hand: ledgerQty });
    }
  }
  return { checked: (items || []).length, repaired: drift.length, drift };
}
