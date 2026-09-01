import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate, Link } from "react-router-dom";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft, Send, Copy, Check, ExternalLink, CheckCircle,
  Mail, MessageSquare, Link2, Loader2, MapPin, Phone, Wrench, Trash2,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { motion } from "framer-motion";

const statusStyles = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-primary/10 text-primary border-primary/20",
  paid: "bg-emerald-50 text-emerald-700 border-emerald-200",
  overdue: "bg-red-50 text-red-600 border-red-200",
};

export default function InvoiceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [emailInput, setEmailInput] = useState("");
  const [sending, setSending] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["invoice", id],
    queryFn: () => base44.entities.Invoice.filter({ id }),
  });

  const invoice = data?.[0];

  // Sync email input when invoice loads
  useEffect(() => {
    if (invoice?.customer_email) setEmailInput(invoice.customer_email);
  }, [invoice?.customer_email]);

  const { data: jobData } = useQuery({
    queryKey: ["job", invoice?.job_id],
    queryFn: () => invoice?.job_id ? base44.entities.Job.filter({ id: invoice.job_id }) : Promise.resolve([]),
    enabled: !!invoice?.job_id,
  });
  const job = jobData?.[0];

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["invoice", id] });
    queryClient.invalidateQueries({ queryKey: ["invoices"] });
  };

  const invoiceUrl = invoice?.public_token
    ? `${window.location.origin}/p/invoice/${invoice.public_token}`
    : null;

  const handleCopyLink = async () => {
    if (!invoiceUrl) return;
    try {
      await navigator.clipboard.writeText(invoiceUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      toast.success("Invoice link copied");
    } catch {
      toast.error("Could not copy link");
    }
  };

  const handleSendEmail = async () => {
    if (!invoice) return;
    const email = emailInput.trim();
    if (!email) {
      toast.error("Enter the customer's email address");
      return;
    }
    setSending(true);
    try {
      // Save email to invoice if changed
      if (email !== invoice.customer_email) {
        await base44.entities.Invoice.update(invoice.id, { customer_email: email });
      }
      await base44.functions.invoke("sendInvoiceEmail", {
        invoice_id: invoice.id,
        invoice_url: invoiceUrl,
      });
      invalidate();
      toast.success("Invoice emailed to customer");
    } catch (e) {
      toast.error(e?.message || "Could not send email");
    } finally {
      setSending(false);
    }
  };

  const handleText = async () => {
    if (!invoiceUrl) return;
    const message = `Your invoice ${invoice.invoice_number} for $${(invoice.total || 0).toFixed(2)} is ready: ${invoiceUrl}`;
    try {
      await navigator.clipboard.writeText(message);
    } catch {}
    if (invoice.customer_phone) {
      const smsUrl = `sms:${invoice.customer_phone}?&body=${encodeURIComponent(message)}`;
      window.location.href = smsUrl;
    }
    toast.success("Message ready — link copied to clipboard");
  };

  const markPaidMutation = useMutation({
    mutationFn: async () => {
      await base44.entities.Invoice.update(invoice.id, { status: "paid", paid_at: new Date().toISOString() });
      if (invoice.job_id) {
        await base44.entities.Job.update(invoice.job_id, { invoice_status: "paid" });
      }
    },
    onSuccess: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["job", invoice?.job_id] });
      toast.success("Invoice marked as paid");
    },
    onError: (e) => toast.error(e?.message || "Could not update"),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (invoice.job_id) {
        await base44.entities.Job.update(invoice.job_id, { invoice_id: "", invoice_status: "none" }).catch(() => {});
      }
      await base44.entities.Invoice.delete(invoice.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      toast.success("Invoice deleted");
      navigate("/invoices");
    },
    onError: (e) => toast.error(e?.message || "Could not delete invoice"),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="text-center py-32">
        <h2 className="font-heading font-semibold text-foreground mb-2">Invoice not found</h2>
        <Link to="/invoices"><Button variant="outline">Back to Invoices</Button></Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" className="rounded-xl" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-display font-bold text-foreground">
                {invoice.invoice_number || "Invoice"}
              </h1>
              <Badge variant="outline" className={`capitalize ${statusStyles[invoice.status] || statusStyles.draft}`}>
                {invoice.status || "draft"}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {invoice.customer_name || "—"}
              {invoice.created_date && ` · Created ${format(new Date(invoice.created_date), "MMM d, yyyy")}`}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {invoiceUrl && (
            <a href={invoiceUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" className="gap-2 rounded-xl">
                <ExternalLink className="w-4 h-4" /> Preview
              </Button>
            </a>
          )}
          {invoice.status === "sent" && (
            <Button
              className="gap-2 rounded-xl text-emerald-600 border-emerald-200"
              variant="outline"
              onClick={() => markPaidMutation.mutate()}
              disabled={markPaidMutation.isPending}
            >
              {markPaidMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              Mark Paid
            </Button>
          )}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="rounded-xl text-muted-foreground hover:text-destructive"
                aria-label="Delete invoice"
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this invoice?</AlertDialogTitle>
                <AlertDialogDescription>
                  This permanently removes {invoice.invoice_number || "this invoice"}. The linked job will be unlinked so it can be re-invoiced.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={() => deleteMutation.mutate()}
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </motion.div>

      {/* Send Invoice card */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-2xl border border-border p-6 space-y-5">
        <h3 className="font-heading font-semibold text-card-foreground">Send Invoice</h3>

        {/* Email */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Email</label>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              type="email"
              placeholder="customer@email.com"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              className="rounded-lg flex-1"
            />
            <Button
              className="gap-2 rounded-lg sm:w-auto"
              onClick={handleSendEmail}
              disabled={sending}
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
              Send Email
            </Button>
          </div>
        </div>

        <Separator />

        {/* Link + Text */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Button variant="outline" className="gap-2 rounded-lg flex-1" onClick={handleCopyLink}>
            {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Link2 className="w-4 h-4" />}
            {copied ? "Copied" : "Copy Link"}
          </Button>
          <Button variant="outline" className="gap-2 rounded-lg flex-1" onClick={handleText}>
            <MessageSquare className="w-4 h-4" />
            Text Message
          </Button>
        </div>

        {invoiceUrl && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted rounded-lg px-3 py-2">
            <Link2 className="w-3.5 h-3.5 shrink-0" />
            <code className="truncate">{invoiceUrl}</code>
          </div>
        )}

        {invoice.sent_at && (
          <p className="text-xs text-muted-foreground">
            Last sent {format(new Date(invoice.sent_at), "MMM d, yyyy 'at' h:mm a")}
            {invoice.viewed_at && ` · Viewed ${format(new Date(invoice.viewed_at), "MMM d")}`}
          </p>
        )}
      </motion.div>

      {/* Invoice summary */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="bg-card rounded-2xl border border-border p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Bill To</h3>
            <p className="font-heading font-semibold text-card-foreground text-lg">{invoice.customer_name || "—"}</p>
            {invoice.customer_address && (
              <p className="text-sm text-muted-foreground mt-1 flex items-start gap-1.5">
                <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {invoice.customer_address}
              </p>
            )}
            {invoice.customer_phone && (
              <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5" /> {invoice.customer_phone}
              </p>
            )}
            {invoice.customer_email && (
              <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5" /> {invoice.customer_email}
              </p>
            )}
          </div>
          <div>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Invoice Details</h3>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Invoice #</span>
                <span className="text-card-foreground font-medium">{invoice.invoice_number}</span>
              </div>
              {invoice.estimate_number && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Estimate #</span>
                  <span className="text-card-foreground">{invoice.estimate_number}</span>
                </div>
              )}
              {invoice.due_date && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Due Date</span>
                  <span className="text-card-foreground">{format(new Date(invoice.due_date), "MMM d, yyyy")}</span>
                </div>
              )}
              {invoice.job_type && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Job Type</span>
                  <span className="text-card-foreground capitalize">{invoice.job_type.replace(/_/g, " ")}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Total + Job link */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-card rounded-2xl border border-border p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Amount Due</p>
            <p className="text-3xl font-display font-bold text-primary mt-1">
              ${(invoice.total || 0).toFixed(2)}
            </p>
          </div>
          {job && (
            <Link to={`/jobs/${job.id}`}>
              <Button variant="outline" className="gap-2 rounded-xl">
                <Wrench className="w-4 h-4" /> View Job
              </Button>
            </Link>
          )}
        </div>
      </motion.div>
    </div>
  );
}