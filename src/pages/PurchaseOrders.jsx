import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShoppingCart, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";

export const PO_STATUS_STYLES = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-primary/10 text-primary border-primary/20",
  partially_received: "bg-amber-50 text-amber-600 border-amber-200",
  received: "bg-emerald-50 text-emerald-700 border-emerald-200",
  canceled: "bg-red-50 text-red-600 border-red-200",
};

export default function PurchaseOrders() {
  const { data: pos = [], isLoading } = useQuery({
    queryKey: ["purchase-orders"],
    queryFn: () => base44.entities.PurchaseOrder.list("-created_date", 200),
  });

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Purchasing</h1>
          <p className="text-muted-foreground mt-1">{pos.length} purchase orders</p>
        </div>
        <Link to="/inventory">
          <Button variant="outline" className="gap-2 rounded-xl">
            <ShoppingCart className="w-4 h-4" /> Reorder from Low Stock
          </Button>
        </Link>
      </motion.div>

      {isLoading ? (
        <div className="bg-card rounded-2xl border border-border p-16 text-center text-muted-foreground">Loading...</div>
      ) : pos.length === 0 ? (
        <div className="bg-card rounded-2xl border border-border p-16 text-center">
          <ShoppingCart className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <h3 className="font-heading font-semibold text-card-foreground mb-2">No purchase orders yet</h3>
          <p className="text-muted-foreground text-sm">
            Open Inventory → Low Stock, select items, and click Create PO.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {pos.map((po, i) => (
            <motion.div key={po.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
              <Link
                to={`/purchase-orders/${po.id}`}
                className="block bg-card rounded-2xl border border-border p-5 hover:shadow-lg hover:shadow-primary/5 transition-all group"
              >
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="font-heading font-semibold text-card-foreground">{po.po_number}</h3>
                      <Badge variant="outline" className={`text-xs capitalize ${PO_STATUS_STYLES[po.status] || PO_STATUS_STYLES.draft}`}>
                        {(po.status || "draft").replace(/_/g, " ")}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {po.supplier_name || "No supplier"} · {(po.line_items || []).length} items
                      {po.created_date && ` · ${format(new Date(po.created_date), "MMM d, yyyy")}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-xl font-display font-bold text-card-foreground">
                      ${(po.subtotal || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </span>
                    <ArrowRight className="w-5 h-5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
