"use client";

import { ContextualWalkthrough } from "@/src/components/onboarding/contextual-walkthrough";
import { ONBOARDING_VERSION, type OnboardingSnapshot } from "@/src/lib/onboarding";

export function ProgramsOnboarding({ onboarding, programs, exercises }: {
  onboarding: OnboardingSnapshot | null;
  programs: number;
  exercises: number;
}) {
  // Profiles that existed before Lot 1 have version 1 but no completed initial
  // walkthrough marker. They stay entirely untouched unless they explicitly
  // choose "Revoir le tutoriel".
  if (!onboarding || onboarding.version < ONBOARDING_VERSION || !onboarding.state.initialCompleted) return null;
  const { state } = onboarding;

  return (
    <>
      <ContextualWalkthrough active={!state.programCreateSeen && programs === 0} step="programCreateSeen" target="[data-onboarding-target='program-create']" message="Crée ton premier programme ici." />
      <ContextualWalkthrough active={!state.programExerciseSeen && programs > 0 && exercises === 0} step="programExerciseSeen" target="[data-onboarding-target='program-exercise']" message="Ajoute ici les exercices de cette journée." />
    </>
  );
}
