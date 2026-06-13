import React from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";

export default function LineItemRow({ item, index, onChange, onRemove }) {
  const handleChange = (field, value) => {
    const updated = { ...item, [field]: value };
    if (field === "quantity" || field === "unit_price") {
      updated.total = (parseFloat(updated.quantity) || 0) * (parseFloat(updated.unit_price) || 0);
    }
    onChange(index, updated);
  };

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
      <div className="col-span-12 sm:col-span-4">
        <Input
          placeholder="Description"
          value={item.description || ""}
          onChange={(e) => handleChange("description", e.target.value)}
          className="rounded-lg text-sm h-9"
        />
      </div>
      <div className="col-span-4 sm:col-span-2">
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