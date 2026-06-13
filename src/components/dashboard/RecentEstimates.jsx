import React from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { ArrowRight } from "lucide-react";
import { motion } from "framer-motion";

const statusStyles = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-primary/10 text-primary border-primary/20",
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  declined: "bg-red-50 text-red-600 border-red-200",
  expired: "bg-amber-50 text-amber-600 border-amber-200",
};

export default function RecentEstimates({ estimates }) {
  if (!estimates || estimates.length === 0) {
    return (
      <div className="bg-card rounded-2xl border border-border p-8 text-center">
        <p className="text-muted-foreground text-sm">No estimates yet. Create your first one!</p>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden">
      <div className="px-6 py-4 border-b border-border flex items-center justify-between">
        <h3 className="font-heading font-semibold text-card-foreground">Recent Estimates</h3>
        <Link to="/estimates" className="text-sm text-primary hover:text-primary/80 flex items-center gap-1 font-medium transition-colors">
          View all <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
      <div className="divide-y divide-border">
        {estimates.slice(0, 5).map((est, i) => (
          <motion.div
            key={est.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            <Link
              to={`/estimates/${est.id}`}
              className="flex items-center gap-4 px-6 py-4 hover:bg-muted/50 transition-colors group"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-sm text-card-foreground truncate">
                    {est.customer_name || "Unnamed"}
                  </span>
                  {est.estimate_number && (
                    <span className="text-xs text-muted-foreground">#{est.estimate_number}</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {est.job_type?.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())} · {format(new Date(est.created_date), "MMM d, yyyy")}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-display font-semibold text-sm text-card-foreground">
                  ${(est.total || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </span>
                <Badge variant="outline" className={`text-xs capitalize ${statusStyles[est.status] || statusStyles.draft}`}>
                  {est.status || "draft"}
                </Badge>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </Link>
          </motion.div>
        ))}
      </div>
    </div>
  );
}