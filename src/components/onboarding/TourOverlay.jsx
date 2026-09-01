import React, { useState, useEffect, useCallback } from "react";
import TourBalloon from "@/components/onboarding/TourBalloon";

const STORAGE_KEY = "pipeflow_tour_completed_v2";

const STEPS = [
  {
    id: "new-estimate",
    title: "Create Estimates",
    description: "Start here to build a professional job proposal in seconds. Add line items, markup, and send it directly to your customer.",
    refKey: "newEstimateRef",
    placement: "bottom",
  },
  {
    id: "recent-estimates",
    title: "Track Your Pipeline",
    description: "All your estimates live here — see which ones are pending, approved, or need follow-up at a glance.",
    refKey: "recentEstimatesRef",
    placement: "left",
  },
  {
    id: "calendar",
    title: "Job Calendar",
    description: "Once an estimate is approved, the job automatically shows up here so you can see your crew's daily schedule.",
    refKey: "calendarRef",
    placement: "top",
  },
  {
    id: "customers",
    title: "Customer Database",
    description: "Store customer details, addresses, and past jobs here. Everything ties together for quick re-estimating.",
    refKey: "customersNavRef",
    placement: "right",
  },
  {
    id: "job-status",
    title: "Track Job Progress",
    description: "Click through each status — from scheduled to completed — to keep your crew and customers in sync.",
    refKey: "jobStatusRef",
    placement: "bottom",
  },
  {
    id: "job-photos",
    title: "Before & After Photos",
    description: "Snap job-site photos right from your phone. Before/after galleries make quality visible to homeowners.",
    refKey: "jobPhotosRef",
    placement: "top",
  },
  {
    id: "job-invoice",
    title: "Invoice from the Job",
    description: "Once the job is marked complete, generate an invoice here. It pulls line items from the estimate and gives you a customer-friendly payment link.",
    refKey: "jobInvoiceRef",
    placement: "top",
  },
];

export default function TourOverlay({ refs }) {
  const [step, setStep] = useState(1);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const completed = localStorage.getItem(STORAGE_KEY);
    if (!completed) {
      // Small delay so the page renders targets first
      const t = setTimeout(() => setActive(true), 600);
      return () => clearTimeout(t);
    }
  }, []);

  const finish = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, "true");
    setActive(false);
  }, []);

  const skip = useCallback(() => {
    finish();
  }, [finish]);

  const next = useCallback(() => {
    if (step >= STEPS.length) {
      finish();
    } else {
      setStep((s) => s + 1);
    }
  }, [step, finish]);

  const prev = useCallback(() => {
    setStep((s) => Math.max(1, s - 1));
  }, []);

  // Auto-skip steps whose target element isn't in the DOM (e.g. job-detail
  // features when the user is on the dashboard).
  useEffect(() => {
    if (!active) return;
    const currentStep = STEPS[step - 1];
    const targetRef = refs?.[currentStep.refKey];
    if (!targetRef?.current) {
      // Small delay so React has a chance to render after navigation
      const t = setTimeout(() => {
        if (step >= STEPS.length) {
          finish();
        } else {
          setStep((s) => s + 1);
        }
      }, 100);
      return () => clearTimeout(t);
    }
  }, [step, active, refs, finish]);

  if (!active) return null;

  const currentStep = STEPS[step - 1];
  const targetRef = refs?.[currentStep.refKey];

  if (!targetRef?.current) return null;

  return (
    <TourBalloon
      targetRef={targetRef}
      step={step}
      totalSteps={STEPS.length}
      title={currentStep.title}
      description={currentStep.description}
      placement={currentStep.placement}
      onNext={next}
      onPrev={prev}
      onSkip={skip}
    />
  );
}