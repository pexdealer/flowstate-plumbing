import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate, Link } from "react-router-dom";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft, Pencil, CheckCircle, XCircle, Send, Copy, Check,
  Eye, ExternalLink, CalendarPlus, Download, ClipboardList,
} from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { proposalUrl } from "@/lib/proposal";
import PdfDownloadButton from "@/components/public/PdfDownloadButton";
import ProposalDocument from "@/components/estimates/ProposalDocument";
import { calendarLinksForJob, downloadICS, eventFromJob } from "@/lib/calendar";

const statusStyles = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-primary/10 text-primary border-primary/20",
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  declined: "bg-red-50 text-red-600 border-red-200",
  expired: "bg-amber-50 text-amber-600 border-amber-200",
};

const typeLabels = { material: "Material", labor: "Labor", equipment: "Equipment", other: "Other" };

export default function EstimateDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  const docRef = React.useRef(null);

  const { data: est, isLoading } = useQuery({
    queryKey: ["estimate", id],
    queryFn: () => base44.entities.Estimate.get(id).catch(() => null),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["estimate", id] });
    queryClient.invalidateQueries({ queryKey: ["estimates"] });
  };

  // Create an immutable customer version. Email delivery is recorded only
  // after the provider accepts it; manual links remain prepared, not sent.
  const sendMutation = useMutation({
    mutationFn: async () => {
      const response = await base44.functions.invoke("sendProposal", {
        estimate_id: id,
        channel: est.customer_email ? "email" : "manual_link",
      });
      return response?.data;
    },
    onSuccess: async (result) => {
      invalidate();
      const url = result?.url;
      if (!url) return;
      try {
        await navigator.clipboard.writeText(url);
        toast.success(result.delivered ? "Proposal emailed; link copied" : "Customer link prepared and copied");
      } catch {
        toast.success(result.delivered ? "Proposal emailed to customer" : "Customer link prepared");
      }
    },
    onError: (e) => toast.error(e?.message || "Could not create the link"),
  });

  // Add the accepted estimate to the dispatch board as a Job, then point the
  // estimate at it. The calendar buttons work with or without this step.
  const createJobMutation = useMutation({
    mutationFn: async () => {
      const job = await base44.entities.Job.create({
        title: `${(est.job_type || "Job").replace(/_/g, " ")} — ${est.customer_name || "Customer"}`,
        estimate_id: est.id,
        estimate_number: est.estimate_number,
        customer_id: est.customer_id,
        customer_name: est.customer_name,
        customer_address: est.customer_address,
        job_type: est.job_type,
        job_description: est.job_description,
        line_items: est.line_items,
        total: est.total,
        status: "unscheduled",
      });
      await base44.entities.Estimate.update(id, { job_id: job.id });
      return job;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Job added to your dispatch board");
    },
    onError: (e) => toast.error(e?.message || "Could not create the job"),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!est) {
    return (
      <div className="text-center py-32">
        <h2 className="font-heading font-semibold text-foreground mb-2">Estimate not found</h2>
        <Link to="/estimates"><Button variant="outline">Back to Estimates</Button></Link>
      </div>
    );
  }

  const accepted = est.status === "approved" || !!est.accepted_at;
  const link = est.public_token ? proposalUrl(est.public_token) : null;
  const calendar = calendarLinksForJob(est);

  const copyLink = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy link");
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" className="rounded-xl" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-display font-bold text-foreground">
                {est.estimate_number ? `#${est.estimate_number}` : "Estimate"}
              </h1>
              <Badge variant="outline" className={`capitalize ${statusStyles[est.status] || statusStyles.draft}`}>
                {est.status || "draft"}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Created {format(new Date(est.created_date), "MMM d, yyyy")}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PdfDownloadButton targetRef={docRef} label="PDF" filename={`Proposal-${est.estimate_number || id}.pdf`} className="rounded-xl" />
          <Button variant="outline" className="gap-2 rounded-xl" onClick={() => sendMutation.mutate()} disabled={sendMutation.isPending}>
            <Send className="w-4 h-4" /> {est.sent_at ? "Resend link" : "Send"}
          </Button>
          {!accepted && (
            <Link to={`/estimates/${id}/edit`}>
              <Button className="gap-2 rounded-xl">
                <Pencil className="w-4 h-4" /> Edit
              </Button>
            </Link>
          )}
        </div>
      </motion.div>

      {/* Customer proposal link */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="bg-card rounded-2xl border border-border p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-heading font-semibold text-card-foreground">Customer Proposal</h3>
          {est.sent_at && (
            <span className="text-xs text-muted-foreground">Sent {format(new Date(est.sent_at), "MMM d, h:mm a")}</span>
          )}
        </div>
        {link ? (
          <>
            <div className="flex flex-col sm:flex-row gap-2">
              <code className="flex-1 text-xs bg-muted rounded-lg px-3 py-2.5 text-muted-foreground truncate">{link}</code>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="gap-2 rounded-lg" onClick={copyLink}>
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? "Copied" : "Copy"}
                </Button>
                <a href={link} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" size="sm" className="gap-2 rounded-lg">
                    <ExternalLink className="w-3.5 h-3.5" /> Preview
                  </Button>
                </a>
              </div>
            </div>
            {/* Acceptance tracking timeline */}
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs pt-1">
              <TimelineItem done={!!est.sent_at} label="Sent" at={est.sent_at} icon={Send} />
              <TimelineItem done={!!est.viewed_at} label="Viewed" at={est.viewed_at} icon={Eye} />
              <TimelineItem
                done={accepted}
                label={est.status === "declined" ? "Declined" : "Accepted"}
                at={est.accepted_at || est.declined_at}
                icon={accepted ? CheckCircle : XCircle}
                tone={est.status === "declined" ? "red" : "emerald"}
              />
            </div>
            {accepted && est.accepted_by_name && (
              <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                Signed by <strong>{est.accepted_by_name}</strong>
                {est.accepted_at && ` on ${format(new Date(est.accepted_at), "MMM d, yyyy 'at' h:mm a")}`}.
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Click <strong>Send to customer</strong> to generate a shareable link the customer can open and accept.
          </p>
        )}
      </motion.div>

      {/* Schedule & dispatch — shown once the customer (or you) accept */}
      {accepted && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-2xl border border-emerald-200 p-6 space-y-4">
          <div className="flex items-center gap-2">
            <CalendarPlus className="w-5 h-5 text-emerald-600" />
            <h3 className="font-heading font-semibold text-card-foreground">Schedule &amp; Dispatch</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            Add this job straight to your calendar. The event is pre-filled with the customer, address, and total.
          </p>
          <div className="flex flex-wrap gap-2">
            <a href={calendar.google} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm" className="gap-2 rounded-lg"><CalendarPlus className="w-3.5 h-3.5" /> Google Calendar</Button>
            </a>
            <a href={calendar.outlook} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm" className="gap-2 rounded-lg"><CalendarPlus className="w-3.5 h-3.5" /> Outlook</Button>
            </a>
            <Button variant="outline" size="sm" className="gap-2 rounded-lg" onClick={() => downloadICS(eventFromJob(est), `${est.estimate_number || "job"}.ics`)}>
              <Download className="w-3.5 h-3.5" /> Download .ics
            </Button>
            {est.job_id ? (
              <Badge variant="outline" className="gap-1.5 text-emerald-700 border-emerald-200 self-center">
                <ClipboardList className="w-3.5 h-3.5" /> On dispatch board
              </Badge>
            ) : (
              <Button size="sm" className="gap-2 rounded-lg" onClick={() => createJobMutation.mutate()} disabled={createJobMutation.isPending}>
                <ClipboardList className="w-3.5 h-3.5" /> Add to dispatch board
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Default time is tomorrow 9:00 AM (2 hrs) until you set one. Heads-up: the calendar event includes the job total — remove it from the description before sharing the invite with the customer.
          </p>
        </motion.div>
      )}

      {/* Customer & Job */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-card rounded-2xl border border-border p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Customer</h3>
            <p className="font-heading font-semibold text-card-foreground text-lg">{est.customer_name}</p>
            {est.customer_address && <p className="text-sm text-muted-foreground mt-1">{est.customer_address}</p>}
          </div>
          <div>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Job Details</h3>
            <p className="font-medium text-card-foreground capitalize">{est.job_type?.replace(/_/g, " ")}</p>
            {est.job_description && <p className="text-sm text-muted-foreground mt-1">{est.job_description}</p>}
            {est.valid_until && <p className="text-xs text-muted-foreground mt-2">Valid until {format(new Date(est.valid_until), "MMM d, yyyy")}</p>}
          </div>
        </div>
      </motion.div>

      {/* Line Items */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="bg-card rounded-2xl border border-border overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <h3 className="font-heading font-semibold text-card-foreground">Line Items</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase">Type</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase">Description</th>
                <th className="text-right px-6 py-3 text-xs font-medium text-muted-foreground uppercase">Qty</th>
                <th className="text-right px-6 py-3 text-xs font-medium text-muted-foreground uppercase">Unit Price</th>
                <th className="text-right px-6 py-3 text-xs font-medium text-muted-foreground uppercase">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(est.line_items || []).map((item, i) => (
                <tr key={i} className="hover:bg-muted/20 transition-colors">
                  <td className="px-6 py-3">
                    <Badge variant="secondary" className="text-xs capitalize">{typeLabels[item.type] || item.type}</Badge>
                  </td>
                  <td className="px-6 py-3 text-card-foreground">{item.description}</td>
                  <td className="px-6 py-3 text-right text-muted-foreground">{item.quantity}</td>
                  <td className="px-6 py-3 text-right text-muted-foreground">${(item.unit_price || 0).toFixed(2)}</td>
                  <td className="px-6 py-3 text-right font-medium text-card-foreground">${(item.total || 0).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="border-t border-border p-6">
          <div className="max-w-xs ml-auto space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span>${(est.subtotal || 0).toFixed(2)}</span>
            </div>
            {(est.markup_percent || 0) > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Markup ({est.markup_percent}%)</span>
                <span>${(est.markup_amount || 0).toFixed(2)}</span>
              </div>
            )}
            {(est.discount_amount || 0) > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Cash discount ({est.cash_discount_percent}%)</span>
                <span>−${(est.discount_amount || 0).toFixed(2)}</span>
              </div>
            )}
            {(est.tax_percent || 0) > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Tax ({est.tax_percent}%)</span>
                <span>${(est.tax_amount || 0).toFixed(2)}</span>
              </div>
            )}
            <Separator />
            <div className="flex justify-between items-center">
              <span className="font-heading font-semibold text-card-foreground">Total</span>
              <span className="text-2xl font-display font-bold text-primary">${(est.total || 0).toFixed(2)}</span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Notes */}
      {est.customer_notes && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-card rounded-2xl border border-border p-6">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Customer Notes</h3>
          <p className="text-sm text-card-foreground whitespace-pre-wrap">{est.customer_notes}</p>
        </motion.div>
      )}
      {est.notes && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-card rounded-2xl border border-border p-6">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Internal Notes</h3>
          <p className="text-sm text-card-foreground whitespace-pre-wrap">{est.notes}</p>
        </motion.div>
      )}

      {/* Off-screen customer-facing document used for the PDF download */}
      <ProposalDocument estimate={est} ref={docRef} />
    </div>
  );
}

function TimelineItem({ done, label, at, icon: Icon, tone = "emerald" }) {
  const color = !done ? "text-muted-foreground/40" : tone === "red" ? "text-red-600" : "text-emerald-600";
  return (
    <span className={`flex items-center gap-1.5 ${color}`}>
      <Icon className="w-3.5 h-3.5" />
      <span className="font-medium">{label}</span>
      {done && at && <span className="text-muted-foreground">· {format(new Date(at), "MMM d, h:mm a")}</span>}
    </span>
  );
}