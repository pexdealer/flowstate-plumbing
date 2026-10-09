import React from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import ItemPicker from "@/components/inventory/ItemPicker";

// Recompute a line's total. Material lines can carry their own markup
// percentage; every other line type is priced at quantity times unit price.
function withLineTotal(item) {
  const base = (parseFloat(item.quantity) || 0) * (parseFloat(item.unit_price) || 0);
  const markup = item.type === "material" ? (parseFloat(item.markup_percent) || 0) : 0;
  return { ...item, markup_percent: markup, total: base * (1 + markup / 100) };
}

export default function LineItemRow({ item, index, onChange, onRemove }) {
  const handleChange = (field, value) => {
    const updated = { ...item, [field]: value };
    if (["quantity", "unit_price", "type", "markup_percent"].includes(field)) {
      onChange(index, withLineTotal(updated));
      return;
    }
    onChange(index, updated);
  };

  // Fill the line from an inventory item and link it for stock deduction later.
  const handlePick = (inv) => {
    onChange(index, withLineTotal({
      ...item,
      type: "material",
      item_id: inv.id,
      sku: inv.sku,
      description: inv.name,
      quantity: parseFloat(item.quantity) || 1,
      unit_price: inv.sell_price || 0,
    }));
  };

  const isMaterial = item.type === "material";

  return (
    <div className="grid grid-cols-12 gap-2 items-center group">
      <div className="col-span-12 sm:col-span-2">
        <Select value={item.type || "material"} onValueChange={(v) => handleChange("type", v)}>
          <SelectTrigger className="rounded-lg text-sm h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="material">Material</SelectItem>
            <SelectItem value="labor">Labor</SelectItem>
            <SelectItem value="equipment">Equipment</SelectItem>
            <SelectItem value="other">Other</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="col-span-12 sm:col-span-3 flex items-center gap-1">
        <ItemPicker onSelect={handlePick} />
        <div className="flex-1 min-w-0">
          <Input
            placeholder="Description"
            value={item.description || ""}
            onChange={(e) => handleChange("description", e.target.value)}
            className="rounded-lg text-sm h-9"
          />
        </div>
      </div>
      <div className="col-span-4 sm:col-span-1">
        <Input
          type="number"
          placeholder="Qty"
          value={item.quantity ?? ""}
          onChange={(e) => handleChange("quantity", parseFloat(e.target.value) || 0)}
          className="rounded-lg text-sm h-9"
          min="0"
          step="0.5"
        />
      </div>
      <div className="col-span-4 sm:col-span-2">
        <Input
          type="number"
          placeholder="Unit $"
          value={item.unit_price ?? ""}
          onChange={(e) => handleChange("unit_price", parseFloat(e.target.value) || 0)}
          className="rounded-lg text-sm h-9"
          min="0"
          step="0.01"
        />
      </div>
      <div className="col-span-4 sm:col-span-2">
        {isMaterial ? (
          <div className="flex items-center gap-1">
            <Input
              type="number"
              placeholder="Markup"
              value={item.markup_percent ?? ""}
              onChange={(e) => handleChange("markup_percent", parseFloat(e.target.value) || 0)}
              className="rounded-lg text-sm h-9 text-right"
              min="0"
              step="0.5"
              aria-label="Material markup percent"
            />
            <span className="text-xs text-muted-foreground">%</span>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground text-center block select-none">—</span>
        )}
      </div>
      <div className="col-span-3 sm:col-span-1 text-right">
        <span className="text-sm font-medium text-card-foreground">
          ${(item.total || 0).toFixed(2)}
        </span>
      </div>
      <div className="col-span-1 flex justify-center">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={() => onRemove(index)}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}