import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate, Link } from "react-router-dom";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Pencil, CheckCircle, XCircle, Send, Printer } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";

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

  const { data, isLoading } = useQuery({
    queryKey: ["estimate", id],
    queryFn: () => base44.entities.Estimate.filter({ id }),
  });

  const est = data?.[0];

  const statusMutation = useMutation({
    mutationFn: (status) => base44.entities.Estimate.update(id, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["estimate", id] });
      queryClient.invalidateQueries({ queryKey: ["estimates"] });
      toast.success("Status updated");
    },
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
        <div className="flex items-center gap-2">
          {est.status === "draft" && (
            <Button variant="outline" className="gap-2 rounded-xl" onClick={() => statusMutation.mutate("sent")}>
              <Send className="w-4 h-4" /> Mark Sent
            </Button>
          )}
          {(est.status === "sent" || est.status === "draft") && (
            <>
              <Button variant="outline" className="gap-2 rounded-xl text-emerald-600 border-emerald-200 hover:bg-emerald-50" onClick={() => statusMutation.mutate("approved")}>
                <CheckCircle className="w-4 h-4" /> Approve
              </Button>
              <Button variant="outline" className="gap-2 rounded-xl text-red-500 border-red-200 hover:bg-red-50" onClick={() => statusMutation.mutate("declined")}>
                <XCircle className="w-4 h-4" /> Decline
              </Button>
            </>
          )}
          <Link to={`/estimates/${id}/edit`}>
            <Button className="gap-2 rounded-xl">
              <Pencil className="w-4 h-4" /> Edit
            </Button>
          </Link>
        </div>
      </motion.div>

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
      {est.notes && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-card rounded-2xl border border-border p-6">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Notes</h3>
          <p className="text-sm text-card-foreground whitespace-pre-wrap">{est.notes}</p>
        </motion.div>
      )}
    </div>
  );
}