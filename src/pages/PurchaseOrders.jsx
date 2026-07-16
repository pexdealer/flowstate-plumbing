import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ShoppingCart, ArrowRight, Plus, Truck, Phone, Mail, Pencil, Archive, ArchiveRestore } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import SupplierDialog from "@/components/inventory/SupplierDialog";

export const PO_STATUS_STYLES = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-primary/10 text-primary border-primary/20",
  partially_received: "bg-amber-50 text-amber-600 border-amber-200",
  received: "bg-emerald-50 text-emerald-700 border-emerald-200",
  canceled: "bg-red-50 text-red-600 border-red-200",
};

const TERM_LABELS = {
  due_on_receipt: "Due on receipt",
  net_15: "Net 15",
  net_30: "Net 30",
  net_60: "Net 60",
};

export default function PurchaseOrders() {
  const [tab, setTab] = useState(() =>
    new URLSearchParams(window.location.search).get("tab") === "suppliers" ? "suppliers" : "orders"
  );
  const [supplierDialogOpen, setSupplierDialogOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const queryClient = useQueryClient();

  const { data: pos = [], isLoading } = useQuery({
    queryKey: ["purchase-orders"],
    queryFn: () => base44.entities.PurchaseOrder.list("-created_date", 200),
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => base44.entities.Supplier.list("-created_date", 200),
  });

  const archiveMutation = useMutation({
    mutationFn: ({ id, active }) => base44.entities.Supplier.update(id, { active }),
    onSuccess: (_, { active }) => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      toast.success(active ? "Supplier restored" : "Supplier archived");
    },
    onError: (e) => toast.error(e?.message || "Could not update supplier"),
  });

  const openNewSupplier = () => {
    setEditingSupplier(null);
    setSupplierDialogOpen(true);
  };

  const openEditSupplier = (s) => {
    setEditingSupplier(s);
    setSupplierDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Purchasing</h1>
          <p className="text-muted-foreground mt-1">
            {pos.length} purchase orders · {suppliers.filter((s) => s.active !== false).length} suppliers
          </p>
        </div>
        {tab === "orders" ? (
          <Link to="/inventory?tab=low">
            <Button variant="outline" className="gap-2 rounded-xl">
              <ShoppingCart className="w-4 h-4" /> Reorder from Low Stock
            </Button>
          </Link>
        ) : (
          <Button className="gap-2 rounded-xl shadow-lg shadow-primary/20" onClick={openNewSupplier}>
            <Plus className="w-4 h-4" /> Add Supplier
          </Button>
        )}
      </motion.div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-card border border-border">
          <TabsTrigger value="orders">Orders</TabsTrigger>
          <TabsTrigger value="suppliers">Suppliers</TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === "orders" && (
        isLoading ? (
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
                        {po.expected_date && ` · expected ${format(new Date(po.expected_date), "MMM d")}`}
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
        )
      )}

      {tab === "suppliers" && (
        suppliers.length === 0 ? (
          <div className="bg-card rounded-2xl border border-border p-16 text-center">
            <Truck className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="font-heading font-semibold text-card-foreground mb-2">No suppliers yet</h3>
            <p className="text-muted-foreground text-sm mb-6">
              Add your supply houses so items can be grouped onto the right purchase orders.
            </p>
            <Button className="gap-2 rounded-xl" onClick={openNewSupplier}>
              <Plus className="w-4 h-4" /> Add Supplier
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {suppliers.map((s, i) => (
              <motion.div
                key={s.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className={`bg-card rounded-2xl border border-border p-6 hover:shadow-lg hover:shadow-primary/5 transition-all ${s.active === false ? "opacity-60" : ""}`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-heading font-semibold text-card-foreground text-lg">{s.name}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {TERM_LABELS[s.default_terms] || ""}
                      {s.account_number && ` · Acct ${s.account_number}`}
                      {s.active === false && " · Archived"}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditSupplier(s)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground"
                      onClick={() => archiveMutation.mutate({ id: s.id, active: s.active === false })}
                    >
                      {s.active === false ? <ArchiveRestore className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
                    </Button>
                  </div>
                </div>
                <div className="space-y-2 text-sm text-muted-foreground">
                  {s.contact_name && <p>{s.contact_name}</p>}
                  {s.phone && <p className="flex items-center gap-2"><Phone className="w-3.5 h-3.5" />{s.phone}</p>}
                  {s.email && <p className="flex items-center gap-2"><Mail className="w-3.5 h-3.5" />{s.email}</p>}
                </div>
              </motion.div>
            ))}
          </div>
        )
      )}

      <SupplierDialog open={supplierDialogOpen} onOpenChange={setSupplierDialogOpen} supplier={editingSupplier} />
    </div>
  );
}
