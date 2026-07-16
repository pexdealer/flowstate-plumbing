import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useAuth } from "@/lib/AuthContext";
import { applyMovements, movementFailures } from "@/lib/inventory";

// Receive stock against a PO. Partial receipts are fine — the PO flips to
// partially_received until every line is complete. Receipts are the only
// purchasing path that raises stock, and they update weighted average cost.
export default function ReceivePODialog({ open, onOpenChange, po }) {
  const [received, setReceived] = useState({});
  const queryClient = useQueryClient();
  const { user } = useAuth();

  useEffect(() => {
    if (open && po) {
      const initial = {};
      (po.line_items || []).forEach((line, i) => {
        const remaining = (line.qty_ordered || 0) - (line.qty_received || 0);
        initial[i] = remaining > 0 ? String(remaining) : "0";
      });
      setReceived(initial);
    }
  }, [open, po]);

  const receiveMutation = useMutation({
    mutationFn: async () => {
      const lines = po.line_items || [];
      const movements = [];
      lines.forEach((line, i) => {
        const qty = parseFloat(received[i]) || 0;
        if (qty > 0 && line.item_id) {
          movements.push({
            item_id: line.item_id,
            type: "purchase_receipt",
            qty_delta: qty,
            unit_cost: line.unit_cost,
            purchase_order_id: po.id,
            // Keyed by item + cumulative total so editing/removing draft lines
            // can't shift the key, and a retry of the same receipt is caught.
            idempotency_key: `po:${po.id}:item:${line.item_id}:rcv:${(line.qty_received || 0) + qty}`,
          });
        }
      });

      if (!movements.length) throw new Error("Nothing to receive");
      const res = await applyMovements(movements, { performedBy: user?.email });
      const failedIds = new Set(movementFailures(res).map((f) => f.item_id));

      // Only record receipt on lines whose stock movement actually landed —
      // keeps the PO honest if an item write failed.
      const updatedLines = lines.map((line, i) => {
        const qty = parseFloat(received[i]) || 0;
        if (qty > 0 && line.item_id && !failedIds.has(line.item_id)) {
          return { ...line, qty_received: (line.qty_received || 0) + qty };
        }
        return line;
      });

      const complete = updatedLines.every((l) => (l.qty_received || 0) >= (l.qty_ordered || 0));
      await base44.entities.PurchaseOrder.update(po.id, {
        line_items: updatedLines,
        status: complete ? "received" : "partially_received",
        received_at: complete ? new Date().toISOString() : po.received_at,
      });
      return { complete, failedCount: failedIds.size };
    },
    onSuccess: ({ complete, failedCount }) => {
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      queryClient.invalidateQueries({ queryKey: ["purchase-order", po?.id] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      if (failedCount > 0) {
        toast.warning(`${failedCount} line${failedCount > 1 ? "s" : ""} failed to receive — check and retry those.`, { duration: 8000 });
      } else {
        toast.success(complete ? "PO fully received — stock updated" : "Partial receipt recorded");
      }
      onOpenChange(false);
    },
    onError: (e) => toast.error(e?.message || "Could not receive stock"),
  });

  if (!po) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display">Receive — {po.po_number}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {(po.line_items || []).map((line, i) => {
            const remaining = (line.qty_ordered || 0) - (line.qty_received || 0);
            return (
              <div key={i} className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{line.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {line.sku} · ordered {line.qty_ordered}, received {line.qty_received || 0}
                  </p>
                </div>
                <Input
                  type="number"
                  min="0"
                  max={remaining}
                  step="0.01"
                  value={received[i] ?? ""}
                  onChange={(e) => setReceived({ ...received, [i]: e.target.value })}
                  className="w-24 h-9 text-right"
                  disabled={remaining <= 0}
                />
              </div>
            );
          })}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={() => receiveMutation.mutate()} disabled={receiveMutation.isPending}>
              {receiveMutation.isPending ? "Receiving..." : "Receive Stock"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
