import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Plus, Save } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import LineItemRow from "@/components/estimates/LineItemRow";

const JOB_TYPES = [
  { value: "repair", label: "Repair" },
  { value: "installation", label: "Installation" },
  { value: "maintenance", label: "Maintenance" },
  { value: "remodel", label: "Remodel" },
  { value: "new_construction", label: "New Construction" },
  { value: "emergency", label: "Emergency" },
  { value: "inspection", label: "Inspection" },
  { value: "other", label: "Other" },
];

const emptyItem = { type: "material", description: "", quantity: 1, unit_price: 0, total: 0 };

export default function EstimateForm() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [form, setForm] = useState({
    estimate_number: "",
    customer_id: "",
    customer_name: "",
    customer_address: "",
    job_type: "repair",
    job_description: "",
    line_items: [{ ...emptyItem }],
    markup_percent: 15,
    tax_percent: 0,
    status: "draft",
    valid_until: "",
    notes: "",
  });

  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: () => base44.entities.Customer.list("-created_date", 200),
  });

  const { data: existingEstimate } = useQuery({
    queryKey: ["estimate", id],
    queryFn: () => base44.entities.Estimate.filter({ id }),
    enabled: isEdit,
  });

  useEffect(() => {
    if (existingEstimate && existingEstimate.length > 0) {
      const est = existingEstimate[0];
      setForm({
        estimate_number: est.estimate_number || "",
        customer_id: est.customer_id || "",
        customer_name: est.customer_name || "",
        customer_address: est.customer_address || "",
        job_type: est.job_type || "repair",
        job_description: est.job_description || "",
        line_items: est.line_items?.length ? est.line_items : [{ ...emptyItem }],
        markup_percent: est.markup_percent ?? 15,
        tax_percent: est.tax_percent ?? 0,
        status: est.status || "draft",
        valid_until: est.valid_until || "",
        notes: est.notes || "",
      });
    }
  }, [existingEstimate]);

  // Auto-generate estimate number for new estimates
  useEffect(() => {
    if (!isEdit && !form.estimate_number) {
      const num = `EST-${Date.now().toString().slice(-6)}`;
      setForm(prev => ({ ...prev, estimate_number: num }));
    }
  }, [isEdit]);

  const subtotal = form.line_items.reduce((s, i) => s + (i.total || 0), 0);
  const markupAmount = subtotal * ((form.markup_percent || 0) / 100);
  const afterMarkup = subtotal + markupAmount;
  const taxAmount = afterMarkup * ((form.tax_percent || 0) / 100);
  const grandTotal = afterMarkup + taxAmount;

  const handleCustomerSelect = (customerId) => {
    const c = customers.find((c) => c.id === customerId);
    if (c) {
      setForm({
        ...form,
        customer_id: c.id,
        customer_name: c.name,
        customer_address: [c.address, c.city, c.state, c.zip].filter(Boolean).join(", "),
      });
    }
  };

  const updateLineItem = (index, updated) => {
    const items = [...form.line_items];
    items[index] = updated;
    setForm({ ...form, line_items: items });
  };

  const removeLineItem = (index) => {
    setForm({ ...form, line_items: form.line_items.filter((_, i) => i !== index) });
  };

  const addLineItem = () => {
    setForm({ ...form, line_items: [...form.line_items, { ...emptyItem }] });
  };

  const saveMutation = useMutation({
    mutationFn: (data) => isEdit
      ? base44.entities.Estimate.update(id, data)
      : base44.entities.Estimate.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["estimates"] });
      toast.success(isEdit ? "Estimate updated" : "Estimate created");
      navigate("/estimates");
    },
  });

  const handleSave = (status) => {
    const payload = {
      ...form,
      subtotal,
      markup_amount: markupAmount,
      tax_amount: taxAmount,
      total: grandTotal,
      status: status || form.status,
    };
    saveMutation.mutate(payload);
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-4">
        <Button variant="ghost" size="icon" className="rounded-xl" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">{isEdit ? "Edit Estimate" : "New Estimate"}</h1>
          <p className="text-muted-foreground text-sm">Fill in the details below</p>
        </div>
      </motion.div>

      {/* Job Info */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-card rounded-2xl border border-border p-6 space-y-5">
        <h2 className="font-heading font-semibold text-card-foreground">Job Information</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label>Estimate #</Label>
            <Input value={form.estimate_number} onChange={(e) => setForm({ ...form, estimate_number: e.target.value })} className="rounded-lg" />
          </div>
          <div>
            <Label>Job Type</Label>
            <Select value={form.job_type} onValueChange={(v) => setForm({ ...form, job_type: v })}>
              <SelectTrigger className="rounded-lg"><SelectValue /></SelectTrigger>
              <SelectContent>
                {JOB_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <Label>Job Description</Label>
          <Textarea value={form.job_description} onChange={(e) => setForm({ ...form, job_description: e.target.value })} rows={3} className="rounded-lg" placeholder="Describe the scope of work..." />
        </div>
      </motion.div>

      {/* Customer */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="bg-card rounded-2xl border border-border p-6 space-y-5">
        <h2 className="font-heading font-semibold text-card-foreground">Customer</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label>Select Customer</Label>
            <Select value={form.customer_id} onValueChange={handleCustomerSelect}>
              <SelectTrigger className="rounded-lg"><SelectValue placeholder="Choose a customer..." /></SelectTrigger>
              <SelectContent>
                {customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Or Enter Name</Label>
            <Input value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} className="rounded-lg" placeholder="Customer name" />
          </div>
        </div>
        <div>
          <Label>Job Site Address</Label>
          <Input value={form.customer_address} onChange={(e) => setForm({ ...form, customer_address: e.target.value })} className="rounded-lg" placeholder="Address" />
        </div>
      </motion.div>

      {/* Line Items */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-card rounded-2xl border border-border p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-heading font-semibold text-card-foreground">Line Items</h2>
          <Button type="button" variant="outline" size="sm" className="gap-2 rounded-lg" onClick={addLineItem}>
            <Plus className="w-3.5 h-3.5" /> Add Item
          </Button>
        </div>

        {/* Header row */}
        <div className="hidden sm:grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground px-1">
          <div className="col-span-2">Type</div>
          <div className="col-span-4">Description</div>
          <div className="col-span-2">Qty</div>
          <div className="col-span-2">Unit Price</div>
          <div className="col-span-1 text-right">Total</div>
          <div className="col-span-1" />
        </div>

        <div className="space-y-2">
          {form.line_items.map((item, i) => (
            <LineItemRow key={i} item={item} index={i} onChange={updateLineItem} onRemove={removeLineItem} />
          ))}
        </div>
      </motion.div>

      {/* Totals */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="bg-card rounded-2xl border border-border p-6">
        <div className="max-w-xs ml-auto space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="font-medium text-card-foreground">${subtotal.toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between text-sm gap-3">
            <span className="text-muted-foreground">Markup</span>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={form.markup_percent}
                onChange={(e) => setForm({ ...form, markup_percent: parseFloat(e.target.value) || 0 })}
                className="w-20 h-8 text-sm text-right rounded-lg"
                min="0"
                step="1"
              />
              <span className="text-muted-foreground">%</span>
              <span className="font-medium text-card-foreground w-24 text-right">${markupAmount.toFixed(2)}</span>
            </div>
          </div>
          <div className="flex items-center justify-between text-sm gap-3">
            <span className="text-muted-foreground">Tax</span>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={form.tax_percent}
                onChange={(e) => setForm({ ...form, tax_percent: parseFloat(e.target.value) || 0 })}
                className="w-20 h-8 text-sm text-right rounded-lg"
                min="0"
                step="0.1"
              />
              <span className="text-muted-foreground">%</span>
              <span className="font-medium text-card-foreground w-24 text-right">${taxAmount.toFixed(2)}</span>
            </div>
          </div>
          <div className="border-t border-border pt-3 flex justify-between items-center">
            <span className="font-heading font-semibold text-card-foreground">Total</span>
            <span className="text-2xl font-display font-bold text-primary">${grandTotal.toFixed(2)}</span>
          </div>
        </div>
      </motion.div>

      {/* Notes & Valid Until */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="bg-card rounded-2xl border border-border p-6 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label>Valid Until</Label>
            <Input type="date" value={form.valid_until} onChange={(e) => setForm({ ...form, valid_until: e.target.value })} className="rounded-lg" />
          </div>
        </div>
        <div>
          <Label>Notes</Label>
          <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} className="rounded-lg" placeholder="Any additional notes..." />
        </div>
      </motion.div>

      {/* Actions */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }} className="flex flex-col sm:flex-row gap-3 justify-end pb-8">
        <Button variant="outline" onClick={() => navigate(-1)} className="rounded-xl">
          Cancel
        </Button>
        <Button variant="secondary" onClick={() => handleSave("draft")} disabled={saveMutation.isPending} className="rounded-xl gap-2">
          <Save className="w-4 h-4" /> Save Draft
        </Button>
        <Button onClick={() => handleSave("sent")} disabled={saveMutation.isPending} className="rounded-xl gap-2 shadow-lg shadow-primary/20">
          Save & Send
        </Button>
      </motion.div>
    </div>
  );
}