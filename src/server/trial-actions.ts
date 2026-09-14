"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/src/lib/prisma";
import { ACCOUNT_TRIAL_MS, hasSubscriptionAccess } from "@/src/lib/premium-access-rules";
import { getAuthenticatedUserProfile } from "./fitness-queries";

export async function activateAccountTrial() {
  // Android acquisition is exclusively governed by Google Play. Existing legacy trials
  // are read by the entitlement rules and are never altered here.
  const userAgent = (await headers()).get("user-agent") ?? "";
  if (/Android/i.test(userAgent) && /\bwv\b|Version\/4\.0/i.test(userAgent)) {
    redirect("/settings?access=google-play");
  }
  const profile = await getAuthenticatedUserProfile();
  if (!hasSubscriptionAccess(profile) && !profile.trialStartedAt) {
    const now = new Date();
    // Atomic condition: repeated clicks cannot restart or extend the trial.
    await prisma.userProfile.updateMany({
      where: { id: profile.id, trialStartedAt: null, trialEndsAt: null, subscriptionStatus: "FREE" },
      data: { trialStartedAt: now, trialEndsAt: new Date(now.getTime() + ACCOUNT_TRIAL_MS) },
    });
  }
  redirect("/settings");
}
