import React, { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { ADJUSTMENT_REASONS, applyMovements } from "@/lib/inventory";

// Manual stock adjustment: enter the NEW counted quantity; the dialog shows
// the resulting +/- delta and requires a reason for the audit trail.
export default function AdjustStockDialog({ open, onOpenChange, item }) {
  const [newQty, setNewQty] = useState("");
  const [reason, setReason] = useState("count_correction");
  const [note, setNote] = useState("");
  const queryClient = useQueryClient();

  useEffect(() => {
    if (open && item) {
      setNewQty(String(item.quantity_on_hand ?? 0));
      setReason("count_correction");
      setNote("");
    }
  }, [open, item]);

  const onHand = item?.quantity_on_hand || 0;
  const parsed = parseFloat(newQty);
  const delta = isNaN(parsed) ? 0 : parsed - onHand;

  const adjustMutation = useMutation({
    mutationFn: () =>
      applyMovements([
        {
          item_id: item.id,
          type: "adjustment",
          qty_delta: delta,
          reason,
          reason_note: note || undefined,
        },
      ]),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["movements", item?.id] });
      toast.success("Stock adjusted");
      onOpenChange(false);
    },
    onError: (e) => toast.error(e?.message || "Could not adjust stock"),
  });

  if (!item) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">Adjust Stock — {item.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Current On Hand</Label>
              <Input value={onHand} disabled className="bg-muted" />
            </div>
            <div>
              <Label>New Counted Qty</Label>
              <Input
                type="number"
                step="0.01"
                value={newQty}
                onChange={(e) => setNewQty(e.target.value)}
                autoFocus
              />
            </div>
          </div>
          {delta !== 0 && !isNaN(parsed) && (
            <p className={`text-sm font-medium ${delta > 0 ? "text-emerald-600" : "text-red-500"}`}>
              {delta > 0 ? `+${delta}` : delta} will be recorded
            </p>
          )}
          <div>
            <Label>Reason *</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ADJUSTMENT_REASONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Note</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Optional details..." />
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button
              onClick={() => adjustMutation.mutate()}
              disabled={adjustMutation.isPending || isNaN(parsed) || delta === 0}
            >
              {adjustMutation.isPending ? "Saving..." : "Save Adjustment"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
