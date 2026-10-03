import React, { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, Loader2, ShieldCheck, FileText } from "lucide-react";
import { BRAND_NAME, LOGO_URL } from "@/lib/branding";
import PdfDownloadButton from "@/components/public/PdfDownloadButton";

// Public, unauthenticated page a customer opens from the link the plumber sends.
// All data access goes through Base44 backend functions (getProposal /
// acceptProposal / declineProposal) so the customer never needs an account and
// never gets direct access to the business's data. Those functions are created
// in the Base44 Builder — see docs/dispatch-automation.md.

const typeLabels = { material: "Material", labor: "Labor", equipment: "Equipment", other: "Other" };

export default function PublicProposal() {
  const { token } = useParams();
  const [state, setState] = useState({ status: "loading", estimate: null, business: null });
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [notConfigured, setNotConfigured] = useState(false);
  const docRef = useRef(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await base44.functions.invoke("getProposal", { token });
        if (!active) return;
        const data = res?.data || res;
        if (!data || !data.estimate) {
          setState({ status: "notfound" });
          return;
        }
        setState({ status: "ready", estimate: data.estimate, business: data.business || null });
      } catch (err) {
        if (!active) return;
        // 404 from the backend = no estimate for this token. Anything else
        // (e.g. the function isn't deployed yet) gets a distinct message so the
        // owner can tell "bad link" apart from "not set up".
        if (err?.status === 404) {
          setState({ status: "notfound" });
        } else {
          setNotConfigured(true);
          setState({ status: "error" });
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [token]);

  const est = state.estimate;
  const filename = `Proposal-${est?.estimate_number || token}.pdf`;
  const accepted = est?.status === "approved" || est?.accepted_at;
  const declined = est?.status === "declined" || est?.declined_at;

  const handleAccept = async () => {
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      await base44.functions.invoke("acceptProposal", { token, name: name.trim() });
      setState((s) => ({
        ...s,
        estimate: { ...s.estimate, status: "approved", accepted_at: new Date().toISOString(), accepted_by_name: name.trim() },
      }));
    } catch {
      setNotConfigured(true);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDecline = async () => {
    setSubmitting(true);
    try {
      await base44.functions.invoke("declineProposal", { token });
      setState((s) => ({ ...s, estimate: { ...s.estimate, status: "declined", declined_at: new Date().toISOString() } }));
    } catch {
      setNotConfigured(true);
    } finally {
      setSubmitting(false);
    }
  };

  if (state.status === "loading") {
    return (
      <Centered>
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </Centered>
    );
  }

  if (state.status === "notfound") {
    return (
      <Centered>
        <div className="text-center max-w-md">
          <FileText className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-slate-800 mb-2">Proposal not found</h1>
          <p className="text-slate-500 text-sm">
            This link may have expired or been mistyped. Please contact your plumber for an updated link.
          </p>
        </div>
      </Centered>
    );
  }

  if (state.status === "error") {
    return (
      <Centered>
        <div className="text-center max-w-md">
          <FileText className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-slate-800 mb-2">This proposal isn't available yet</h1>
          <p className="text-slate-500 text-sm">
            {notConfigured
              ? "The proposal service is being set up. Please check back shortly or contact your plumber."
              : "Something went wrong loading this proposal. Please try again."}
          </p>
        </div>
      </Centered>
    );
  }

  const businessName = state.business?.name || "Your Plumber";

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-3xl mx-auto px-5 pt-5 flex justify-end">
        <PdfDownloadButton targetRef={docRef} filename={filename} />
      </div>
      <div ref={docRef}>
      {/* Header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-5 py-5 flex items-center gap-3">
          <img src={LOGO_URL} alt={BRAND_NAME} className="h-12 w-12 rounded-xl object-cover" />
          <div>
            <h1 className="font-bold text-slate-900 leading-none">{BRAND_NAME}</h1>
            <p className="text-xs text-slate-400 mt-1">
              Proposal {est.estimate_number ? `#${est.estimate_number}` : ""}
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-5 py-8 space-y-6">
        {/* Status banner */}
        {accepted && (
          <Banner tone="emerald" icon={CheckCircle2}>
            You accepted this proposal{est.accepted_by_name ? ` as ${est.accepted_by_name}` : ""}. Your plumber has
            been notified and will be in touch to schedule.
          </Banner>
        )}
        {declined && !accepted && (
          <Banner tone="red" icon={FileText}>
            You declined this proposal. If this was a mistake, contact your plumber.
          </Banner>
        )}

        {/* Customer + job */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Prepared for</h3>
              <p className="font-semibold text-slate-900 text-lg">{est.customer_name}</p>
              {est.customer_address && <p className="text-sm text-slate-500 mt-1">{est.customer_address}</p>}
            </div>
            <div>
              <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Job</h3>
              <p className="font-medium text-slate-900 capitalize">{est.job_type?.replace(/_/g, " ")}</p>
              {est.job_description && <p className="text-sm text-slate-500 mt-1">{est.job_description}</p>}
            </div>
          </div>
        </div>

        {/* Line items */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h3 className="font-semibold text-slate-900">What's included</h3>
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
                {(est.line_items || []).map((item, i) => (
                  <tr key={i}>
                    <td className="px-6 py-3 text-slate-700">
                      <span className="text-slate-400 text-xs mr-2">{typeLabels[item.type] || item.type}</span>
                      {item.description}
                    </td>
                    <td className="px-6 py-3 text-right text-slate-500">{item.quantity}</td>
                    <td className="px-6 py-3 text-right font-medium text-slate-800">${(item.total || 0).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-slate-100 p-6">
            <div className="max-w-xs ml-auto space-y-2">
              <Row label="Subtotal" value={est.subtotal} />
              {(est.tax_percent || 0) > 0 && <Row label={`Tax (${est.tax_percent}%)`} value={est.tax_amount} />}
              <div className="border-t border-slate-100 pt-2 flex justify-between items-center">
                <span className="font-semibold text-slate-900">Total</span>
                <span className="text-2xl font-bold text-slate-900">${(est.total || 0).toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Accept / decline */}
        {!accepted && !declined && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <h3 className="font-semibold text-slate-900 mb-1">Ready to move forward?</h3>
            <p className="text-sm text-slate-500 mb-5">
              Type your full name to accept this proposal. This acts as your electronic signature.
            </p>
            <div className="space-y-4">
              <div>
                <Label htmlFor="sig">Your full name</Label>
                <Input
                  id="sig"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jane Doe"
                  className="mt-1 h-12"
                />
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  onClick={handleAccept}
                  disabled={submitting || !name.trim()}
                  className="h-12 flex-1 gap-2 bg-emerald-600 hover:bg-emerald-700"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Accept proposal
                </Button>
                <Button onClick={handleDecline} disabled={submitting} variant="outline" className="h-12">
                  Decline
                </Button>
              </div>
              <p className="text-xs text-slate-400 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" /> Your acceptance is recorded with a timestamp for both parties.
              </p>
            </div>
          </div>
        )}

      </div>
      </div>
    </div>
  );
}

function Centered({ children }) {
  return <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">{children}</div>;
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-700">${(value || 0).toFixed(2)}</span>
    </div>
  );
}

function Banner({ tone, icon: Icon, children }) {
  const tones = {
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-800",
    red: "bg-red-50 border-red-200 text-red-700",
  };
  return (
    <div className={`rounded-2xl border p-4 flex items-start gap-3 text-sm ${tones[tone]}`}>
      <Icon className="w-5 h-5 flex-shrink-0 mt-0.5" />
      <p>{children}</p>
    </div>
  );
}