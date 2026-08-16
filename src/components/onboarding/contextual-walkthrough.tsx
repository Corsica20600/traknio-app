"use client";

import { useEffect, useState } from "react";
import { markOnboardingStepAction } from "@/src/server/onboarding-actions";
import type { OnboardingStep } from "@/src/lib/onboarding";

type Position = { top: number; left: number; placement: "top" | "bottom" };

export function ContextualWalkthrough({
  active,
  step,
  target,
  title = "Astuce",
  message,
}: {
  active: boolean;
  step: OnboardingStep;
  target: string;
  title?: string;
  message: string;
}) {
  const [position, setPosition] = useState<Position | null>(null);
  const [dismissedStep, setDismissedStep] = useState<OnboardingStep | null>(null);
  const visible = active && dismissedStep !== step;

  useEffect(() => {
    if (!visible) return;
    const element = document.querySelector<HTMLElement>(target);
    if (!element) return;

    const updatePosition = () => {
      const rect = element.getBoundingClientRect();
      const bubbleWidth = Math.min(328, window.innerWidth - 24);
      const left = Math.max(12, Math.min(rect.left + rect.width / 2 - bubbleWidth / 2, window.innerWidth - bubbleWidth - 12));
      const showAbove = rect.bottom + 188 > window.innerHeight && rect.top > 188;
      setPosition({
        top: showAbove ? Math.max(12, rect.top - 12) : Math.min(window.innerHeight - 12, rect.bottom + 12),
        left,
        placement: showAbove ? "top" : "bottom",
      });
    };

    element.classList.add("onboarding-target-highlight");
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      element.classList.remove("onboarding-target-highlight");
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [target, visible]);

  useEffect(() => {
    const dismissFromAction = (event: Event) => {
      if ((event as CustomEvent<{ step?: OnboardingStep }>).detail?.step === step) {
        void dismiss();
      }
    };
    window.addEventListener("traknio:onboarding-dismiss", dismissFromAction);
    return () => window.removeEventListener("traknio:onboarding-dismiss", dismissFromAction);
  // dismiss is intentionally not a dependency: adding it would resubscribe on every render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  if (!visible || !position) return null;

  async function dismiss() {
    setDismissedStep(step);
    await markOnboardingStepAction(step);
  }

  return (
    <>
      <div className="onboarding-contextual-backdrop" aria-hidden="true" />
      <section
        className={`onboarding-contextual-bubble is-${position.placement}`}
        style={{ top: position.top, left: position.left }}
        aria-label={title}
      >
        <p className="eyebrow">{title}</p>
        <p>{message}</p>
        <div className="onboarding-contextual-actions">
          <button type="button" className="ghost-btn" onClick={() => { void dismiss(); }}>Passer</button>
          <button type="button" className="primary-button" onClick={() => { void dismiss(); }}>Compris</button>
        </div>
      </section>
    </>
  );
}
