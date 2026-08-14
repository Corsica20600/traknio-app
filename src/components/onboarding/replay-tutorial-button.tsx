"use client";

import { useState } from "react";
import { resetOnboardingAction } from "@/src/server/onboarding-actions";

export function ReplayTutorialButton() {
  const [pending, setPending] = useState(false);

  async function replay() {
    setPending(true);
    try {
      await resetOnboardingAction();
      window.dispatchEvent(new Event("traknio:onboarding-replay"));
    } finally {
      setPending(false);
    }
  }

  return <button type="button" className="ghost-btn full-line" onClick={() => { void replay(); }} disabled={pending}>{pending ? "Préparation..." : "Revoir le tutoriel"}</button>;
}
