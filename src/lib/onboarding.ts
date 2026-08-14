export const ONBOARDING_VERSION = 1;

export type OnboardingStep =
  | "initialCompleted"
  | "programCreateSeen"
  | "programDaySeen"
  | "programExerciseSeen"
  | "reorderSeen";

export type OnboardingState = Partial<Record<OnboardingStep, boolean>>;

export type OnboardingSnapshot = {
  version: number;
  state: OnboardingState;
};

export function parseOnboardingState(value: unknown): OnboardingState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const source = value as Record<string, unknown>;
  const steps: OnboardingStep[] = [
    "initialCompleted",
    "programCreateSeen",
    "programDaySeen",
    "programExerciseSeen",
    "reorderSeen",
  ];

  return Object.fromEntries(
    steps.filter((step) => source[step] === true).map((step) => [step, true]),
  ) as OnboardingState;
}
