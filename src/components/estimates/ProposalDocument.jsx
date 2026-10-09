import React, { forwardRef } from "react";
import { BRAND_NAME, LOGO_URL } from "@/lib/branding";
import { format } from "date-fns";

const typeLabels = { material: "Material", labor: "Labor", equipment: "Equipment", other: "Other" };

// Off-screen customer-facing proposal document. Mirrors the public proposal
// page so the "PDF" button on Estimate Detail downloads exactly what the
// customer would see on their link.
const ProposalDocument = forwardRef(function ProposalDocument({ estimate }, ref) {
  const items = Array.isArray(estimate.line_items) ? estimate.line_items : [];
  const internalSubtotal = Number(estimate.subtotal) || 0;
  const customerSubtotal = internalSubtotal + (Number(estimate.markup_amount) || 0);
  const multiplier = internalSubtotal > 0 ? customerSubtotal / internalSubtotal : 1;
  let allocated = 0;
  const lineItems = items.map((item, index) => {
    const quantity = Number(item.quantity) || 0;
    const internalTotal = Number(item.total) || quantity * (Number(item.unit_price) || 0);
    const isLast = index === items.length - 1;
    const total = isLast
      ? Math.round((customerSubtotal - allocated) * 100) / 100
      : Math.round(internalTotal * multiplier * 100) / 100;
    allocated = Math.round((allocated + total) * 100) / 100;
    return {
      ...item,
      total,
      unit_price: quantity > 0 ? Math.round((total / quantity) * 100) / 100 : total,
    };
  });
  const discount = Number(estimate.discount_amount) || 0;

  return (
    <div className="fixed -left-[9999px] top-0 w-[800px]" aria-hidden="true">
      <div ref={ref} className="bg-white">
        {/* Header */}
        <div className="border-b border-slate-200 px-8 py-6 flex items-center gap-3">
          <img src={LOGO_URL} alt={BRAND_NAME} className="h-12 w-12 rounded-xl object-cover" />
          <div>
            <h1 className="text-xl font-bold text-slate-900 leading-none">{BRAND_NAME}</h1>
            <p className="text-xs text-slate-400 mt-1">
              Proposal {estimate.estimate_number ? `#${estimate.estimate_number}` : ""}
            </p>
          </div>
        </div>

        <div className="px-8 py-6 space-y-5">
          {/* Customer + job */}
          <div className="grid grid-cols-2 gap-6">
            <div>
              <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">Prepared for</h3>
              <p className="font-semibold text-slate-900 text-lg">{estimate.customer_name}</p>
              {estimate.customer_address && <p className="text-sm text-slate-500 mt-0.5">{estimate.customer_address}</p>}
            </div>
            <div>
              <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">Job</h3>
              <p className="font-medium text-slate-900 capitalize">{estimate.job_type?.replace(/_/g, " ")}</p>
              {estimate.job_description && <p className="text-sm text-slate-500 mt-0.5 whitespace-pre-wrap">{estimate.job_description}</p>}
            </div>
          </div>

          {/* Line items */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left">
                  <th className="px-4 py-2.5 text-xs font-medium text-slate-400 uppercase">Item</th>
                  <th className="px-4 py-2.5 text-xs font-medium text-slate-400 uppercase text-right">Qty</th>
                  <th className="px-4 py-2.5 text-xs font-medium text-slate-400 uppercase text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lineItems.map((item, i) => (
                  <tr key={i}>
                    <td className="px-4 py-2.5 text-slate-700">
                      <span className="text-slate-400 text-xs mr-2">{typeLabels[item.type] || item.type}</span>
                      {item.description}
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-500">{item.quantity}</td>
                    <td className="px-4 py-2.5 text-right font-medium text-slate-800">${(item.total || 0).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="max-w-xs ml-auto space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Subtotal</span>
              <span className="text-slate-700">${customerSubtotal.toFixed(2)}</span>
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Cash discount ({Number(estimate.cash_discount_percent) || 0}%)</span>
                <span className="text-emerald-700">−${discount.toFixed(2)}</span>
              </div>
            )}
            {(Number(estimate.tax_percent) || 0) > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Tax ({estimate.tax_percent}%)</span>
                <span className="text-slate-700">${(Number(estimate.tax_amount) || 0).toFixed(2)}</span>
              </div>
            )}
            <div className="border-t border-slate-200 pt-2 flex justify-between items-center">
              <span className="font-semibold text-slate-900">Total</span>
              <span className="text-2xl font-bold text-slate-900">${(Number(estimate.total) || 0).toFixed(2)}</span>
            </div>
          </div>

          {estimate.customer_notes && (
            <div>
              <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">Notes</h3>
              <p className="text-sm text-slate-600 whitespace-pre-wrap">{estimate.customer_notes}</p>
            </div>
          )}
          {estimate.valid_until && (
            <p className="text-xs text-slate-400">Valid until {format(new Date(estimate.valid_until), "MMMM d, yyyy")}.</p>
          )}
        </div>
      </div>
    </div>
  );
});

export default ProposalDocument;