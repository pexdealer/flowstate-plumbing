import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate, Link } from "react-router-dom";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Plus, Minus, Trash2, PackageCheck, CalendarPlus, CalendarClock, Download, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { useAuth } from "@/lib/AuthContext";
import ItemPicker from "@/components/inventory/ItemPicker";
import { recordUsageForJob } from "@/lib/inventory";
import { calendarLinksForJob, downloadICS, eventFromJob } from "@/lib/calendar";
import { JOB_STATUS_STYLES } from "@/pages/Jobs";

const JOB_STATUSES = ["unscheduled", "scheduled", "dispatched", "in_progress", "completed", "canceled"];
const emptyLine = { type: "material", description: "", quantity: 1, unit_price: 0, total: 0 };

export default function JobDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [lines, setLines] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [schedStart, setSchedStart] = useState("");
  const [schedHours, setSchedHours] = useState("2");

  const { data: job, isLoading } = useQuery({
    queryKey: ["job", id],
    queryFn: () => base44.entities.Job.get(id).catch(() => null),
  });

  useEffect(() => {
    if (job) {
      setLines(job.line_items?.length ? job.line_items : []);
      setDirty(false);
      if (job.scheduled_start) {
        setSchedStart(format(new Date(job.scheduled_start), "yyyy-MM-dd'T'HH:mm"));
        if (job.scheduled_end) {
          const hrs =
            (new Date(job.scheduled_end) - new Date(job.scheduled_start)) / 3600000;
          if (hrs > 0) setSchedHours(String(hrs));
        }
      }
    }
  }, [job]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["job", id] });
    queryClient.invalidateQueries({ queryKey: ["jobs"] });
    queryClient.invalidateQueries({ queryKey: ["inventory"] });
  };

  const statusMutation = useMutation({
    mutationFn: (status) => base44.entities.Job.update(id, { status }),
    onSuccess: () => {
      invalidate();
      toast.success("Job updated");
    },
    onError: (e) => toast.error(e?.message || "Could not update job"),
  });

  // Save the schedule window; an unscheduled job auto-bumps to scheduled so
  // the board reflects reality without an extra click.
  const scheduleMutation = useMutation({
    mutationFn: () => {
      const start = new Date(schedStart);
      const end = new Date(start.getTime() + (parseFloat(schedHours) || 2) * 3600000);
      return base44.entities.Job.update(id, {
        scheduled_start: start.toISOString(),
        scheduled_end: end.toISOString(),
        status: job.status === "unscheduled" || !job.status ? "scheduled" : job.status,
      });
    },
    onSuccess: () => {
      invalidate();
      toast.success("Schedule saved — calendar links updated");
    },
    onError: (e) => toast.error(e?.message || "Could not save schedule"),
  });

  // Save parts list + confirm usage: persists the lines, then reconciles stock
  // against what was previously deducted (only differences move).
  const usePartsMutation = useMutation({
    mutationFn: async () => {
      const cleaned = lines.filter((l) => l.description || l.item_id);
      await base44.entities.Job.update(id, { line_items: cleaned });
      return recordUsageForJob({ ...job, line_items: cleaned }, { performedBy: user?.email });
    },
    onSuccess: (result) => {
      invalidate();
      if (result.failed?.length) {
        toast.error(
          `${result.failed.length} item${result.failed.length > 1 ? "s" : ""} failed to update — parts are NOT confirmed. Check the items and try again.`,
          { duration: 8000 }
        );
        return; // stay dirty so the button invites a retry
      }
      setDirty(false);
      if (result.oversold?.length) {
        const names = result.oversold.map((o) => `${o.name} (short ${o.short})`).join(", ");
        toast.warning(`Stock went negative: ${names}. Recorded anyway — fix counts in Inventory.`, { duration: 8000 });
      } else if (result.deducted || result.returned) {
        toast.success("Parts confirmed — stock updated");
      } else {
        toast.success("Parts confirmed — no stock changes needed");
      }
    },
    onError: (e) => toast.error(e?.message || "Could not confirm parts"),
  });

  const updateLine = (index, patch) => {
    const next = [...lines];
    const line = { ...next[index], ...patch };
    line.total = (parseFloat(line.quantity) || 0) * (parseFloat(line.unit_price) || 0);
    next[index] = line;
    setLines(next);
    setDirty(true);
  };

  const pickItem = (index, item) => {
    updateLine(index, {
      item_id: item.id,
      sku: item.sku,
      description: item.name,
      unit_price: item.sell_price || 0,
      type: "material",
    });
  };

  const addLine = () => {
    setLines([...lines, { ...emptyLine }]);
    setDirty(true);
  };

  const removeLine = (index) => {
    setLines(lines.filter((_, i) => i !== index));
    setDirty(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="text-center py-32">
        <h2 className="font-heading font-semibold text-foreground mb-2">Job not found</h2>
        <Link to="/jobs"><Button variant="outline">Back to Jobs</Button></Link>
      </div>
    );
  }

  const calendar = calendarLinksForJob(job);
  const partsTotal = lines.reduce((s, l) => s + (l.total || 0), 0);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" className="rounded-xl" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground capitalize">
              {job.title || job.customer_name || "Job"}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {job.customer_name}
              {job.estimate_number && ` · Est #${job.estimate_number}`}
            </p>
          </div>
        </div>
        <Select value={job.status || "unscheduled"} onValueChange={(v) => statusMutation.mutate(v)}>
          <SelectTrigger className={`w-44 rounded-xl capitalize ${JOB_STATUS_STYLES[job.status] || ""}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {JOB_STATUSES.map((s) => (
              <SelectItem key={s} value={s} className="capitalize">{s.replace(/_/g, " ")}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </motion.div>

      {/* Job info + calendar */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="bg-card rounded-2xl border border-border p-6 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Job Site</h3>
            <p className="text-card-foreground">{job.customer_address || "No address"}</p>
            {job.customer_phone && <p className="text-sm text-muted-foreground mt-1">{job.customer_phone}</p>}
          </div>
          <div>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Description</h3>
            <p className="text-sm text-card-foreground">{job.job_description || "—"}</p>
          </div>
        </div>
        {/* Schedule */}
        <div className="pt-2 border-t border-border">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <CalendarClock className="w-3.5 h-3.5" /> Schedule
          </h3>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              type="datetime-local"
              value={schedStart}
              onChange={(e) => setSchedStart(e.target.value)}
              className="rounded-lg sm:w-56"
            />
            <Select value={schedHours} onValueChange={setSchedHours}>
              <SelectTrigger className="rounded-lg sm:w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[1, 1.5, 2, 3, 4, 6, 8].map((h) => (
                  <SelectItem key={h} value={String(h)}>{h} hr{h > 1 ? "s" : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              className="rounded-lg"
              onClick={() => scheduleMutation.mutate()}
              disabled={!schedStart || scheduleMutation.isPending}
            >
              {scheduleMutation.isPending ? "Saving..." : "Save Schedule"}
            </Button>
          </div>
          {!job.scheduled_start && (
            <p className="text-xs text-muted-foreground mt-2">
              Unscheduled — calendar buttons below default to tomorrow 9:00 AM until you set a time.
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
          <a href={calendar.google} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm" className="gap-2 rounded-lg"><CalendarPlus className="w-3.5 h-3.5" /> Google Calendar</Button>
          </a>
          <a href={calendar.outlook} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm" className="gap-2 rounded-lg"><CalendarPlus className="w-3.5 h-3.5" /> Outlook</Button>
          </a>
          <Button variant="outline" size="sm" className="gap-2 rounded-lg" onClick={() => downloadICS(eventFromJob(job), "job.ics")}>
            <Download className="w-3.5 h-3.5" /> .ics
          </Button>
        </div>
      </motion.div>

      {/* Parts used — the stock deduction loop */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-card rounded-2xl border border-border p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-heading font-semibold text-card-foreground">Parts &amp; Labor</h3>
            {job.parts_confirmed_at && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Stock last confirmed {format(new Date(job.parts_confirmed_at), "MMM d, h:mm a")}
              </p>
            )}
          </div>
          <Button type="button" variant="outline" size="sm" className="gap-2 rounded-lg" onClick={addLine}>
            <Plus className="w-3.5 h-3.5" /> Add
          </Button>
        </div>

        {lines.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            No parts yet. Tap Add, then use the <span className="inline-flex align-middle"><PackageCheck className="w-4 h-4" /></span> box icon to pick from inventory.
          </p>
        ) : (
          <div className="space-y-2">
            {lines.map((line, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-center">
                <div className="col-span-1 flex justify-center">
                  <ItemPicker onSelect={(item) => pickItem(i, item)} />
                </div>
                <div className="col-span-11 sm:col-span-5">
                  <Input
                    placeholder="Description"
                    value={line.description || ""}
                    onChange={(e) => updateLine(i, { description: e.target.value })}
                    className="rounded-lg text-sm h-10"
                  />
                  {line.sku && <span className="text-xs text-muted-foreground font-mono ml-1">{line.sku}</span>}
                </div>
                <div className="col-span-6 sm:col-span-2">
                  {/* Thumb-friendly stepper for techs in the field */}
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-10 w-10 rounded-lg flex-shrink-0"
                      onClick={() => updateLine(i, { quantity: Math.max((parseFloat(line.quantity) || 0) - 1, 0) })}
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </Button>
                    <Input
                      type="number"
                      min="0"
                      step="0.5"
                      value={line.quantity ?? ""}
                      onChange={(e) => updateLine(i, { quantity: parseFloat(e.target.value) || 0 })}
                      className="rounded-lg text-sm h-10 text-center"
                      placeholder="Qty"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-10 w-10 rounded-lg flex-shrink-0"
                      onClick={() => updateLine(i, { quantity: (parseFloat(line.quantity) || 0) + 1 })}
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="col-span-3 sm:col-span-2">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={line.unit_price ?? ""}
                    onChange={(e) => updateLine(i, { unit_price: parseFloat(e.target.value) || 0 })}
                    className="rounded-lg text-sm h-10 text-right"
                    placeholder="$"
                  />
                </div>
                <div className="col-span-2 sm:col-span-1 text-right text-sm font-medium">
                  ${(line.total || 0).toFixed(2)}
                </div>
                <div className="col-span-1 flex justify-center">
                  <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-destructive" onClick={() => removeLine(i)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-3 border-t border-border">
          <span className="text-sm text-muted-foreground">
            Parts total: <strong className="text-card-foreground">${partsTotal.toFixed(2)}</strong>
          </span>
          <Button
            className="gap-2 rounded-xl h-12 sm:h-10 bg-emerald-600 hover:bg-emerald-700"
            onClick={() => usePartsMutation.mutate()}
            disabled={usePartsMutation.isPending || (!dirty && !lines.some((l) => l.item_id))}
          >
            <PackageCheck className="w-4 h-4" />
            {usePartsMutation.isPending ? "Updating stock..." : "Confirm Parts Used"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground flex items-start gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          Confirming deducts inventory-linked lines from stock. Re-confirming after changes only moves the difference; reducing a quantity returns stock.
        </p>
      </motion.div>
    </div>
  );
}
