import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { applyMovements } from "@/lib/inventory";

// Receive stock against a PO. Partial receipts are fine — the PO flips to
// partially_received until every line is complete. Receipts are the only
// purchasing path that raises stock, and they update weighted average cost.
export default function ReceivePODialog({ open, onOpenChange, po }) {
  const [received, setReceived] = useState({});
  const queryClient = useQueryClient();

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
      const updatedLines = lines.map((line, i) => {
        const qty = parseFloat(received[i]) || 0;
        if (qty > 0 && line.item_id) {
          movements.push({
            item_id: line.item_id,
            type: "purchase_receipt",
            qty_delta: qty,
            unit_cost: line.unit_cost,
            purchase_order_id: po.id,
            idempotency_key: `po:${po.id}:line:${i}:rcv:${(line.qty_received || 0) + qty}`,
          });
        }
        return { ...line, qty_received: (line.qty_received || 0) + qty };
      });

      if (!movements.length) throw new Error("Nothing to receive");
      await applyMovements(movements);

      const complete = updatedLines.every((l) => (l.qty_received || 0) >= (l.qty_ordered || 0));
      await base44.entities.PurchaseOrder.update(po.id, {
        line_items: updatedLines,
        status: complete ? "received" : "partially_received",
        received_at: complete ? new Date().toISOString() : po.received_at,
      });
      return complete;
    },
    onSuccess: (complete) => {
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      queryClient.invalidateQueries({ queryKey: ["purchase-order", po?.id] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      toast.success(complete ? "PO fully received — stock updated" : "Partial receipt recorded");
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
