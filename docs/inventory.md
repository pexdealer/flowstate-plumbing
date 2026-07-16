# Inventory System

How stock tracking works and the optional Builder hardening step.

## How it works

- **`StockMovement` is an append-only ledger and the source of truth.** Every
  unit that moves (initial stock, job usage, PO receipt, adjustment, return)
  is one immutable row with who/when/why and a signed `qty_delta`. Mistakes are
  corrected with counter-entries, never edits.
- **`InventoryItem.quantity_on_hand` is a display cache** kept up to date by
  the same code path that writes movements (`src/lib/inventory.js`). If it ever
  drifts, it can be rebuilt by summing the ledger.
- **Deduction happens on the Job screen** via "Confirm Parts Used". The
  reconciler (`recordUsageForJob`) diffs the job's inventory-linked lines
  against movements already recorded for that job and applies only the
  difference — safe to press repeatedly, and reducing a quantity returns stock.
- **Oversell is warn-and-allow.** A tech holding the part is never blocked;
  stock goes negative and the dashboard flags it for a count fix.
- **Costing is weighted average.** Receiving stock at a new price updates
  `avg_cost = (onHand×avg + received×cost) / (onHand+received)`; `last_cost`
  always holds the newest purchase price.
- **Invoices:** when invoicing ships, the same movement path applies with an
  `invoice_id` reference — the field already exists on StockMovement.

## Optional hardening: backend functions (Base44 Builder)

The frontend calls `base44.functions.invoke("applyStockMovements", ...)` first
and falls back to direct entity writes **only when the function is missing**
(404/not-found) — real backend errors are rethrown, never masked. Idempotency
keys encode the logical change (e.g. `job:{id}:item:{id}:from:{x}:to:{y}`), so
retries are safe. All movement paths record `performed_by`. The fallback is
fine for one company with light concurrency; create these two functions in the
Builder when multiple people are hitting stock at once.

There's also an in-app repair: the ⟳ button on the Inventory page runs
`reconcileFromLedger()` client-side — it rebuilds every cached quantity from
the movement ledger and reports what it fixed. The backend `reconcileStock`
below is its scheduled/nightly counterpart.

### `applyStockMovements`

```js
import { createClientFromRequest } from "@base44/sdk";

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me(); // must be a registered user
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { movements } = await req.json();
  const results = [];
  for (const m of movements || []) {
    if (m.idempotency_key) {
      const dup = await base44.asServiceRole.entities.StockMovement.filter({
        idempotency_key: m.idempotency_key,
      });
      if (dup?.length) { results.push({ item_id: m.item_id, skipped: true }); continue; }
    }
    const items = await base44.asServiceRole.entities.InventoryItem.filter({ id: m.item_id });
    const item = items?.[0];
    if (!item) { results.push({ item_id: m.item_id, error: "not found" }); continue; }

    const qtyAfter = (item.quantity_on_hand || 0) + m.qty_delta;
    await base44.asServiceRole.entities.StockMovement.create({
      ...m,
      item_sku: item.sku,
      item_name: item.name,
      qty_after: qtyAfter,
      performed_by: user.email,
    });
    const patch = { quantity_on_hand: qtyAfter };
    if (m.type === "purchase_receipt" && m.unit_cost != null) {
      const onHand = item.quantity_on_hand || 0;
      patch.avg_cost = onHand > 0 && item.avg_cost
        ? (onHand * item.avg_cost + m.qty_delta * m.unit_cost) / (onHand + m.qty_delta)
        : m.unit_cost;
      patch.last_cost = m.unit_cost;
    }
    await base44.asServiceRole.entities.InventoryItem.update(m.item_id, patch);
    results.push({ item_id: m.item_id, qty_after: qtyAfter });
  }
  return Response.json({ results });
});
```

### `reconcileStock` — rebuild caches from the ledger

Run from a button or a Builder scheduled task (e.g. nightly). Reports and
repairs any drift between the ledger and the cached quantities.

```js
import { createClientFromRequest } from "@base44/sdk";

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const items = await base44.asServiceRole.entities.InventoryItem.list("-created_date", 2000);
  const drift = [];
  for (const item of items) {
    const movements = await base44.asServiceRole.entities.StockMovement.filter({ item_id: item.id });
    const ledgerQty = (movements || []).reduce((s, m) => s + (m.qty_delta || 0), 0);
    if (ledgerQty !== (item.quantity_on_hand || 0)) {
      drift.push({ sku: item.sku, cached: item.quantity_on_hand, ledger: ledgerQty });
      await base44.asServiceRole.entities.InventoryItem.update(item.id, { quantity_on_hand: ledgerQty });
    }
  }
  return Response.json({ checked: items.length, repaired: drift.length, drift });
});
```

## RLS reminder

Same as the dispatch entities: before a second company logs in, scope
`InventoryItem`, `StockMovement`, `Supplier`, `PurchaseOrder`, and
`StockLocation` reads/writes to `created_by` in the Builder.

## What's deliberately NOT built (complexity traps)

FIFO/lot/serial tracking · hard oversell blocks · deduction at estimate stage ·
PO approval chains · bin-level warehouse topology. Weighted average + a clean
ledger covers a small plumbing company; these add support burden without value
at this scale.

## P1 roadmap

Van stock (StockLocation is already in the schema and every movement carries
`location_id`) · PO PDF via the installed jsPDF · barcode scanning against the
existing `barcode` field · guided cycle counts · low-stock notifications through
the existing Notification entity.
