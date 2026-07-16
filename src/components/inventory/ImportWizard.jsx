import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Upload, Download, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/AuthContext";
import { applyMovements } from "@/lib/inventory";

// Bulk import: upload a CSV or Excel file → Base44's ExtractDataFromUploadedFile
// parses it against a schema → preview each row as new / update / error →
// confirm. Existing SKUs update prices & reorder settings; quantities only
// overwrite stock when "full count" is checked (via adjustment movements).

const EXTRACT_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          sku: { type: "string" },
          name: { type: "string" },
          category: { type: "string" },
          unit_of_measure: { type: "string" },
          cost: { type: "number" },
          sell_price: { type: "number" },
          quantity: { type: "number" },
          reorder_point: { type: "number" },
          reorder_qty: { type: "number" },
          supplier_sku: { type: "string" },
          barcode: { type: "string" },
          bin_location: { type: "string" },
        },
      },
    },
  },
};

const TEMPLATE_CSV =
  "sku,name,category,unit_of_measure,cost,sell_price,quantity,reorder_point,reorder_qty,supplier_sku,barcode,bin_location\n" +
  'CU-EL-34,"3/4in Copper Elbow",pipe_fittings,each,1.25,4.50,40,20,50,SUP-8812,,Shelf B3\n' +
  'PVC-40-2,"2in PVC Sch40 Pipe",pipe,ft,0.85,2.75,120,60,100,,,Rack A1\n';

export default function ImportWizard({ open, onOpenChange }) {
  const [step, setStep] = useState("upload"); // upload | preview | done
  const [parsing, setParsing] = useState(false);
  const [rows, setRows] = useState([]);
  const [fullCount, setFullCount] = useState(false);
  const [importing, setImporting] = useState(false);
  const [summary, setSummary] = useState(null);
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const reset = () => {
    setStep("upload");
    setRows([]);
    setFullCount(false);
    setSummary(null);
  };

  const close = (v) => {
    onOpenChange(v);
    if (!v) reset();
  };

  const downloadTemplate = () => {
    const blob = new Blob([TEMPLATE_CSV], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "inventory-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParsing(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const extracted = await base44.integrations.Core.ExtractDataFromUploadedFile({
        file_url,
        json_schema: EXTRACT_SCHEMA,
      });
      // Surface a real extraction failure instead of a misleading "no rows".
      if (extracted?.status === "error") {
        toast.error(extracted.details || "The file could not be read — try the CSV template format");
        return;
      }
      const parsed = extracted?.output?.items || extracted?.items || [];
      if (!parsed.length) {
        toast.error("No rows found — check the file matches the template columns");
        return;
      }
      // Classify each row against existing inventory.
      const existing = await base44.entities.InventoryItem.list("-created_date", 1000);
      const bySku = Object.fromEntries(existing.map((i) => [String(i.sku).trim().toLowerCase(), i]));
      const seen = new Set();
      const classified = parsed.map((r) => {
        const sku = String(r.sku || "").trim();
        let status = "new";
        let error = "";
        if (!sku || !String(r.name || "").trim()) {
          status = "error";
          error = "Missing SKU or name";
        } else if (seen.has(sku.toLowerCase())) {
          status = "error";
          error = "Duplicate SKU in file";
        } else if (bySku[sku.toLowerCase()]) {
          status = "update";
        }
        if (sku) seen.add(sku.toLowerCase());
        return { ...r, sku, status, error, existing: bySku[sku.toLowerCase()] };
      });
      setRows(classified);
      setStep("preview");
    } catch (err) {
      toast.error(err?.message || "Could not read the file");
    } finally {
      setParsing(false);
      e.target.value = "";
    }
  };

  const rowFields = (row) => ({
    name: String(row.name).trim(),
    category: row.category || undefined,
    unit_of_measure: row.unit_of_measure || undefined,
    avg_cost: row.cost ?? undefined,
    sell_price: row.sell_price ?? undefined,
    reorder_point: row.reorder_point ?? undefined,
    reorder_qty: row.reorder_qty ?? undefined,
    supplier_sku: row.supplier_sku || undefined,
    barcode: row.barcode || undefined,
    bin_location: row.bin_location || undefined,
  });

  const runImport = async () => {
    setImporting(true);
    let created = 0;
    let updated = 0;
    const failedSkus = [];
    const performedBy = user?.email;

    // New rows: one bulkCreate, then one movement batch for starting stock.
    const newRows = rows.filter((r) => r.status === "new");
    if (newRows.length) {
      const payloads = newRows.map((row) => ({
        sku: row.sku,
        ...rowFields(row),
        quantity_on_hand: 0,
        active: true,
      }));
      let createdItems = null;
      try {
        createdItems = await base44.entities.InventoryItem.bulkCreate(payloads);
      } catch {
        createdItems = null; // fall through to per-row creation below
      }
      if (!Array.isArray(createdItems) || createdItems.length !== payloads.length) {
        // Fallback: create one-by-one so partial failures are attributable.
        createdItems = [];
        for (const payload of payloads) {
          try {
            createdItems.push(await base44.entities.InventoryItem.create(payload));
          } catch {
            createdItems.push(null);
            failedSkus.push(payload.sku);
          }
        }
      }
      const movements = [];
      createdItems.forEach((item, i) => {
        if (!item) return;
        created += 1;
        if (newRows[i].quantity) {
          movements.push({
            item_id: item.id,
            type: "initial",
            qty_delta: newRows[i].quantity,
            unit_cost: newRows[i].cost ?? undefined,
            idempotency_key: `initial:${item.id}`,
            _item: item,
          });
        }
      });
      if (movements.length) await applyMovements(movements, { performedBy });
    }

    // Updates: per-row so each failure maps to a SKU.
    for (const row of rows.filter((r) => r.status === "update")) {
      try {
        await base44.entities.InventoryItem.update(row.existing.id, rowFields(row));
        if (fullCount && row.quantity != null) {
          const delta = row.quantity - (row.existing.quantity_on_hand || 0);
          if (delta !== 0) {
            await applyMovements(
              [
                {
                  item_id: row.existing.id,
                  type: "adjustment",
                  qty_delta: delta,
                  reason: "count_correction",
                  reason_note: "CSV import full count",
                },
              ],
              { performedBy }
            );
          }
        }
        updated += 1;
      } catch {
        failedSkus.push(row.sku);
      }
    }

    setImporting(false);
    setSummary({
      created,
      updated,
      failed: failedSkus.length,
      failedSkus,
      skipped: rows.filter((r) => r.status === "error").length,
    });
    setStep("done");
    queryClient.invalidateQueries({ queryKey: ["inventory"] });
  };

  const statusBadge = {
    new: <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">New</Badge>,
    update: <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">Update</Badge>,
    error: <Badge variant="outline" className="bg-red-50 text-red-600 border-red-200">Error</Badge>,
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">Import Inventory</DialogTitle>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Upload a CSV or Excel file. Existing SKUs are updated; new SKUs are created.
            </p>
            <Button variant="outline" size="sm" className="gap-2" onClick={downloadTemplate}>
              <Download className="w-3.5 h-3.5" /> Download template
            </Button>
            <label className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-border rounded-2xl p-10 cursor-pointer hover:bg-muted/40 transition-colors">
              {parsing ? (
                <>
                  <Loader2 className="w-8 h-8 text-muted-foreground animate-spin" />
                  <span className="text-sm text-muted-foreground">Reading file...</span>
                </>
              ) : (
                <>
                  <Upload className="w-8 h-8 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Click to choose a .csv or .xlsx file</span>
                </>
              )}
              <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFile} disabled={parsing} />
            </label>
          </div>
        )}

        {step === "preview" && (
          <div className="space-y-4">
            <div className="overflow-x-auto border border-border rounded-xl max-h-72 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card">
                  <tr className="border-b border-border text-left">
                    <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Status</th>
                    <th className="px-3 py-2 text-xs font-medium text-muted-foreground">SKU</th>
                    <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Name</th>
                    <th className="px-3 py-2 text-xs font-medium text-muted-foreground text-right">Qty</th>
                    <th className="px-3 py-2 text-xs font-medium text-muted-foreground text-right">Sell $</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((r, i) => (
                    <tr key={i} className={r.status === "error" ? "bg-red-50/50" : ""}>
                      <td className="px-3 py-2">
                        {statusBadge[r.status]}
                        {r.error && <span className="block text-xs text-red-500 mt-0.5">{r.error}</span>}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{r.sku}</td>
                      <td className="px-3 py-2">{r.name}</td>
                      <td className="px-3 py-2 text-right">{r.quantity ?? "—"}</td>
                      <td className="px-3 py-2 text-right">{r.sell_price != null ? `$${r.sell_price}` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <label className="flex items-start gap-2 text-sm text-muted-foreground cursor-pointer">
              <Checkbox checked={fullCount} onCheckedChange={setFullCount} className="mt-0.5" />
              <span>
                Quantities in this file are a <strong>full physical count</strong> — overwrite stock for existing items
                (recorded as count-correction adjustments).
              </span>
            </label>
            <div className="flex justify-between items-center">
              <Button variant="ghost" onClick={reset}>Back</Button>
              <Button onClick={runImport} disabled={importing || rows.every((r) => r.status === "error")} className="gap-2">
                {importing && <Loader2 className="w-4 h-4 animate-spin" />}
                Import {rows.filter((r) => r.status !== "error").length} rows
              </Button>
            </div>
          </div>
        )}

        {step === "done" && summary && (
          <div className="text-center py-6 space-y-3">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
            <p className="font-medium text-foreground">
              Imported: {summary.created} new, {summary.updated} updated
              {summary.skipped > 0 && `, ${summary.skipped} skipped`}
              {summary.failed > 0 && `, ${summary.failed} failed`}
            </p>
            {summary.failedSkus?.length > 0 && (
              <p className="text-sm text-red-600">
                Failed SKUs: {summary.failedSkus.join(", ")}
              </p>
            )}
            <Button onClick={() => close(false)}>Done</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
