import React, { useState, useEffect, useCallback } from "react";
import TourBalloon from "@/components/onboarding/TourBalloon";

const STORAGE_KEY = "pipeflow_tour_completed";

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