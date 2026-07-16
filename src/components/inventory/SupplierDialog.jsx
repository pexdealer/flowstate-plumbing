import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

const TERMS = [
  { value: "due_on_receipt", label: "Due on receipt" },
  { value: "net_15", label: "Net 15" },
  { value: "net_30", label: "Net 30" },
  { value: "net_60", label: "Net 60" },
];

const emptySupplier = {
  name: "",
  contact_name: "",
  email: "",
  phone: "",
  account_number: "",
  default_terms: "net_30",
  notes: "",
};

export default function SupplierDialog({ open, onOpenChange, supplier }) {
  const isEdit = !!supplier;
  const [form, setForm] = useState(emptySupplier);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (open) setForm(supplier ? { ...emptySupplier, ...supplier } : emptySupplier);
  }, [open, supplier]);

  const set = (field) => (e) => setForm({ ...form, [field]: e?.target ? e.target.value : e });

  const saveMutation = useMutation({
    mutationFn: (data) =>
      isEdit
        ? base44.entities.Supplier.update(supplier.id, data)
        : base44.entities.Supplier.create({ ...data, active: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      toast.success(isEdit ? "Supplier updated" : "Supplier added");
      onOpenChange(false);
    },
    onError: (e) => toast.error(e?.message || "Could not save supplier"),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    saveMutation.mutate({
      name: form.name.trim(),
      contact_name: form.contact_name,
      email: form.email,
      phone: form.phone,
      account_number: form.account_number,
      default_terms: form.default_terms,
      notes: form.notes,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display">{isEdit ? "Edit Supplier" : "New Supplier"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Company Name *</Label>
            <Input value={form.name} onChange={set("name")} required placeholder="Ferguson Plumbing Supply" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Contact</Label>
              <Input value={form.contact_name} onChange={set("contact_name")} />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={form.phone} onChange={set("phone")} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={set("email")} />
            </div>
            <div>
              <Label>Account #</Label>
              <Input value={form.account_number} onChange={set("account_number")} />
            </div>
          </div>
          <div>
            <Label>Payment Terms</Label>
            <Select value={form.default_terms} onValueChange={set("default_terms")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TERMS.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={set("notes")} rows={2} />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Saving..." : isEdit ? "Update" : "Add Supplier"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
