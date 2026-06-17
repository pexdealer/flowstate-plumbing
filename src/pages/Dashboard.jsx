import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { FileText, Users, DollarSign, TrendingUp, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import StatCard from "@/components/dashboard/StatCard";
import RecentEstimates from "@/components/dashboard/RecentEstimates";
import EstimateChart from "@/components/dashboard/EstimateChart";
import CalendarView from "@/components/dashboard/CalendarView";
import { motion } from "framer-motion";

export default function Dashboard() {
  const { data: estimates = [], isLoading: loadingEst } = useQuery({
    queryKey: ["estimates"],
    queryFn: () => base44.entities.Estimate.list("-created_date", 100),
  });

  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: () => base44.entities.Customer.list("-created_date", 100),
  });

  const { data: jobs = [] } = useQuery({
    queryKey: ["jobs"],
    queryFn: () => base44.entities.Job.list("-scheduled_start", 100),
  });

  const totalRevenue = estimates.filter(e => e.status === "approved").reduce((s, e) => s + (e.total || 0), 0);
  const pendingCount = estimates.filter(e => e.status === "sent").length;
  const approvedCount = estimates.filter(e => e.status === "approved").length;

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      >
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Welcome back — here's your business at a glance.</p>
        </div>
        <Link to="/estimates/new">
          <Button className="gap-2 rounded-xl shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all">
            <Plus className="w-4 h-4" />
            New Estimate
          </Button>
        </Link>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Estimates"
          value={estimates.length}
          subtitle={`${pendingCount} pending`}
          icon={FileText}
          color="primary"
          index={0}
        />
        <StatCard
          title="Approved"
          value={approvedCount}
          subtitle={`${((approvedCount / (estimates.length || 1)) * 100).toFixed(0)}% win rate`}
          icon={TrendingUp}
          color="success"
          index={1}
        />
        <StatCard
          title="Revenue"
          value={`$${totalRevenue.toLocaleString("en-US", { minimumFractionDigits: 0 })}`}
          subtitle="From approved estimates"
          icon={DollarSign}
          color="accent"
          index={2}
        />
        <StatCard
          title="Customers"
          value={customers.length}
          icon={Users}
          color="warning"
          index={3}
        />
      </div>

      {/* Chart + Recent */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3">
          <EstimateChart estimates={estimates} />
        </div>
        <div className="lg:col-span-2">
          <RecentEstimates estimates={estimates} />
        </div>
      </div>

      {/* Calendar */}
      <CalendarView jobs={jobs} />
    </div>
  );
}