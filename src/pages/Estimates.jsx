import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Search, ArrowRight, FileText } from "lucide-react";
import { motion } from "framer-motion";

const statusStyles = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-primary/10 text-primary border-primary/20",
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  declined: "bg-red-50 text-red-600 border-red-200",
  expired: "bg-amber-50 text-amber-600 border-amber-200",
};

export default function Estimates() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: estimates = [], isLoading } = useQuery({
    queryKey: ["estimates"],
    queryFn: () => base44.entities.Estimate.list("-created_date", 200),
  });

  const filtered = estimates.filter((e) => {
    const matchesSearch = [e.customer_name, e.estimate_number, e.job_description]
      .join(" ").toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || e.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Estimates</h1>
          <p className="text-muted-foreground mt-1">{estimates.length} total estimates</p>
        </div>
        <Link to="/estimates/new">
          <Button className="gap-2 rounded-xl shadow-lg shadow-primary/20">
            <Plus className="w-4 h-4" /> New Estimate
          </Button>
        </Link>
      </motion.div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search estimates..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 rounded-xl bg-card"
          />
        </div>
        <Tabs value={statusFilter} onValueChange={setStatusFilter}>
          <TabsList className="bg-card border border-border">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="draft">Draft</TabsTrigger>
            <TabsTrigger value="sent">Sent</TabsTrigger>
            <TabsTrigger value="approved">Approved</TabsTrigger>
            <TabsTrigger value="declined">Declined</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-card rounded-2xl border border-border p-6 animate-pulse">
              <div className="h-5 w-40 bg-muted rounded mb-2" />
              <div className="h-4 w-64 bg-muted rounded" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-card rounded-2xl border border-border p-16 text-center">
          <FileText className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <h3 className="font-heading font-semibold text-card-foreground mb-2">No estimates found</h3>
          <p className="text-muted-foreground text-sm mb-6">Create your first estimate to get started.</p>
          <Link to="/estimates/new">
            <Button className="gap-2 rounded-xl">
              <Plus className="w-4 h-4" /> Create Estimate
            </Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((est, i) => (
            <motion.div
              key={est.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
            >
              <Link
                to={`/estimates/${est.id}`}
                className="block bg-card rounded-2xl border border-border p-5 hover:shadow-lg hover:shadow-primary/5 transition-all group"
              >
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="font-heading font-semibold text-card-foreground">
                        {est.customer_name || "Unnamed"}
                      </h3>
                      <Badge variant="outline" className={`text-xs capitalize ${statusStyles[est.status] || statusStyles.draft}`}>
                        {est.status || "draft"}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {est.estimate_number && `#${est.estimate_number} · `}
                      {est.job_type?.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}
                      {est.created_date && ` · ${format(new Date(est.created_date), "MMM d, yyyy")}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-xl font-display font-bold text-card-foreground">
                      ${(est.total || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
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