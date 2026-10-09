import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

const emptyDraft = { name: "", phone: "", email: "", address: "", city: "", state: "", zip: "" };

// Inline "add a new customer" dialog so the estimate form never loses its place.
export default function NewCustomerDialog({ triggerLabel, onCreated }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);
  const queryClient = useQueryClient();

  const setField = (field, value) => setDraft({ ...draft, [field]: value });

  const handleCreate = async () => {
    if (!draft.name.trim()) {
      toast.error("Customer name is required");
      return;
    }
    setSaving(true);
    try {
      const created = await base44.entities.Customer.create({
        ...draft,
        name: draft.name.trim(),
      });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      onCreated?.(created);
      toast.success("Customer added");
      setDraft(emptyDraft);
      setOpen(false);
    } catch (e) {
      toast.error(e?.message || "Could not create customer");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="gap-1.5 rounded-lg h-9 shrink-0">
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New Customer</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
          <div className="sm:col-span-2">
            <Label>Name</Label>
            <Input value={draft.name} onChange={(e) => setField("name", e.target.value)} className="rounded-lg" placeholder="Customer name" autoFocus />
          </div>
          <div>
            <Label>Phone</Label>
            <Input type="tel" value={draft.phone} onChange={(e) => setField("phone", e.target.value)} className="rounded-lg" placeholder="(480) 555-0123" />
          </div>
          <div>
            <Label>Email</Label>
            <Input type="email" value={draft.email} onChange={(e) => setField("email", e.target.value)} className="rounded-lg" placeholder="customer@email.com" />
          </div>
          <div className="sm:col-span-2">
            <Label>Address</Label>
            <Input value={draft.address} onChange={(e) => setField("address", e.target.value)} className="rounded-lg" placeholder="Street address" />
          </div>
          <div>
            <Label>City</Label>
            <Input value={draft.city} onChange={(e) => setField("city", e.target.value)} className="rounded-lg" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>State</Label>
              <Input value={draft.state} onChange={(e) => setField("state", e.target.value)} className="rounded-lg" />
            </div>
            <div>
              <Label>Zip</Label>
              <Input value={draft.zip} onChange={(e) => setField("zip", e.target.value)} className="rounded-lg" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleCreate} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Add Customer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}