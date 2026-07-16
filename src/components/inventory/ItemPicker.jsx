import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Package, Search } from "lucide-react";

// Catalog picker for estimate/job line items. Search by name or SKU, see live
// stock, tap to fill the line. Free-text lines remain possible — this is an
// enhancement, never a requirement.
export default function ItemPicker({ onSelect }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { data: items = [] } = useQuery({
    queryKey: ["inventory"],
    queryFn: () => base44.entities.InventoryItem.list("-created_date", 500),
    enabled: open,
  });

  const q = search.toLowerCase();
  const filtered = items
    .filter((i) => i.active !== false)
    .filter((i) => !q || [i.name, i.sku, i.supplier_sku].join(" ").toLowerCase().includes(q))
    .slice(0, 30);

  const pick = (item) => {
    onSelect(item);
    setOpen(false);
    setSearch("");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 text-muted-foreground hover:text-primary"
          title="Pick from inventory"
        >
          <Package className="w-4 h-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <div className="p-2 border-b border-border">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              autoFocus
              placeholder="Search parts by name or SKU..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9 text-sm"
            />
          </div>
        </div>
        <div className="max-h-64 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              {items.length === 0 ? "No items in inventory yet." : "No matches."}
            </p>
          ) : (
            filtered.map((item) => {
              const qty = item.quantity_on_hand || 0;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => pick(item)}
                  className="w-full text-left px-3 py-2.5 hover:bg-muted/60 transition-colors flex items-center justify-between gap-2"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-foreground truncate">{item.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {item.sku} · ${(item.sell_price || 0).toFixed(2)}
                    </span>
                  </span>
                  <span
                    className={`text-xs font-medium whitespace-nowrap ${
                      qty <= 0 ? "text-red-500" : qty <= (item.reorder_point || 0) ? "text-amber-600" : "text-emerald-600"
                    }`}
                  >
                    {qty} in stock
                  </span>
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
