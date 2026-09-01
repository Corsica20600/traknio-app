"use server";

import type { IntegrationProvider } from "@prisma/client";
import { redirect } from "next/navigation";
import { prisma } from "@/src/lib/prisma";
import { requirePremiumAccess } from "@/src/server/premium-access";

function asIntegrationProvider(value: FormDataEntryValue | null): IntegrationProvider | null {
  const provider = String(value ?? "").trim();
  if (provider === "SPOTIFY") return "SPOTIFY";
  if (provider === "HEALTH_CONNECT") return "HEALTH_CONNECT";
  if (provider === "SAMSUNG_HEALTH") return "SAMSUNG_HEALTH";
  return null;
}

export async function disconnectIntegrationAction(formData: FormData) {
  const profile = await requirePremiumAccess();
  const provider = asIntegrationProvider(formData.get("provider"));

  if (!provider) {
    redirect("/settings?integrationError=provider");
  }

  await prisma.integrationConnection.updateMany({
    where: { userProfileId: profile.id, provider },
    data: {
      status: "DISCONNECTED",
      accessToken: null,
      refreshToken: null,
      tokenExpiresAt: null,
      disconnectedAt: new Date(),
    },
  });

  redirect("/settings?integration=disconnected");
}

export async function enableHealthConnectPreparationAction() {
  const profile = await requirePremiumAccess();

  await prisma.integrationConnection.upsert({
    where: { userProfileId_provider: { userProfileId: profile.id, provider: "HEALTH_CONNECT" } },
    update: {
      status: "PENDING",
      scopes: ["ExerciseSession", "HeartRate", "Sleep", "TotalCaloriesBurned", "Distance"],
      metadata: {
        source: "settings",
        mode: "android_runtime_permissions_required",
      },
      disconnectedAt: null,
    },
    create: {
      userProfileId: profile.id,
      provider: "HEALTH_CONNECT",
      status: "PENDING",
      scopes: ["ExerciseSession", "HeartRate", "Sleep", "TotalCaloriesBurned", "Distance"],
      metadata: {
        source: "settings",
        mode: "android_runtime_permissions_required",
      },
    },
  });

  redirect("/settings?integration=health-ready");
}
