import React, { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { CheckCircle2, Clock, ShieldCheck, FileText, Camera } from "lucide-react";
import { format } from "date-fns";
import { BRAND_NAME, LOGO_URL } from "@/lib/branding";
import PdfDownloadButton from "@/components/public/PdfDownloadButton";

const typeLabels = {
  labor: "Labor",
  material: "Materials",
  equipment: "Equipment",
  other: "Other",
};

const categoryOrder = ["labor", "material", "equipment", "other"];

export default function PublicInvoice() {
  const { token } = useParams();
  const [state, setState] = useState({ status: "loading", invoice: null });
  const docRef = useRef(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const response = await base44.functions.invoke("getPublicInvoice", { token });
        if (!active) return;
        const invoice = response?.data?.invoice;
        if (!invoice) {
          setState({ status: "notfound", invoice: null });
          return;
        }
        setState({ status: "ready", invoice });
      } catch {
        if (!active) return;
        setState({ status: "notfound", invoice: null });
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
  const filename = `Invoice-${invoice.invoice_number || token}.pdf`;
  const isPaid = invoice.status === "paid";
  const balanceDue = Number.isInteger(invoice.balance_due_cents)
    ? invoice.balance_due_cents / 100
    : invoice.total || 0;

  // Group line items by category
  const categories = {};
  (invoice.line_items || []).forEach((item) => {
    const cat = item.type || "other";
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(item);
  });

  const hasPhotos =
    (invoice.photos_before && invoice.photos_before.length > 0) ||
    (invoice.photos_after && invoice.photos_after.length > 0);

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <div className="flex justify-end mb-4">
          <PdfDownloadButton targetRef={docRef} filename={filename} />
        </div>
        {/* Invoice document */}
        <div ref={docRef} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          {/* Header */}
          <div className="px-6 sm:px-10 pt-8 sm:pt-10 pb-6 border-b border-slate-100">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div className="flex items-center gap-3">
                <img src={LOGO_URL} alt={BRAND_NAME} className="h-14 sm:h-16 w-auto rounded-xl" />
                <div>
                  <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
                    {BRAND_NAME}
                  </h1>
                </div>
              </div>
              <div className="text-left sm:text-right">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Invoice</p>
                <p className="text-lg font-bold text-slate-900 mt-0.5">{invoice.invoice_number}</p>
                {invoice.sent_at && (
                  <p className="text-xs text-slate-400 mt-1">
                    Issued {format(new Date(invoice.sent_at), "MMM d, yyyy")}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Status banner */}
          <div className="px-6 sm:px-10 pt-6">
            {isPaid ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 flex items-start gap-3 text-sm text-emerald-800">
                <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">Paid in Full</p>
                  {invoice.paid_at && (
                    <p className="text-emerald-600 text-xs mt-0.5">
                      Paid on {format(new Date(invoice.paid_at), "MMMM d, yyyy")}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3 text-sm text-amber-800">
                <Clock className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">Payment Due</p>
                  {invoice.due_date && (
                    <p className="text-amber-600 text-xs mt-0.5">
                      Due by {format(new Date(invoice.due_date), "MMMM d, yyyy")}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Bill To + Invoice Details */}
          <div className="px-6 sm:px-10 py-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Bill To</h3>
                <p className="font-semibold text-slate-900 text-lg">{invoice.customer_name}</p>
                {invoice.customer_address && <p className="text-sm text-slate-500 mt-1">{invoice.customer_address}</p>}
                {invoice.customer_phone && <p className="text-sm text-slate-500 mt-0.5">{invoice.customer_phone}</p>}
              </div>
              <div className="sm:text-right">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Details</h3>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between sm:justify-end sm:gap-3">
                    <span className="text-slate-400 sm:order-1">Invoice #</span>
                    <span className="text-slate-700 font-medium sm:order-2">{invoice.invoice_number}</span>
                  </div>
                  {invoice.estimate_number && (
                    <div className="flex justify-between sm:justify-end sm:gap-3">
                      <span className="text-slate-400">Estimate #</span>
                      <span className="text-slate-700">{invoice.estimate_number}</span>
                    </div>
                  )}
                  {invoice.due_date && (
                    <div className="flex justify-between sm:justify-end sm:gap-3">
                      <span className="text-slate-400">Due Date</span>
                      <span className="text-slate-700">{format(new Date(invoice.due_date), "MMM d, yyyy")}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Scope of Work */}
          {invoice.job_description && (
            <div className="px-6 sm:px-10 py-6 border-t border-slate-100">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Scope of Work</h3>
              {invoice.job_type && (
                <p className="font-medium text-slate-900 capitalize mb-1">
                  {invoice.job_type.replace(/_/g, " ")}
                </p>
              )}
              <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">
                {invoice.job_description}
              </p>
            </div>
          )}

          {/* Before & After Photos */}
          {hasPhotos && (
            <div className="px-6 sm:px-10 py-6 border-t border-slate-100">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-4 flex items-center gap-2">
                <Camera className="w-3.5 h-3.5" /> Job Photos
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {invoice.photos_before && invoice.photos_before.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-slate-500 mb-2 uppercase tracking-wide">Before</p>
                    <div className="grid grid-cols-2 gap-2">
                      {invoice.photos_before.map((url, i) => (
                        <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                          <img
                            src={url}
                            alt={`Before ${i + 1}`}
                            className="w-full h-24 sm:h-28 object-cover rounded-lg border border-slate-200 hover:opacity-90 transition-opacity"
                          />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
                {invoice.photos_after && invoice.photos_after.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-slate-500 mb-2 uppercase tracking-wide">After</p>
                    <div className="grid grid-cols-2 gap-2">
                      {invoice.photos_after.map((url, i) => (
                        <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                          <img
                            src={url}
                            alt={`After ${i + 1}`}
                            className="w-full h-24 sm:h-28 object-cover rounded-lg border border-slate-200 hover:opacity-90 transition-opacity"
                          />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Charges — grouped by category */}
          {(invoice.line_items || []).length > 0 && (
            <div className="px-6 sm:px-10 py-6 border-t border-slate-100">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-4">Charges</h3>

              {categoryOrder.filter((cat) => categories[cat]).map((cat) => (
                <div key={cat} className="mb-5">
                  <p className="text-sm font-bold text-slate-700 mb-2">{typeLabels[cat]}</p>
                  <div className="space-y-1.5">
                    {categories[cat].map((item, i) => (
                      <div key={i} className="flex items-start justify-between text-sm pl-2 border-l-2 border-slate-100">
                        <div className="flex-1 min-w-0 pr-3">
                          <p className="text-slate-700">{item.description}</p>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {item.quantity} {item.quantity === 1 ? "unit" : "units"} × ${(item.unit_price || 0).toFixed(2)}
                          </p>
                        </div>
                        <span className="text-slate-700 font-medium whitespace-nowrap">
                          ${(item.total || 0).toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between pl-2 mt-1.5 text-xs text-slate-400">
                    <span>{typeLabels[cat]} Subtotal</span>
                    <span>
                      ${categories[cat].reduce((s, item) => s + (item.total || 0), 0).toFixed(2)}
                    </span>
                  </div>
                </div>
              ))}

              {/* Totals */}
              <div className="border-t border-slate-200 pt-4 mt-2">
                <div className="max-w-xs ml-auto space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Subtotal</span>
                    <span className="text-slate-700">${(invoice.subtotal || 0).toFixed(2)}</span>
                  </div>
                  {(invoice.discount_amount || 0) > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Cash discount ({invoice.cash_discount_percent}%)</span>
                      <span className="text-emerald-700">−${(invoice.discount_amount || 0).toFixed(2)}</span>
                    </div>
                  )}
                  {(invoice.tax_percent || 0) > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Tax ({invoice.tax_percent}%)</span>
                      <span className="text-slate-700">${(invoice.tax_amount || 0).toFixed(2)}</span>
                    </div>
                  )}
                  {(invoice.amount_paid_cents || 0) > 0 && (
                    <div className="flex justify-between text-sm text-emerald-700">
                      <span>Payments received</span>
                      <span>−${(invoice.amount_paid_cents / 100).toFixed(2)}</span>
                    </div>
                  )}
                  <div className="border-t border-slate-200 pt-2 flex justify-between items-center">
                    <span className="font-bold text-slate-900">Total Due</span>
                    <span className="text-2xl font-bold text-slate-900">
                      ${balanceDue.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Notes */}
          {invoice.customer_notes && (
            <div className="px-6 sm:px-10 py-6 border-t border-slate-100">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Notes</h3>
              <p className="text-sm text-slate-600 whitespace-pre-wrap">{invoice.customer_notes}</p>
            </div>
          )}

          {/* Footer */}
          <div className="px-6 sm:px-10 py-5 bg-slate-50 border-t border-slate-100">
            <p className="text-center text-xs text-slate-400 flex items-center justify-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" />
              This invoice was generated electronically and is a valid record of services rendered.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}