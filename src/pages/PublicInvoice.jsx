import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Wrench, FileText, CheckCircle2, Clock, ShieldCheck } from "lucide-react";
import { format } from "date-fns";

export default function PublicInvoice() {
  const { token } = useParams();
  const [state, setState] = useState({ status: "loading", invoice: null });

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        // Fetch invoice by public token
        const invoices = await base44.entities.Invoice.filter({ public_token: token });
        if (!active) return;
        if (!invoices || !invoices.length) {
          setState({ status: "notfound" });
          return;
        }
        const invoice = invoices[0];
        // Record first view
        if (!invoice.viewed_at) {
          base44.entities.Invoice.update(invoice.id, { viewed_at: new Date().toISOString() }).catch(() => {});
        }
        setState({ status: "ready", invoice });
      } catch {
        if (!active) return;
        setState({ status: "notfound" });
      }
    })();
    return () => { active = false; };
  }, [token]);

  if (state.status === "loading") {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
      </div>
    );
  }

  if (state.status === "notfound" || !state.invoice) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <FileText className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-slate-800 mb-2">Invoice not found</h1>
          <p className="text-slate-500 text-sm">This link may have expired. Please contact your plumber for an updated link.</p>
        </div>
      </div>
    );
  }

  const { invoice } = state;
  const isPaid = invoice.status === "paid";

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-5 py-5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center">
            <Wrench className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-slate-900 leading-none">PipeFlow Plumbing</h1>
            <p className="text-xs text-slate-400 mt-1">Invoice {invoice.invoice_number}</p>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-5 py-8 space-y-6">
        {/* Status banner */}
        {isPaid && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 flex items-start gap-3 text-sm text-emerald-800">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Paid</p>
              {invoice.paid_at && (
                <p className="text-emerald-600 text-xs mt-0.5">Paid on {format(new Date(invoice.paid_at), "MMMM d, yyyy")}</p>
              )}
            </div>
          </div>
        )}

        {!isPaid && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3 text-sm text-amber-800">
            <Clock className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Payment Due</p>
              {invoice.due_date && (
                <p className="text-amber-600 text-xs mt-0.5">Due by {format(new Date(invoice.due_date), "MMMM d, yyyy")}</p>
              )}
            </div>
          </div>
        )}

        {/* Invoice details */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Bill To</h3>
              <p className="font-semibold text-slate-900 text-lg">{invoice.customer_name}</p>
              {invoice.customer_address && <p className="text-sm text-slate-500 mt-1">{invoice.customer_address}</p>}
            </div>
            <div>
              <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Invoice Details</h3>
              <div className="space-y-1.5 text-sm">
                <p className="text-slate-700"><span className="text-slate-400">Invoice #</span> {invoice.invoice_number}</p>
                {invoice.estimate_number && <p className="text-slate-700"><span className="text-slate-400">Estimate #</span> {invoice.estimate_number}</p>}
                {invoice.due_date && <p className="text-slate-700"><span className="text-slate-400">Due Date</span> {format(new Date(invoice.due_date), "MMM d, yyyy")}</p>}
                {invoice.sent_at && <p className="text-slate-700"><span className="text-slate-400">Issued</span> {format(new Date(invoice.sent_at), "MMM d, yyyy")}</p>}
              </div>
            </div>
          </div>
        </div>

        {/* Work description */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Work Performed</h3>
          <p className="font-medium text-slate-900 capitalize">{invoice.job_type?.replace(/_/g, " ")}</p>
          {invoice.job_description && <p className="text-sm text-slate-500 mt-1">{invoice.job_description}</p>}
        </div>

        {/* Line Items */}
        {(invoice.line_items || []).length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-900">Charges</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/60 text-left">
                    <th className="px-6 py-3 text-xs font-medium text-slate-400 uppercase">Item</th>
                    <th className="px-6 py-3 text-xs font-medium text-slate-400 uppercase text-right">Qty</th>
                    <th className="px-6 py-3 text-xs font-medium text-slate-400 uppercase text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {invoice.line_items.map((item, i) => (
                    <tr key={i}>
                      <td className="px-6 py-3 text-slate-700">{item.description}</td>
                      <td className="px-6 py-3 text-right text-slate-500">{item.quantity}</td>
                      <td className="px-6 py-3 text-right font-medium text-slate-800">${(item.total || 0).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t border-slate-100 p-6">
              <div className="max-w-xs ml-auto space-y-2">
                <Row label="Subtotal" value={invoice.subtotal} />
                {(invoice.tax_percent || 0) > 0 && <Row label={`Tax (${invoice.tax_percent}%)`} value={invoice.tax_amount} />}
                <div className="border-t border-slate-100 pt-2 flex justify-between items-center">
                  <span className="font-semibold text-slate-900">Total Due</span>
                  <span className="text-2xl font-bold text-slate-900">${(invoice.total || 0).toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {invoice.notes && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Notes</h3>
            <p className="text-sm text-slate-600">{invoice.notes}</p>
          </div>
        )}

        <p className="text-center text-xs text-slate-400 pb-6 flex items-center justify-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5" /> Powered by PipeFlow Plumbing
        </p>
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-700">${(value || 0).toFixed(2)}</span>
    </div>
  );
}