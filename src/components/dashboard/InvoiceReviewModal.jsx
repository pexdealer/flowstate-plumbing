import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, Send, Mail, MapPin, Wrench, AlertTriangle } from "lucide-react";

const typeLabels = {
  labor: "Labor",
  material: "Materials",
  equipment: "Equipment",
  other: "Other",
};

export default function InvoiceReviewModal({ invoice, onClose, onApproved }) {
  const [notes, setNotes] = useState(invoice.notes || "(Customize notes later)");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setNotes(invoice.notes || "(Customize notes later)");
  }, [invoice.id]);

  const hasEmail = !!invoice.customer_email;
  const invoiceUrl = invoice.public_token
    ? `${window.location.origin}/p/invoice/${invoice.public_token}`
    : null;

  const handleApprove = async () => {
    setSending(true);
    setError(null);
    try {
      // Save notes
      await base44.entities.Invoice.update(invoice.id, { notes });

      if (hasEmail) {
        // sendInvoiceEmail handles marking as sent + emailing
        await base44.functions.invoke("sendInvoiceEmail", {
          invoice_id: invoice.id,
          invoice_url: invoiceUrl,
        });
      } else {
        // No email on file — mark as sent manually
        await base44.entities.Invoice.update(invoice.id, {
          status: "sent",
          sent_at: new Date().toISOString(),
        });
        if (invoice.job_id) {
          await base44.entities.Job.update(invoice.job_id, { invoice_status: "sent" });
        }
      }
      onApproved();
    } catch (e) {
      console.error(e);
      setError(e?.message || "Could not send the invoice. It remains a draft — please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Review Invoice
            <span className="text-sm font-normal text-muted-foreground">#{invoice.invoice_number}</span>
          </DialogTitle>
          <DialogDescription>
            Verify the details, adjust any notes, then approve to send to the customer.
          </DialogDescription>
        </DialogHeader>

        {/* Customer */}
        <div className="space-y-1">
          <p className="font-heading font-semibold text-card-foreground">{invoice.customer_name}</p>
          {invoice.customer_address && (
            <p className="text-sm text-muted-foreground flex items-start gap-1.5">
              <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {invoice.customer_address}
            </p>
          )}
          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
            {invoice.job_type && (
              <span className="flex items-center gap-1 capitalize">
                <Wrench className="w-3.5 h-3.5" /> {invoice.job_type.replace(/_/g, " ")}
              </span>
            )}
            {hasEmail ? (
              <span className="flex items-center gap-1 text-emerald-600">
                <Mail className="w-3.5 h-3.5" /> {invoice.customer_email}
              </span>
            ) : (
              <span className="flex items-center gap-1 text-amber-600">
                <Mail className="w-3.5 h-3.5" /> No email on file
              </span>
            )}
          </div>
        </div>

        {/* Line items */}
        {(invoice.line_items || []).length > 0 && (
          <div className="rounded-xl border border-border overflow-hidden">
            <div className="max-h-40 overflow-y-auto">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-border">
                  {(invoice.line_items || []).map((item, i) => (
                    <tr key={i} className="hover:bg-muted/20">
                      <td className="px-3 py-2">
                        <p className="text-card-foreground">{item.description}</p>
                        <Badge variant="secondary" className="text-[10px] mt-0.5">
                          {typeLabels[item.type] || item.type}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-right font-medium whitespace-nowrap">
                        ${(item.total || 0).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Total */}
        <div className="flex items-center justify-between bg-muted/30 rounded-xl px-4 py-3">
          <span className="font-heading font-semibold text-card-foreground">Total Due</span>
          <span className="text-2xl font-display font-bold text-primary">
            ${(invoice.total || 0).toFixed(2)}
          </span>
        </div>

        {/* Notes */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Invoice Notes
          </label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="resize-none"
            placeholder="Add any notes for the customer..."
          />
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onClose} disabled={sending}>
            Cancel
          </Button>
          <Button className="gap-2" onClick={handleApprove} disabled={sending}>
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {hasEmail ? "Approve & Send" : "Approve & Mark Sent"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}