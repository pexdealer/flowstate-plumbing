import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate, Link } from "react-router-dom";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Pencil, SlidersHorizontal, Archive, ArchiveRestore } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import ItemDialog from "@/components/inventory/ItemDialog";
import AdjustStockDialog from "@/components/inventory/AdjustStockDialog";
import { CATEGORY_LABELS, UNIT_LABELS, isLowStock } from "@/lib/inventory";

const movementLabels = {
  initial: { label: "Initial stock", tone: "bg-muted text-muted-foreground" },
  usage: { label: "Used on job", tone: "bg-primary/10 text-primary" },
  purchase_receipt: { label: "Received", tone: "bg-emerald-50 text-emerald-700" },
  adjustment: { label: "Adjustment", tone: "bg-amber-50 text-amber-700" },
  return: { label: "Returned", tone: "bg-emerald-50 text-emerald-700" },
  transfer_in: { label: "Transfer in", tone: "bg-muted text-muted-foreground" },
  transfer_out: { label: "Transfer out", tone: "bg-muted text-muted-foreground" },
};

export default function InventoryItemDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);

  const { data: item, isLoading } = useQuery({
    queryKey: ["inventory", id],
    queryFn: () => base44.entities.InventoryItem.get(id).catch(() => null),
  });

  const { data: movements = [] } = useQuery({
    queryKey: ["movements", id],
    queryFn: () => base44.entities.StockMovement.filter({ item_id: id }, "-created_date", 100),
    enabled: !!id,
  });

  const archiveMutation = useMutation({
    mutationFn: (active) => base44.entities.InventoryItem.update(id, { active }),
    onSuccess: (_, active) => {
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      toast.success(active ? "Item restored" : "Item archived");
    },
    onError: (e) => toast.error(e?.message || "Could not update item"),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!item) {
    return (
      <div className="text-center py-32">
        <h2 className="font-heading font-semibold text-foreground mb-2">Item not found</h2>
        <Link to="/inventory"><Button variant="outline">Back to Inventory</Button></Link>
      </div>
    );
  }

  const qty = item.quantity_on_hand || 0;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" className="rounded-xl" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-display font-bold text-foreground">{item.name}</h1>
              {item.active === false && <Badge variant="outline">Archived</Badge>}
              {qty < 0 && <Badge variant="outline" className="bg-red-50 text-red-600 border-red-200">Negative stock</Badge>}
              {qty >= 0 && isLowStock(item) && (
                <Badge variant="outline" className="bg-amber-50 text-amber-600 border-amber-200">Low stock</Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-1 font-mono">{item.sku}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-2 rounded-xl" onClick={() => setAdjustOpen(true)}>
            <SlidersHorizontal className="w-4 h-4" /> Adjust Stock
          </Button>
          <Button
            variant="outline"
            className="gap-2 rounded-xl"
            onClick={() => archiveMutation.mutate(item.active === false)}
          >
            {item.active === false ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
            {item.active === false ? "Restore" : "Archive"}
          </Button>
          <Button className="gap-2 rounded-xl" onClick={() => setEditOpen(true)}>
            <Pencil className="w-4 h-4" /> Edit
          </Button>
        </div>
      </motion.div>

      {/* Facts */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Fact label="On Hand" value={`${qty} ${UNIT_LABELS[item.unit_of_measure] || ""}`} highlight={qty < 0 ? "red" : isLowStock(item) ? "amber" : null} />
        <Fact label="Reorder Point" value={item.reorder_point ?? "—"} />
        <Fact label="Avg Cost" value={item.avg_cost != null ? `$${item.avg_cost.toFixed(2)}` : "—"} />
        <Fact label="Sell Price" value={item.sell_price != null ? `$${item.sell_price.toFixed(2)}` : "—"} />
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-card rounded-2xl border border-border p-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <Detail label="Category" value={CATEGORY_LABELS[item.category] || "—"} />
          <Detail label="Bin" value={item.bin_location || "—"} />
          <Detail label="Supplier SKU" value={item.supplier_sku || "—"} />
          <Detail label="Last Cost" value={item.last_cost != null ? `$${item.last_cost.toFixed(2)}` : "—"} />
        </div>
        {item.description && <p className="text-sm text-muted-foreground mt-4">{item.description}</p>}
        {item.notes && <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">{item.notes}</p>}
      </motion.div>

      {/* Movement history — the audit trail */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="bg-card rounded-2xl border border-border overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <h3 className="font-heading font-semibold text-card-foreground">Stock History</h3>
        </div>
        {movements.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-10">No movements yet.</p>
        ) : (
          <div className="divide-y divide-border">
            {movements.map((mv) => {
              const meta = movementLabels[mv.type] || movementLabels.adjustment;
              return (
                <div key={mv.id} className="px-6 py-3.5 flex items-center gap-4">
                  <Badge variant="secondary" className={`text-xs ${meta.tone}`}>{meta.label}</Badge>
                  <div className="flex-1 min-w-0 text-sm">
                    <span className={`font-semibold ${mv.qty_delta > 0 ? "text-emerald-600" : "text-red-500"}`}>
                      {mv.qty_delta > 0 ? `+${mv.qty_delta}` : mv.qty_delta}
                    </span>
                    <span className="text-muted-foreground ml-2">→ {mv.qty_after ?? "?"} on hand</span>
                    {mv.reason && (
                      <span className="text-muted-foreground ml-2 capitalize">· {mv.reason.replace(/_/g, " ")}</span>
                    )}
                    {mv.reason_note && <span className="text-muted-foreground ml-1">— {mv.reason_note}</span>}
                    {mv.job_id && (
                      <Link to={`/jobs/${mv.job_id}`} className="text-primary ml-2 hover:underline">job →</Link>
                    )}
                    {mv.purchase_order_id && (
                      <Link to={`/purchase-orders/${mv.purchase_order_id}`} className="text-primary ml-2 hover:underline">PO →</Link>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {mv.created_date && format(new Date(mv.created_date), "MMM d, h:mm a")}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </motion.div>

      <ItemDialog open={editOpen} onOpenChange={setEditOpen} item={item} />
      <AdjustStockDialog open={adjustOpen} onOpenChange={setAdjustOpen} item={item} />
    </div>
  );
}

function Fact({ label, value, highlight }) {
  const tone =
    highlight === "red" ? "text-red-600" : highlight === "amber" ? "text-amber-600" : "text-card-foreground";
  return (
    <div className="bg-card rounded-2xl border border-border p-4">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className={`text-xl font-display font-bold ${tone}`}>{value}</p>
    </div>
  );
}

function Detail({ label, value }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      <p className="text-card-foreground">{value}</p>
    </div>
  );
}
