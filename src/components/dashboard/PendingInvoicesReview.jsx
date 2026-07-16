import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Receipt, CheckCircle2, ArrowRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import InvoiceReviewModal from "@/components/dashboard/InvoiceReviewModal";
import { toast } from "sonner";

export default function PendingInvoicesReview() {
  const queryClient = useQueryClient();
  const [reviewing, setReviewing] = useState(null);

  const { data: drafts = [], isLoading } = useQuery({
    queryKey: ["invoices", "draft"],
    queryFn: () => base44.entities.Invoice.filter({ status: "draft" }, "-created_date", 50),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["invoices", "draft"] });
    queryClient.invalidateQueries({ queryKey: ["invoices"] });
  };

  const handleApproved = () => {
    setReviewing(null);
    refresh();
    toast.success("Invoice approved & sent");
  };

  if (!isLoading && drafts.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 flex items-center gap-3"
      >
        <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
        <div>
          <p className="font-medium text-emerald-800 text-sm">All caught up</p>
          <p className="text-emerald-600 text-xs">No invoices waiting for review.</p>
        </div>
      </motion.div>
    );
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-card rounded-2xl border border-amber-200 p-5 space-y-4"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Receipt className="w-5 h-5 text-amber-600" />
            <h3 className="font-heading font-semibold text-card-foreground">Pending Invoice Review</h3>
            <Badge className="bg-amber-100 text-amber-700 border-amber-200">
              {drafts.length} ready
            </Badge>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2].map(i => (
              <div key={i} className="h-14 bg-muted rounded-xl animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            <AnimatePresence>
              {drafts.map((inv, i) => (
                <motion.div
                  key={inv.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ delay: i * 0.05 }}
                  className="flex items-center gap-3 bg-amber-50/50 border border-amber-100 rounded-xl p-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-card-foreground text-sm truncate">
                        {inv.customer_name || "Unnamed"}
                      </p>
                      <span className="text-xs text-muted-foreground">#{inv.invoice_number}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {inv.job_type ? `${inv.job_type.replace(/_/g, " ")} · ` : ""}
                      Due {inv.due_date ? format(new Date(inv.due_date), "MMM d") : "—"}
                    </p>
                  </div>
                  <span className="font-display font-bold text-card-foreground text-lg whitespace-nowrap">
                    ${(inv.total || 0).toFixed(2)}
                  </span>
                  <Button
                    size="sm"
                    className="gap-1.5 rounded-lg shrink-0"
                    onClick={() => setReviewing(inv)}
                  >
                    Review <ArrowRight className="w-3.5 h-3.5" />
                  </Button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </motion.div>

      {reviewing && (
        <InvoiceReviewModal
          invoice={reviewing}
          onClose={() => setReviewing(null)}
          onApproved={handleApproved}
        />
      )}
    </>
  );
}