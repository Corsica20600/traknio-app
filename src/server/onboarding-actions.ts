"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { ONBOARDING_VERSION, parseOnboardingState, type OnboardingSnapshot, type OnboardingStep } from "@/src/lib/onboarding";
import { prisma } from "@/src/lib/prisma";
import { getAuthenticatedUserProfile } from "@/src/server/fitness-queries";

export async function getOnboardingSnapshot(): Promise<OnboardingSnapshot> {
  const profile = await getAuthenticatedUserProfile();
  return {
    version: profile.onboardingVersion,
    state: parseOnboardingState(profile.onboardingState),
  };
}

export async function markOnboardingStepForProfile(profileId: string, step: OnboardingStep) {
  const profile = await prisma.userProfile.findUnique({
    where: { id: profileId },
    select: { onboardingVersion: true, onboardingState: true },
  });
  if (!profile) return;

  const state = parseOnboardingState(profile.onboardingState);
  await prisma.userProfile.update({
    where: { id: profileId },
    data: {
      onboardingVersion: step === "initialCompleted"
        ? Math.max(profile.onboardingVersion, ONBOARDING_VERSION)
        : profile.onboardingVersion,
      onboardingState: { ...state, [step]: true },
    },
  });
}

export async function markOnboardingStepAction(step: OnboardingStep) {
  const profile = await getAuthenticatedUserProfile();
  await markOnboardingStepForProfile(profile.id, step);
  revalidatePath("/programs");
}

export async function completeInitialOnboardingAction() {
  await markOnboardingStepAction("initialCompleted");
}

export async function resetOnboardingAction() {
  const profile = await getAuthenticatedUserProfile();
  await prisma.userProfile.update({
    where: { id: profile.id },
    data: { onboardingVersion: 0, onboardingState: Prisma.JsonNull },
  });
  revalidatePath("/settings");
  revalidatePath("/programs");
}
