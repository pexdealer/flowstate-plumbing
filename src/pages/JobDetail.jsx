import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate, Link, useOutletContext } from "react-router-dom";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft, Clock, MapPin, User, Wrench, Send, FileText,
  CheckCircle, Loader2, Camera, Receipt, ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import JobMediaManager from "@/components/jobs/JobMediaManager";
import { generateProposalToken, proposalUrl } from "@/lib/proposal";

const statusColors = {
  unscheduled: "bg-slate-100 text-slate-600 border-slate-200",
  scheduled: "bg-blue-50 text-blue-600 border-blue-200",
  dispatched: "bg-amber-50 text-amber-600 border-amber-200",
  in_progress: "bg-purple-50 text-purple-600 border-purple-200",
  completed: "bg-emerald-50 text-emerald-600 border-emerald-200",
  canceled: "bg-red-50 text-red-600 border-red-200",
};

const invoiceStatusStyles = {
  none: "bg-muted text-muted-foreground",
  draft: "bg-amber-50 text-amber-600 border-amber-200",
  sent: "bg-blue-50 text-blue-600 border-blue-200",
  paid: "bg-emerald-50 text-emerald-600 border-emerald-200",
  overdue: "bg-red-50 text-red-600 border-red-200",
};

const invoiceStatusLabels = {
  none: "No invoice",
  draft: "Draft",
  sent: "Sent",
  paid: "Paid",
  overdue: "Overdue",
};

export default function JobDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const tourRefs = useOutletContext();
  const [tab, setTab] = useState("details");

  const { data, isLoading } = useQuery({
    queryKey: ["job", id],
    queryFn: () => base44.entities.Job.filter({ id }),
  });

  const job = data?.[0];

  // Fetch linked invoice
  const { data: invoiceData } = useQuery({
    queryKey: ["invoice", job?.invoice_id],
    queryFn: () => job?.invoice_id ? base44.entities.Invoice.filter({ id: job.invoice_id }) : Promise.resolve([]),
    enabled: !!job?.invoice_id,
  });
  const invoice = invoiceData?.[0];

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["job", id] });
    queryClient.invalidateQueries({ queryKey: ["jobs"] });
  };

  // Status update
  const statusMutation = useMutation({
    mutationFn: (status) => base44.entities.Job.update(id, { status }),
    onSuccess: () => { invalidate(); toast.success("Status updated"); },
    onError: (e) => toast.error(e?.message || "Could not update status"),
  });

  // Photo mutations
  const photoMutation = useMutation({
    mutationFn: async ({ key, urls }) => {
      await base44.entities.Job.update(id, { [key]: urls });
      if (job.invoice_id) {
        await base44.entities.Invoice.update(job.invoice_id, { [key]: urls });
      }
    },
    onSuccess: () => { invalidate(); queryClient.invalidateQueries({ queryKey: ["invoice", job?.invoice_id] }); },
    onError: (e) => toast.error(e?.message || "Could not update photos"),
  });

  const addPhoto = (category, url) => {
    const key = category === "before" ? "photos_before" : "photos_after";
    const current = job[key] || [];
    photoMutation.mutate({ key, urls: [...current, url] });
  };

  const removePhoto = (category, url) => {
    const key = category === "before" ? "photos_before" : "photos_after";
    const current = job[key] || [];
    photoMutation.mutate({ key, urls: current.filter((u) => u !== url) });
  };

  // Invoice generation
  const invoiceMutation = useMutation({
    mutationFn: async () => {
      // Fetch the original estimate for line items
      let estimate = null;
      if (job.estimate_id) {
        const estData = await base44.entities.Estimate.filter({ id: job.estimate_id });
        estimate = estData?.[0];
      }
      // Fetch customer email
      let customerEmail = "";
      if (job.customer_id) {
        const custData = await base44.entities.Customer.filter({ id: job.customer_id });
        customerEmail = custData?.[0]?.email || "";
      }
      const token = generateProposalToken();
      const invoiceNumber = `INV-${Date.now().toString().slice(-6)}`;
      const inv = await base44.entities.Invoice.create({
        invoice_number: invoiceNumber,
        job_id: job.id,
        estimate_id: job.estimate_id || "",
        estimate_number: job.estimate_number || "",
        customer_name: job.customer_name || "",
        customer_address: job.customer_address || "",
        customer_phone: job.customer_phone || "",
        customer_email: customerEmail,
        job_type: job.job_type || "",
        job_description: job.job_description || "",
        photos_before: job.photos_before || [],
        photos_after: job.photos_after || [],
        line_items: estimate?.line_items || [],
        subtotal: estimate?.subtotal || job.total || 0,
        markup_percent: estimate?.markup_percent || 0,
        markup_amount: estimate?.markup_amount || 0,
        tax_percent: estimate?.tax_percent || 0,
        tax_amount: estimate?.tax_amount || 0,
        total: job.total || estimate?.total || 0,
        status: "draft",
        public_token: token,
        due_date: new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0],
      });
      // Link invoice to job
      await base44.entities.Job.update(id, { invoice_id: inv.id, invoice_status: "draft" });
      return inv;
    },
    onSuccess: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["invoice", job?.invoice_id] });
      toast.success("Invoice created");
    },
    onError: (e) => toast.error(e?.message || "Could not create invoice"),
  });

  // Send invoice (mark as sent)
  const sendInvoiceMutation = useMutation({
    mutationFn: async () => {
      if (!invoice) return;
      await base44.entities.Invoice.update(invoice.id, {
        status: "sent",
        sent_at: new Date().toISOString(),
      });
      await base44.entities.Job.update(id, { invoice_status: "sent" });
    },
    onSuccess: async () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["invoice", invoice?.id] });
      // Copy invoice link
      const invUrl = `${window.location.origin}/p/invoice/${invoice.public_token}`;
      try {
        await navigator.clipboard.writeText(invUrl);
        toast.success("Invoice sent & link copied");
      } catch {
        toast.success("Invoice sent");
      }
    },
    onError: (e) => toast.error(e?.message || "Could not send invoice"),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="text-center py-32">
        <h2 className="font-heading font-semibold text-foreground mb-2">Job not found</h2>
        <Link to="/"><Button variant="outline">Back to Dashboard</Button></Link>
      </div>
    );
  }

  const tabs = [
    { id: "details", label: "Details" },
    { id: "media", label: "Photos" },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" className="rounded-xl" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-display font-bold text-foreground">{job.title || "Untitled Job"}</h1>
              <Badge variant="outline" className={`capitalize ${statusColors[job.status]}`}>{job.status?.replace("_", " ")}</Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {job.estimate_number ? `Estimate #${job.estimate_number}` : ""}
              {job.created_date && ` · Created ${format(new Date(job.created_date), "MMM d, yyyy")}`}
            </p>
          </div>
        </div>
      </motion.div>

      {/* Status progress */}
      <motion.div ref={tourRefs?.jobStatusRef} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-2xl border border-border p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {["scheduled", "dispatched", "in_progress", "completed"].map((s, i) => {
            const isActive = job.status === s;
            const isDone = ["completed"].includes(job.status) && ["scheduled", "dispatched", "in_progress", "completed"].indexOf(s) <= ["scheduled", "dispatched", "in_progress", "completed"].indexOf(job.status);
            const isPast = ["scheduled", "dispatched", "in_progress"].indexOf(job.status) >= ["scheduled", "dispatched", "in_progress"].indexOf(s);
            const active = isActive || (isPast && job.status !== "canceled");
            return (
              <React.Fragment key={s}>
                {i > 0 && <Separator orientation="vertical" className="h-4 mx-1 hidden sm:block" />}
                <button
                  onClick={() => statusMutation.mutate(s)}
                  disabled={statusMutation.isPending}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all capitalize ${
                    active
                      ? s === "completed" ? "bg-emerald-100 text-emerald-700" : "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                >
                  {s.replace("_", " ")}
                </button>
              </React.Fragment>
            );
          })}
          {job.status === "canceled" && (
            <Badge variant="outline" className="border-red-200 text-red-600">Canceled</Badge>
          )}
        </div>
      </motion.div>

      {/* Invoice section — top level, always visible */}
      <motion.div ref={tourRefs?.jobInvoiceRef} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-2xl border border-border p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <h3 className="font-heading font-semibold text-card-foreground flex items-center gap-2">
            <Receipt className="w-5 h-5 text-muted-foreground" />
            Invoice
            {job.invoice_status && job.invoice_status !== "none" && (
              <Badge variant="outline" className={`ml-2 ${invoiceStatusStyles[job.invoice_status]}`}>
                {invoiceStatusLabels[job.invoice_status]}
              </Badge>
            )}
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            {(!job.invoice_id || job.invoice_status === "none") && job.status === "completed" && (
              <Button
                size="sm"
                className="gap-2 rounded-lg"
                onClick={() => invoiceMutation.mutate()}
                disabled={invoiceMutation.isPending}
              >
                {invoiceMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
                Generate
              </Button>
            )}
            {invoice && invoice.status === "draft" && (
              <Button
                size="sm"
                className="gap-2 rounded-lg"
                onClick={() => sendInvoiceMutation.mutate()}
                disabled={sendInvoiceMutation.isPending}
              >
                {sendInvoiceMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                Send
              </Button>
            )}
            {invoice && (invoice.status === "sent" || invoice.status === "paid") && (
              <>
                <a href={`/p/invoice/${invoice.public_token}`} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" size="sm" className="gap-2 rounded-lg">
                    <ExternalLink className="w-3.5 h-3.5" /> Preview
                  </Button>
                </a>
                {invoice.status === "sent" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-2 rounded-lg text-emerald-600 border-emerald-200"
                    onClick={() => {
                      base44.entities.Invoice.update(invoice.id, { status: "paid", paid_at: new Date().toISOString() }).then(() => {
                        base44.entities.Job.update(id, { invoice_status: "paid" }).then(() => {
                          invalidate();
                          queryClient.invalidateQueries({ queryKey: ["invoice", invoice.id] });
                          toast.success("Invoice marked as paid");
                        });
                      });
                    }}
                  >
                    <CheckCircle className="w-3.5 h-3.5" /> Paid
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
        {invoice ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-xs text-muted-foreground">Invoice #</span>
              <p className="font-medium">{invoice.invoice_number}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Due Date</span>
              <p className="font-medium">{invoice.due_date ? format(new Date(invoice.due_date), "MMM d, yyyy") : "—"}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Total</span>
              <p className="font-display font-bold text-lg text-primary">${(invoice.total || 0).toFixed(2)}</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {job.status === "completed"
              ? "The job is complete — generate an invoice to bill the customer."
              : "Complete the job first, then generate an invoice here."}
          </p>
        )}
      </motion.div>

      {/* Tabs */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex gap-1 bg-muted p-1 rounded-xl w-fit">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                tab === t.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </motion.div>

      {tab === "details" && (
        <div className="space-y-6">
          {/* Customer & Job info */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-2xl border border-border p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Customer</h3>
                <p className="font-heading font-semibold text-card-foreground text-lg">{job.customer_name || "—"}</p>
                {job.customer_address && (
                  <p className="text-sm text-muted-foreground mt-1 flex items-start gap-1.5">
                    <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {job.customer_address}
                  </p>
                )}
                {job.customer_phone && (
                  <p className="text-sm text-muted-foreground mt-1">{job.customer_phone}</p>
                )}
              </div>
              <div>
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Job Details</h3>
                <p className="font-medium text-card-foreground capitalize flex items-center gap-1.5">
                  <Wrench className="w-3.5 h-3.5 text-muted-foreground" />
                  {job.job_type?.replace(/_/g, " ") || "—"}
                </p>
                {job.job_description && <p className="text-sm text-muted-foreground mt-1">{job.job_description}</p>}
                <div className="flex gap-4 mt-3">
                  {job.scheduled_start && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      {format(new Date(job.scheduled_start), "MMM d, h:mm a")}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </motion.div>

          {/* Line items */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="bg-card rounded-2xl border border-border overflow-hidden">
            <div className="px-6 py-4 border-b border-border">
              <h3 className="font-heading font-semibold text-card-foreground">Line Items</h3>
            </div>
            {invoice?.line_items?.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase">Item</th>
                      <th className="text-right px-6 py-3 text-xs font-medium text-muted-foreground uppercase">Qty</th>
                      <th className="text-right px-6 py-3 text-xs font-medium text-muted-foreground uppercase">Price</th>
                      <th className="text-right px-6 py-3 text-xs font-medium text-muted-foreground uppercase">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {invoice.line_items.map((item, i) => (
                      <tr key={i} className="hover:bg-muted/20">
                        <td className="px-6 py-3 text-card-foreground">{item.description}</td>
                        <td className="px-6 py-3 text-right text-muted-foreground">{item.quantity}</td>
                        <td className="px-6 py-3 text-right text-muted-foreground">${(item.unit_price || 0).toFixed(2)}</td>
                        <td className="px-6 py-3 text-right font-medium text-card-foreground">${(item.total || 0).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="border-t border-border p-6">
                  <div className="max-w-xs ml-auto space-y-2">
                    <Row label="Subtotal" value={invoice.subtotal} />
                    {(invoice.tax_percent || 0) > 0 && <Row label={`Tax (${invoice.tax_percent}%)`} value={invoice.tax_amount} />}
                    <Separator />
                    <div className="flex justify-between items-center">
                      <span className="font-heading font-semibold text-card-foreground">Total</span>
                      <span className="text-2xl font-display font-bold text-primary">${(invoice.total || 0).toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-6 text-center text-sm text-muted-foreground">
                Line items will appear here once an invoice is generated.
              </div>
            )}
          </motion.div>

          {/* Notes */}
          {job.notes && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-card rounded-2xl border border-border p-6">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Notes</h3>
              <p className="text-sm text-card-foreground whitespace-pre-wrap">{job.notes}</p>
            </motion.div>
          )}
        </div>
      )}

      {tab === "media" && (
        <motion.div ref={tourRefs?.jobPhotosRef} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-2xl border border-border p-6">
          <JobMediaManager
            photosBefore={job.photos_before || []}
            photosAfter={job.photos_after || []}
            onAdd={addPhoto}
            onRemove={removePhoto}
            disabled={photoMutation.isPending}
          />
        </motion.div>
      )}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-card-foreground">${(value || 0).toFixed(2)}</span>
    </div>
  );
}