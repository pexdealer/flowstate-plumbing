import React, { useState, useMemo } from "react";
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameDay, isSameMonth, isToday,
  format, addMonths, subMonths
} from "date-fns";
import { ChevronLeft, ChevronRight, CalendarDays, Clock } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";

const statusColors = {
  scheduled: "bg-blue-500",
  dispatched: "bg-amber-500",
  in_progress: "bg-emerald-500",
  completed: "bg-emerald-200",
  canceled: "bg-red-200",
  unscheduled: "bg-slate-300",
};

const statusLabels = {
  scheduled: "Scheduled",
  dispatched: "Dispatched",
  in_progress: "In Progress",
  completed: "Completed",
  canceled: "Canceled",
  unscheduled: "Unscheduled",
};

export default function CalendarView({ jobs = [] }) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState(null);

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 0 });
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  const jobsByDay = useMemo(() => {
    const map = {};
    jobs.forEach((job) => {
      if (job.scheduled_start) {
        const dayKey = format(new Date(job.scheduled_start), "yyyy-MM-dd");
        if (!map[dayKey]) map[dayKey] = [];
        map[dayKey].push(job);
      }
    });
    return map;
  }, [jobs]);

  const selectedJobs = selectedDay
    ? jobsByDay[format(selectedDay, "yyyy-MM-dd")] || []
    : [];

  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border flex items-center justify-between">
        <h3 className="font-heading font-semibold text-card-foreground flex items-center gap-2">
          <CalendarDays className="w-5 h-5 text-muted-foreground" />
          Job Calendar
        </h3>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-lg"
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="font-medium text-sm w-32 text-center">
            {format(currentMonth, "MMMM yyyy")}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-lg"
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="p-4">
        {/* Day headers */}
        <div className="grid grid-cols-7 mb-2">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="text-center text-xs font-medium text-muted-foreground py-1">
              {d}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-px">
          {days.map((day) => {
            const key = format(day, "yyyy-MM-dd");
            const hasJobs = !!jobsByDay[key];
            const isCurrentMonth = isSameMonth(day, currentMonth);
            const isSelected = selectedDay && isSameDay(day, selectedDay);
            const today = isToday(day);

            return (
              <button
                key={key}
                onClick={() => setSelectedDay(day)}
                className={`
                  relative flex flex-col items-center p-1.5 rounded-lg transition-all min-h-[52px]
                  ${!isCurrentMonth ? "opacity-30" : "hover:bg-muted cursor-pointer"}
                  ${isSelected ? "bg-primary/10 ring-2 ring-primary/30" : ""}
                  ${today && !isSelected ? "bg-primary/5" : ""}
                `}
              >
                <span className={`
                  text-sm w-7 h-7 flex items-center justify-center rounded-full
                  ${today ? "bg-primary text-primary-foreground font-bold" : isCurrentMonth ? "text-card-foreground" : "text-muted-foreground"}
                `}>
                  {format(day, "d")}
                </span>
                {hasJobs && isCurrentMonth && (
                  <div className="flex gap-0.5 mt-1">
                    {jobsByDay[key].slice(0, 3).map((job, i) => (
                      <span
                        key={i}
                        className={`w-1.5 h-1.5 rounded-full ${statusColors[job.status] || statusColors.unscheduled}`}
                      />
                    ))}
                    {jobsByDay[key].length > 3 && (
                      <span className="text-[9px] text-muted-foreground leading-none">
                        +{jobsByDay[key].length - 3}
                      </span>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected day jobs */}
      <AnimatePresence>
        {selectedDay && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-border overflow-hidden"
          >
            <div className="px-6 py-4">
              <p className="text-sm font-medium text-card-foreground mb-3">
                {format(selectedDay, "EEEE, MMMM d")}
              </p>
              {selectedJobs.length === 0 ? (
                <p className="text-sm text-muted-foreground">No jobs scheduled.</p>
              ) : (
                <div className="space-y-2">
                  {selectedJobs.map((job) => (
                    <Link
                      to={`/jobs/${job.id}`}
                      key={job.id}
                      className="flex items-start gap-3 p-3 rounded-xl bg-muted/50 hover:bg-muted transition-colors"
                    >
                      <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${statusColors[job.status] || statusColors.unscheduled}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-card-foreground truncate">
                          {job.title || "Untitled Job"}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {job.customer_name && `${job.customer_name}`}
                          {job.customer_name && job.job_type && " · "}
                          {job.job_type && job.job_type.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}
                        </p>
                        {job.scheduled_start && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                            <Clock className="w-3 h-3" />
                            {format(new Date(job.scheduled_start), "h:mm a")}
                            {job.scheduled_end && ` — ${format(new Date(job.scheduled_end), "h:mm a")}`}
                          </p>
                        )}
                      </div>
                      <Badge variant="secondary" className="text-xs capitalize shrink-0">
                        {statusLabels[job.status] || job.status}
                      </Badge>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Legend */}
      <div className="px-6 py-3 border-t border-border flex flex-wrap gap-3">
        {Object.entries(statusColors).slice(0, 4).map(([status, color]) => (
          <div key={status} className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${color}`} />
            <span className="text-xs text-muted-foreground capitalize">{status.replace("_", " ")}</span>
          </div>
        ))}
      </div>
    </div>
  );
}