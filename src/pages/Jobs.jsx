import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { ClipboardList, ArrowRight, MapPin } from "lucide-react";
import { motion } from "framer-motion";

export const JOB_STATUS_STYLES = {
  unscheduled: "bg-muted text-muted-foreground",
  scheduled: "bg-primary/10 text-primary border-primary/20",
  dispatched: "bg-violet-50 text-violet-600 border-violet-200",
  in_progress: "bg-amber-50 text-amber-600 border-amber-200",
  completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  canceled: "bg-red-50 text-red-600 border-red-200",
};

export default function Jobs() {
  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ["jobs"],
    queryFn: () => base44.entities.Job.list("-created_date", 200),
  });

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-display font-bold text-foreground">Jobs</h1>
        <p className="text-muted-foreground mt-1">{jobs.length} jobs on the board</p>
      </motion.div>

      {isLoading ? (
        <div className="bg-card rounded-2xl border border-border p-16 text-center text-muted-foreground">Loading...</div>
      ) : jobs.length === 0 ? (
        <div className="bg-card rounded-2xl border border-border p-16 text-center">
          <ClipboardList className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <h3 className="font-heading font-semibold text-card-foreground mb-2">No jobs yet</h3>
          <p className="text-muted-foreground text-sm">
            Jobs appear here when a customer accepts an estimate, or from an approved estimate's Schedule &amp; Dispatch panel.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map((job, i) => (
            <motion.div key={job.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
              <Link
                to={`/jobs/${job.id}`}
                className="block bg-card rounded-2xl border border-border p-5 hover:shadow-lg hover:shadow-primary/5 transition-all group"
              >
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="font-heading font-semibold text-card-foreground truncate capitalize">
                        {job.title || job.customer_name || "Job"}
                      </h3>
                      <Badge variant="outline" className={`text-xs capitalize ${JOB_STATUS_STYLES[job.status] || JOB_STATUS_STYLES.unscheduled}`}>
                        {(job.status || "unscheduled").replace(/_/g, " ")}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                      {job.customer_address && (
                        <>
                          <MapPin className="w-3.5 h-3.5" /> {job.customer_address}
                        </>
                      )}
                      {job.scheduled_start && ` · ${format(new Date(job.scheduled_start), "MMM d, h:mm a")}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-xl font-display font-bold text-card-foreground">
                      ${(job.total || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
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
