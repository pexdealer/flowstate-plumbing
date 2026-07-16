import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate, Link } from "react-router-dom";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Send, PackageCheck, XCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import ReceivePODialog from "@/components/inventory/ReceivePODialog";
import { PO_STATUS_STYLES } from "@/pages/PurchaseOrders";

export default function PurchaseOrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [receiveOpen, setReceiveOpen] = useState(false);

  const { data: po, isLoading } = useQuery({
    queryKey: ["purchase-order", id],
    queryFn: () => base44.entities.PurchaseOrder.get(id).catch(() => null),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["purchase-order", id] });
    queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
  };

  const updateMutation = useMutation({
    mutationFn: (patch) => base44.entities.PurchaseOrder.update(id, patch),
    onSuccess: () => {
      invalidate();
      toast.success("Purchase order updated");
    },
    onError: (e) => toast.error(e?.message || "Could not update PO"),
  });

  const isDraft = po?.status === "draft";
  const receivable = po?.status === "sent" || po?.status === "partially_received";

  const updateLine = (index, field, value) => {
    const lines = [...(po.line_items || [])];
    const line = { ...lines[index], [field]: parseFloat(value) || 0 };
    line.total = (line.qty_ordered || 0) * (line.unit_cost || 0);
    lines[index] = line;
    updateMutation.mutate({
      line_items: lines,
      subtotal: lines.reduce((s, l) => s + (l.total || 0), 0),
    });
  };

  const removeLine = (index) => {
    const lines = (po.line_items || []).filter((_, i) => i !== index);
    updateMutation.mutate({
      line_items: lines,
      subtotal: lines.reduce((s, l) => s + (l.total || 0), 0),
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!po) {
    return (
      <div className="text-center py-32">
        <h2 className="font-heading font-semibold text-foreground mb-2">Purchase order not found</h2>
        <Link to="/purchase-orders"><Button variant="outline">Back to Purchasing</Button></Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" className="rounded-xl" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-display font-bold text-foreground">{po.po_number}</h1>
              <Badge variant="outline" className={`capitalize ${PO_STATUS_STYLES[po.status] || PO_STATUS_STYLES.draft}`}>
                {(po.status || "draft").replace(/_/g, " ")}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {po.supplier_name || "No supplier"}
              {po.created_date && ` · Created ${format(new Date(po.created_date), "MMM d, yyyy")}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isDraft && (
            <>
              <Button
                className="gap-2 rounded-xl"
                onClick={() => updateMutation.mutate({ status: "sent", sent_at: new Date().toISOString() })}
              >
                <Send className="w-4 h-4" /> Mark Sent
              </Button>
              <Button
                variant="outline"
                className="gap-2 rounded-xl text-red-500 border-red-200 hover:bg-red-50"
                onClick={() => updateMutation.mutate({ status: "canceled" })}
              >
                <XCircle className="w-4 h-4" /> Cancel
              </Button>
            </>
          )}
          {receivable && (
            <Button className="gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700" onClick={() => setReceiveOpen(true)}>
              <PackageCheck className="w-4 h-4" /> Receive Stock
            </Button>
          )}
        </div>
      </motion.div>

      {/* Order details — editable while draft */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="bg-card rounded-2xl border border-border p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label>Expected Delivery</Label>
            {isDraft ? (
              <Input
                type="date"
                defaultValue={po.expected_date || ""}
                onBlur={(e) => e.target.value !== (po.expected_date || "") && updateMutation.mutate({ expected_date: e.target.value })}
                className="rounded-lg mt-1"
              />
            ) : (
              <p className="text-sm text-card-foreground mt-2">
                {po.expected_date ? format(new Date(po.expected_date), "MMM d, yyyy") : "—"}
              </p>
            )}
          </div>
          <div>
            <Label>Notes for Supplier</Label>
            {isDraft ? (
              <Textarea
                defaultValue={po.notes || ""}
                onBlur={(e) => e.target.value !== (po.notes || "") && updateMutation.mutate({ notes: e.target.value })}
                rows={2}
                className="rounded-lg mt-1"
                placeholder="Will call for pickup Friday..."
              />
            ) : (
              <p className="text-sm text-card-foreground mt-2 whitespace-pre-wrap">{po.notes || "—"}</p>
            )}
          </div>
        </div>
      </motion.div>

      {/* Lines */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-card rounded-2xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-left">
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase">SKU</th>
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Description</th>
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase text-right">Qty</th>
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase text-right">Received</th>
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase text-right">Unit Cost</th>
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase text-right">Total</th>
                {isDraft && <th className="px-2 py-3 w-10" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(po.line_items || []).map((line, i) => (
                <tr key={i}>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {line.supplier_sku || line.sku}
                  </td>
                  <td className="px-4 py-3 text-card-foreground">{line.description}</td>
                  <td className="px-4 py-3 text-right">
                    {isDraft ? (
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        defaultValue={line.qty_ordered}
                        onBlur={(e) => updateLine(i, "qty_ordered", e.target.value)}
                        className="w-20 h-8 text-right ml-auto"
                      />
                    ) : (
                      line.qty_ordered
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{line.qty_received || 0}</td>
                  <td className="px-4 py-3 text-right">
                    {isDraft ? (
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        defaultValue={line.unit_cost}
                        onBlur={(e) => updateLine(i, "unit_cost", e.target.value)}
                        className="w-24 h-8 text-right ml-auto"
                      />
                    ) : (
                      `$${(line.unit_cost || 0).toFixed(2)}`
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-card-foreground">
                    ${(line.total || 0).toFixed(2)}
                  </td>
                  {isDraft && (
                    <td className="px-2 py-3">
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => removeLine(i)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-border p-6 flex justify-end">
          <div className="flex items-baseline gap-4">
            <span className="font-heading font-semibold text-card-foreground">Subtotal</span>
            <span className="text-2xl font-display font-bold text-primary">
              ${(po.subtotal || 0).toFixed(2)}
            </span>
          </div>
        </div>
      </motion.div>

      <ReceivePODialog open={receiveOpen} onOpenChange={setReceiveOpen} po={po} />
    </div>
  );
}
