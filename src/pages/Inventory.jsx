import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Upload, Package, ShoppingCart, AlertTriangle } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import ItemDialog from "@/components/inventory/ItemDialog";
import ImportWizard from "@/components/inventory/ImportWizard";
import { CATEGORY_LABELS, isLowStock, isNegativeStock, suggestedReorderQty, inventoryValue } from "@/lib/inventory";

export default function Inventory() {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState(() =>
    new URLSearchParams(window.location.search).get("tab") === "low" ? "low" : "all"
  );
  const [category, setCategory] = useState("all");
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [selected, setSelected] = useState({});
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["inventory"],
    queryFn: () => base44.entities.InventoryItem.list("-created_date", 1000),
  });

  const active = items.filter((i) => i.active !== false);
  const lowStock = active.filter(isLowStock);
  const negative = active.filter(isNegativeStock);

  const filtered = active.filter((i) => {
    const matchesSearch = [i.name, i.sku, i.supplier_sku, i.bin_location]
      .join(" ")
      .toLowerCase()
      .includes(search.toLowerCase());
    const matchesTab = tab === "all" || (tab === "low" && isLowStock(i));
    const matchesCategory = category === "all" || i.category === category;
    return matchesSearch && matchesTab && matchesCategory;
  });

  const selectedItems = lowStock.filter((i) => selected[i.id]);

  // Group selected low-stock items by preferred supplier → one draft PO each.
  const createPOMutation = useMutation({
    mutationFn: async () => {
      const groups = {};
      for (const item of selectedItems) {
        const key = item.preferred_supplier_id || "none";
        (groups[key] = groups[key] || []).push(item);
      }
      const existing = await base44.entities.PurchaseOrder.list("-created_date", 1);
      let seq = existing.length
        ? parseInt(String(existing[0].po_number).replace(/\D/g, ""), 10) || 0
        : 0;
      const suppliers = await base44.entities.Supplier.list("-created_date", 200);
      const created = [];
      for (const [supplierId, groupItems] of Object.entries(groups)) {
        seq += 1;
        const supplier = suppliers.find((s) => s.id === supplierId);
        const line_items = groupItems.map((i) => {
          const qty = suggestedReorderQty(i);
          const cost = i.last_cost ?? i.avg_cost ?? 0;
          return {
            item_id: i.id,
            sku: i.sku,
            supplier_sku: i.supplier_sku,
            description: i.name,
            qty_ordered: qty,
            qty_received: 0,
            unit_cost: cost,
            total: qty * cost,
          };
        });
        const po = await base44.entities.PurchaseOrder.create({
          po_number: `PO-${String(seq).padStart(5, "0")}`,
          supplier_id: supplier?.id,
          supplier_name: supplier?.name || "No supplier set",
          status: "draft",
          line_items,
          subtotal: line_items.reduce((s, l) => s + l.total, 0),
        });
        created.push(po);
      }
      return created;
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      setSelected({});
      toast.success(`${created.length} draft PO${created.length > 1 ? "s" : ""} created`);
      if (created.length === 1) navigate(`/purchase-orders/${created[0].id}`);
      else navigate("/purchase-orders");
    },
    onError: (e) => toast.error(e?.message || "Could not create purchase order"),
  });

  const qtyBadge = (item) => {
    const qty = item.quantity_on_hand || 0;
    if (qty < 0) return <Badge variant="outline" className="bg-red-50 text-red-600 border-red-200">{qty}</Badge>;
    if (isLowStock(item)) return <Badge variant="outline" className="bg-amber-50 text-amber-600 border-amber-200">{qty}</Badge>;
    return <span className="font-medium text-card-foreground">{qty}</span>;
  };

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Inventory</h1>
          <p className="text-muted-foreground mt-1">
            {active.length} items · ${inventoryValue(active).toLocaleString("en-US", { maximumFractionDigits: 0 })} on hand
            {negative.length > 0 && (
              <span className="text-red-500 ml-2 inline-flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" /> {negative.length} negative
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2 rounded-xl" onClick={() => setImportOpen(true)}>
            <Upload className="w-4 h-4" /> Import
          </Button>
          <Button className="gap-2 rounded-xl shadow-lg shadow-primary/20" onClick={() => setItemDialogOpen(true)}>
            <Plus className="w-4 h-4" /> Add Item
          </Button>
        </div>
      </motion.div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, SKU, bin..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 rounded-xl bg-card"
          />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-full sm:w-44 rounded-xl bg-card"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {Object.entries(CATEGORY_LABELS).map(([v, l]) => (
              <SelectItem key={v} value={v}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="bg-card border border-border">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="low" className="gap-1.5">
              Low Stock
              {lowStock.length > 0 && (
                <span className="bg-amber-100 text-amber-700 text-xs rounded-full px-1.5">{lowStock.length}</span>
              )}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {tab === "low" && lowStock.length > 0 && (
        <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <p className="text-sm text-amber-800">
            {selectedItems.length > 0
              ? `${selectedItems.length} selected — suggested quantities prefilled`
              : "Select items to reorder"}
          </p>
          <Button
            size="sm"
            className="gap-2 rounded-lg"
            disabled={selectedItems.length === 0 || createPOMutation.isPending}
            onClick={() => createPOMutation.mutate()}
          >
            <ShoppingCart className="w-3.5 h-3.5" />
            {createPOMutation.isPending ? "Creating..." : "Create PO"}
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="bg-card rounded-2xl border border-border p-16 text-center text-muted-foreground">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="bg-card rounded-2xl border border-border p-16 text-center">
          <Package className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <h3 className="font-heading font-semibold text-card-foreground mb-2">
            {active.length === 0 ? "No inventory yet" : "No items match"}
          </h3>
          {active.length === 0 && (
            <p className="text-muted-foreground text-sm mb-6">Add items one at a time or import your whole price book.</p>
          )}
        </div>
      ) : (
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-left">
                  {tab === "low" && <th className="px-4 py-3 w-10" />}
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase">SKU</th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Name</th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase hidden md:table-cell">Category</th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase text-right">On Hand</th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase text-right hidden sm:table-cell">Reorder At</th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase text-right">Sell $</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((item) => (
                  <tr
                    key={item.id}
                    className="hover:bg-muted/20 transition-colors cursor-pointer"
                    onClick={() => navigate(`/inventory/${item.id}`)}
                  >
                    {tab === "low" && (
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={!!selected[item.id]}
                          onCheckedChange={(v) => setSelected({ ...selected, [item.id]: !!v })}
                        />
                      </td>
                    )}
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{item.sku}</td>
                    <td className="px-4 py-3 font-medium text-card-foreground">{item.name}</td>
                    <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                      {CATEGORY_LABELS[item.category] || "—"}
                    </td>
                    <td className="px-4 py-3 text-right">{qtyBadge(item)}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground hidden sm:table-cell">
                      {item.reorder_point ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-card-foreground">
                      ${(item.sell_price || 0).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="text-sm">
        <Link to="/purchase-orders" className="text-primary hover:underline">View purchase orders →</Link>
      </div>

      <ItemDialog open={itemDialogOpen} onOpenChange={setItemDialogOpen} />
      <ImportWizard open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}
