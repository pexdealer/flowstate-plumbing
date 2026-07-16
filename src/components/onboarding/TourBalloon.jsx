import React, { useEffect, useState } from "react";
import { X, ChevronLeft, ChevronRight, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";

export default function TourBalloon({
  targetRef,
  step,
  totalSteps,
  title,
  description,
  onNext,
  onPrev,
  onSkip,
  placement = "bottom",
}) {
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [arrowPos, setArrowPos] = useState("bottom");

  useEffect(() => {
    if (!targetRef?.current) return;

    const updatePos = () => {
      const rect = targetRef.current.getBoundingClientRect();
      const viewportW = window.innerWidth;
      const viewportH = window.innerHeight;
      const balloonW = Math.min(320, viewportW - 24);
      const balloonH = 160;
      const gap = 16;

      let top, left, arrow;

      if (placement === "bottom") {
        top = rect.bottom + gap;
        left = rect.left + rect.width / 2 - balloonW / 2;
        arrow = "top";
      } else if (placement === "top") {
        top = rect.top - balloonH - gap;
        left = rect.left + rect.width / 2 - balloonW / 2;
        arrow = "bottom";
      } else if (placement === "right") {
        top = rect.top + rect.height / 2 - balloonH / 2;
        left = rect.right + gap;
        arrow = "left";
      } else {
        top = rect.top + rect.height / 2 - balloonH / 2;
        left = rect.left - balloonW - gap;
        arrow = "right";
      }

      // Clamp to viewport
      left = Math.max(12, Math.min(left, viewportW - balloonW - 12));
      top = Math.max(12, Math.min(top, viewportH - balloonH - 12));

      setPos({ top, left });
      setArrowPos(arrow);
    };

    updatePos();
    window.addEventListener("resize", updatePos);
    window.addEventListener("scroll", updatePos);
    return () => {
      window.removeEventListener("resize", updatePos);
      window.removeEventListener("scroll", updatePos);
    };
  }, [targetRef, placement]);

  const arrowStyles = {
    top: "bottom-full left-1/2 -translate-x-1/2 border-l-8 border-r-8 border-b-8 border-l-transparent border-r-transparent border-b-card",
    bottom: "top-full left-1/2 -translate-x-1/2 border-l-8 border-r-8 border-t-8 border-l-transparent border-r-transparent border-t-card",
    left: "right-full top-1/2 -translate-y-1/2 border-t-8 border-b-8 border-r-8 border-t-transparent border-b-transparent border-r-card",
    right: "left-full top-1/2 -translate-y-1/2 border-t-8 border-b-8 border-l-8 border-t-transparent border-b-transparent border-l-card",
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100]"
      >
        {/* Backdrop with spotlight cutout — simple dim */}
        <div className="absolute inset-0 bg-black/40" />

        {/* Balloon */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ type: "spring", damping: 20, stiffness: 260 }}
          className="absolute bg-card rounded-2xl shadow-2xl border border-border p-5 w-[320px]"
          style={{ top: pos.top, left: pos.left }}
        >
          {/* Arrow */}
          <div className={`absolute w-0 h-0 ${arrowStyles[arrowPos]}`} />

          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-primary bg-primary/10 px-2.5 py-1 rounded-full">
              Step {step} of {totalSteps}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-lg text-muted-foreground hover:text-foreground"
              onClick={onSkip}
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>

          {/* Content */}
          <h4 className="font-display font-semibold text-card-foreground text-base mb-1">
            {title}
          </h4>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            {description}
          </p>

          {/* Footer */}
          <div className="flex items-center justify-between">
            <button
              onClick={onSkip}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Skip tour
            </button>
            <div className="flex items-center gap-2">
              {step > 1 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-lg gap-1 h-8 text-xs"
                  onClick={onPrev}
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Back
                </Button>
              )}
              <Button
                size="sm"
                className="rounded-lg gap-1 h-8 text-xs"
                onClick={onNext}
              >
                {step === totalSteps ? (
                  <>Got it <Play className="w-3.5 h-3.5" /></>
                ) : (
                  <>Next <ChevronRight className="w-3.5 h-3.5" /></>
                )}
              </Button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}