// Inventory engine: stock math + the single path all stock mutations go
// through. The StockMovement ledger is the source of truth; the item's
// quantity_on_hand is a display cache that can always be rebuilt from it.
//
// Movements try the `applyStockMovements` backend function first (hardened,
// service-role path — see docs/inventory.md). If it isn't deployed yet, they
// fall back to direct entity writes with idempotency-key checks, which is fine
// for a single-company install with light concurrency.

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

export function isLowStock(item) {
  if (!item || item.reorder_point == null) return false;
  return (item.quantity_on_hand || 0) <= item.reorder_point;
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

/**
 * Apply a batch of stock movements. Each movement:
 * { item_id, type, qty_delta, unit_cost?, job_id?, purchase_order_id?,
 *   reason?, reason_note?, idempotency_key? }
 * Returns { results: [{ item_id, qty_after, skipped? }] }.
 */
export async function applyMovements(movements, { performedBy } = {}) {
  if (!movements?.length) return { results: [] };
  try {
    return await base44.functions.invoke("applyStockMovements", { movements });
  } catch {
    return applyMovementsClientSide(movements, { performedBy });
  }
}

async function applyMovementsClientSide(movements, { performedBy } = {}) {
  const results = [];
  for (const m of movements) {
    if (m.idempotency_key) {
      const existing = await base44.entities.StockMovement.filter({
        idempotency_key: m.idempotency_key,
      });
      if (existing?.length) {
        results.push({ item_id: m.item_id, skipped: true });
        continue;
      }
    }
    const matches = await base44.entities.InventoryItem.filter({ id: m.item_id });
    const item = matches?.[0];
    if (!item) {
      results.push({ item_id: m.item_id, error: "item not found" });
      continue;
    }
    const qtyAfter = (item.quantity_on_hand || 0) + m.qty_delta;
    // Ledger first, cache second: if the cache update fails, reconcile
    // rebuilds it from the ledger and nothing is lost.
    await base44.entities.StockMovement.create({
      ...m,
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
  }
  return { results };
}

/**
 * Reconcile a job's line items against what has already been deducted, and
 * apply only the difference. Safe to call repeatedly — a second call with the
 * same lines is a no-op; reduced lines generate `return` counter-movements.
 * Returns { deducted, returned, oversold: [{item_id, name, short}] }.
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
  let seq = 0;
  for (const mv of priorMovements || []) {
    if (mv.type === "usage" || mv.type === "return") {
      recorded[mv.item_id] = (recorded[mv.item_id] || 0) - (mv.qty_delta || 0);
      seq += 1;
    }
  }

  const itemIds = [...new Set([...Object.keys(desired), ...Object.keys(recorded)])];
  const movements = [];
  const oversold = [];
  for (const itemId of itemIds) {
    const diff = (desired[itemId] || 0) - (recorded[itemId] || 0);
    if (!diff) continue;
    seq += 1;
    if (diff > 0) {
      const matches = await base44.entities.InventoryItem.filter({ id: itemId });
      const item = matches?.[0];
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
        idempotency_key: `job:${job.id}:item:${itemId}:${seq}`,
      });
    } else {
      movements.push({
        item_id: itemId,
        type: "return",
        qty_delta: -diff, // diff is negative → positive delta back into stock
        job_id: job.id,
        idempotency_key: `job:${job.id}:item:${itemId}:${seq}`,
      });
    }
  }

  await applyMovements(movements, { performedBy });
  await base44.entities.Job.update(job.id, {
    parts_confirmed_at: new Date().toISOString(),
  });

  return {
    deducted: movements.filter((m) => m.type === "usage").length,
    returned: movements.filter((m) => m.type === "return").length,
    oversold,
  };
}
