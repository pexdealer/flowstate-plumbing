import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate, Link, useOutletContext } from "react-router-dom";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Plus, Minus, Trash2, PackageCheck, CalendarPlus, CalendarClock, Download, AlertTriangle, Clock, MapPin, Wrench, Send, FileText, CheckCircle, Loader2, Camera, Receipt, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { useAuth } from "@/lib/AuthContext";
import ItemPicker from "@/components/inventory/ItemPicker";
import { recordUsageForJob } from "@/lib/inventory";
import { calendarLinksForJob, downloadICS, eventFromJob } from "@/lib/calendar";
import { JOB_STATUS_STYLES } from "@/pages/Jobs";
import JobMediaManager from "@/components/jobs/JobMediaManager";
import { generateProposalToken } from "@/lib/proposal";

const JOB_STATUSES = ["unscheduled", "scheduled", "dispatched", "in_progress", "completed", "canceled"];

const emptyLine = { type: "material", description: "", quantity: 1, unit_price: 0, total: 0 };

export default function JobDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const tourRefs = useOutletContext();

  const [lines, setLines] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [schedStart, setSchedStart] = useState("");
  const [schedHours, setSchedHours] = useState("2");
  const [tab, setTab] = useState("details");

  const { data: job, isLoading } = useQuery({
    queryKey: ["job", id],
    queryFn: () => base44.entities.Job.get(id).catch(() => null),
  });

  const { data: invoiceData } = useQuery({
    queryKey: ["invoice", job?.invoice_id],
    queryFn: () => job?.invoice_id ? base44.entities.Invoice.filter({ id: job.invoice_id }) : Promise.resolve([]),
    enabled: !!job?.invoice_id,
  });

  const invoice = invoiceData?.[0];

  useEffect(() => {
    if (job) {
      setLines(job.line_items?.length ? job.line_items : []);
      setDirty(false);
      if (job.scheduled_start) {
        setSchedStart(format(new Date(job.scheduled_start), "yyyy-MM-dd'T'HH:mm"));
        if (job.scheduled_end) {
          const hrs = (new Date(job.scheduled_end) - new Date(job.scheduled_start)) / 3600000;
          if (hrs > 0) setSchedHours(String(hrs));
        }
      }
    }
  }, [job]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["job", id] });
    queryClient.invalidateQueries({ queryKey: ["jobs"] });
    queryClient.invalidateQueries({ queryKey: ["inventory"] });
    if (job?.invoice_id) queryClient.invalidateQueries({ queryKey: ["invoice", job.invoice_id] });
  };

  // Status update
  const statusMutation = useMutation({
    mutationFn: (status) => base44.entities.Job.update(id, { status }),
    onSuccess: () => { invalidate(); toast.success("Status updated"); },
    onError: (e) => toast.error(e?.message || "Could not update status"),
  });

  // Schedule
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
      toast.success("Schedule saved");
    },
    onError: (e) => toast.error(e?.message || "Could not save schedule"),
  });

  // Parts confirmation
  const usePartsMutation = useMutation({
    mutationFn: async () => {
      const cleaned = lines.filter((l) => l.description || l.item_id);
      await base44.entities.Job.update(id, { line_items: cleaned });
      return recordUsageForJob({ ...job, line_items: cleaned }, { performedBy: user?.email });
    },
    onSuccess: (result) => {
      invalidate();
      if (result.failed?.length) {
        toast.error(`${result.failed.length} item${result.failed.length > 1 ? "s" : ""} failed to update`);
        return;
      }
      setDirty(false);
      if (result.oversold?.length) {
        toast.warning("Some stock went negative — recorded anyway");
      } else {
        toast.success("Parts confirmed — stock updated");
      }
    },
    onError: (e) => toast.error(e?.message || "Could not confirm parts"),
  });

  // Photo mutations
  const photoMutation = useMutation({
    mutationFn: async ({ key, urls }) => {
      await base44.entities.Job.update(id, { [key]: urls });
      if (job.invoice_id) await base44.entities.Invoice.update(job.invoice_id, { [key]: urls });
    },
    onSuccess: () => { invalidate(); },
    onError: (e) => toast.error(e?.message || "Could not update photos"),
  });

  const addPhoto = (category, url) => {
    const key = category === "before" ? "photos_before" : "photos_after";
    const current = job[key] || [];
    photoMutation.mutate({ key, urls: [...current, url] });
  };

  const removePhoto = (category, url) => {
    const key = category === "before" ? "photos_before" : "photos_after";
    const current = job[key] || [];
    photoMutation.mutate({ key, urls: current.filter((u) => u !== url) });
  };

  // Invoice generation
  const invoiceMutation = useMutation({
    mutationFn: async () => {
      let estimate = null;
      if (job.estimate_id) {
        const estData = await base44.entities.Estimate.filter({ id: job.estimate_id });
        estimate = estData?.[0];
      }
      const token = generateProposalToken();
      const invoiceNumber = `INV-${Date.now().toString().slice(-6)}`;
      const inv = await base44.entities.Invoice.create({
        invoice_number: invoiceNumber,
        job_id: job.id,
        estimate_id: job.estimate_id || "",
        customer_name: job.customer_name || "",
        customer_address: job.customer_address || "",
        customer_phone: job.customer_phone || "",
        customer_email: "",
        job_type: job.job_type || "",
        job_description: job.job_description || "",
        photos_before: job.photos_before || [],
        photos_after: job.photos_after || [],
        line_items: estimate?.line_items || [],
        subtotal: estimate?.subtotal || job.total || 0,
        total: job.total || estimate?.total || 0,
        status: "draft",
        public_token: token,
        due_date: new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0],
      });
      await base44.entities.Job.update(id, { invoice_id: inv.id, invoice_status: "draft" });
      return inv;
    },
    onSuccess: () => { invalidate(); toast.success("Invoice created"); },
    onError: (e) => toast.error(e?.message || "Could not create invoice"),
  });

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
        <Link to="/"><Button variant="outline">Back to Dashboard</Button></Link>
      </div>
    );
  }

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

  const partsTotal = lines.reduce((s, l) => s + (l.total || 0), 0);

  const calendar = calendarLinksForJob(job);

  const tabs = [
    { id: "details", label: "Details" },
    { id: "media", label: "Photos" },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" className="rounded-xl" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-display font-bold text-foreground capitalize">
                {job.title || job.customer_name || "Job"}
              </h1>
              <Badge variant="outline" className={`capitalize ${JOB_STATUS_STYLES[job.status] || ""}`}>
                {job.status?.replace(/_/g, " ")}
              </Badge>
            </div>
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

      {/* Schedule */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-2xl border border-border p-6">
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
      </motion.div>

      {/* Invoice section */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-2xl border border-border p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <h3 className="font-heading font-semibold text-card-foreground flex items-center gap-2">
            <Receipt className="w-5 h-5 text-muted-foreground" />
            Invoice
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            {(!job.invoice_id || !invoice) && job.status === "completed" && (
              <Button
                size="sm"
                className="gap-2 rounded-lg"
                onClick={() => invoiceMutation.mutate()}
                disabled={invoiceMutation.isPending}
              >
                {invoiceMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
                Generate
              </Button>
            )}
            {invoice && invoice.status === "draft" && (
              <Button
                size="sm"
                className="gap-2 rounded-lg"
                onClick={() => { /* send logic */ }}
              >
                <Send className="w-3.5 h-3.5" /> Send
              </Button>
            )}
          </div>
        </div>
        {invoice ? (
          <div className="text-sm">
            <p>Invoice #{invoice.invoice_number} — ${invoice.total?.toFixed(2)}</p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No invoice yet. Generate one after completing the job.</p>
        )}
      </motion.div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted p-1 rounded-xl w-fit">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Details tab */}
      {tab === "details" && (
        <div className="space-y-6">
          {/* Parts / Line items */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-2xl border border-border p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-heading font-semibold text-card-foreground">Parts &amp; Labor</h3>
              <Button variant="outline" size="sm" className="gap-2 rounded-lg" onClick={addLine}>
                <Plus className="w-3.5 h-3.5" /> Add
              </Button>
            </div>
            {/* ... line items table (same as claude version) */}
            {lines.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                No parts yet. Tap Add, then use the package icon to pick from inventory.
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
                    </div>
                    <div className="col-span-6 sm:col-span-2">
                      <div className="flex items-center gap-1">
                        <Button variant="outline" size="icon" className="h-10 w-10 rounded-lg flex-shrink-0" onClick={() => updateLine(i, { quantity: Math.max((parseFloat(line.quantity) || 0) - 1, 0) })}>
                          <Minus className="w-3.5 h-3.5" />
                        </Button>
                        <Input
                          type="number"
                          min="0"
                          step="0.5"
                          value={line.quantity ?? ""}
                          onChange={(e) => updateLine(i, { quantity: parseFloat(e.target.value) || 0 })}
                          className="rounded-lg text-sm h-10 text-center"
                        />
                        <Button variant="outline" size="icon" className="h-10 w-10 rounded-lg flex-shrink-0" onClick={() => updateLine(i, { quantity: (parseFloat(line.quantity) || 0) + 1 })}>
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
                      />
                    </div>
                    <div className="col-span-2 sm:col-span-1 text-right text-sm font-medium">
                      ${(line.total || 0).toFixed(2)}
                    </div>
                    <div className="col-span-1 flex justify-center">
                      <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-destructive" onClick={() => removeLine(i)}>
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
          </motion.div>
        </div>
      )}

      {/* Media tab */}
      {tab === "media" && (
        <motion.div ref={tourRefs?.jobPhotosRef} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-2xl border border-border p-6">
          <JobMediaManager
            photosBefore={job.photos_before || []}
            photosAfter={job.photos_after || []}
            onAdd={addPhoto}
            onRemove={removePhoto}
            disabled={photoMutation.isPending}
          />
        </motion.div>
      )}
    </div>
  );
}