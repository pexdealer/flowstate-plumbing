import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { CATEGORY_LABELS, UNIT_LABELS, applyMovements } from "@/lib/inventory";

const emptyItem = {
  sku: "",
  name: "",
  description: "",
  category: "other",
  unit_of_measure: "each",
  avg_cost: "",
  sell_price: "",
  reorder_point: "",
  reorder_qty: "",
  preferred_supplier_id: "",
  supplier_sku: "",
  barcode: "",
  bin_location: "",
  notes: "",
};

const num = (v) => (v === "" || v == null ? undefined : parseFloat(v) || 0);

export default function ItemDialog({ open, onOpenChange, item }) {
  const isEdit = !!item;
  const [form, setForm] = useState(emptyItem);
  const [initialQty, setInitialQty] = useState("");
  const queryClient = useQueryClient();

  useEffect(() => {
    if (open) {
      setForm(item ? { ...emptyItem, ...item } : emptyItem);
      setInitialQty("");
    }
  }, [open, item]);

  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => base44.entities.Supplier.list("-created_date", 200),
    enabled: open,
  });

  const set = (field) => (e) => setForm({ ...form, [field]: e?.target ? e.target.value : e });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        sku: form.sku.trim(),
        name: form.name.trim(),
        description: form.description,
        category: form.category,
        unit_of_measure: form.unit_of_measure,
        avg_cost: num(form.avg_cost),
        sell_price: num(form.sell_price),
        reorder_point: num(form.reorder_point),
        reorder_qty: num(form.reorder_qty),
        preferred_supplier_id: form.preferred_supplier_id || undefined,
        supplier_sku: form.supplier_sku,
        barcode: form.barcode,
        bin_location: form.bin_location,
        notes: form.notes,
      };
      if (isEdit) {
        return base44.entities.InventoryItem.update(item.id, payload);
      }
      const created = await base44.entities.InventoryItem.create({
        ...payload,
        quantity_on_hand: 0,
        active: true,
      });
      // Starting quantity goes through the ledger so history is complete.
      const qty = num(initialQty);
      if (qty) {
        await applyMovements([
          {
            item_id: created.id,
            type: "initial",
            qty_delta: qty,
            unit_cost: payload.avg_cost,
            idempotency_key: `initial:${created.id}`,
          },
        ]);
      }
      return created;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      toast.success(isEdit ? "Item updated" : "Item added");
      onOpenChange(false);
    },
    onError: (e) => toast.error(e?.message || "Could not save item"),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.sku.trim() || !form.name.trim()) return;
    saveMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">{isEdit ? "Edit Item" : "New Item"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>SKU *</Label>
              <Input value={form.sku} onChange={set("sku")} required placeholder="CU-EL-34" />
            </div>
            <div>
              <Label>Name *</Label>
              <Input value={form.name} onChange={set("name")} required placeholder='3/4" Copper Elbow' />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Category</Label>
              <Select value={form.category} onValueChange={set("category")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORY_LABELS).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Unit</Label>
              <Select value={form.unit_of_measure} onValueChange={set("unit_of_measure")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(UNIT_LABELS).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <Label>Cost $</Label>
              <Input type="number" min="0" step="0.01" value={form.avg_cost} onChange={set("avg_cost")} />
            </div>
            <div>
              <Label>Sell Price $</Label>
              <Input type="number" min="0" step="0.01" value={form.sell_price} onChange={set("sell_price")} />
            </div>
            <div>
              <Label>Reorder Point</Label>
              <Input type="number" min="0" step="1" value={form.reorder_point} onChange={set("reorder_point")} />
            </div>
            <div>
              <Label>Reorder Qty</Label>
              <Input type="number" min="0" step="1" value={form.reorder_qty} onChange={set("reorder_qty")} />
            </div>
          </div>
          {!isEdit && (
            <div>
              <Label>Starting Quantity</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={initialQty}
                onChange={(e) => setInitialQty(e.target.value)}
                placeholder="0"
              />
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <Label>Preferred Supplier</Label>
              <Select value={form.preferred_supplier_id || "none"} onValueChange={(v) => setForm({ ...form, preferred_supplier_id: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Supplier SKU</Label>
              <Input value={form.supplier_sku} onChange={set("supplier_sku")} />
            </div>
            <div>
              <Label>Bin / Location</Label>
              <Input value={form.bin_location} onChange={set("bin_location")} placeholder="Shelf B3" />
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={set("notes")} rows={2} />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Saving..." : isEdit ? "Update" : "Add Item"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
