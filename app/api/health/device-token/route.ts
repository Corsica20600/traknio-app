import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { hashDeviceToken } from "@/src/lib/device-token";
import { requirePremiumApiAccess } from "@/src/server/premium-access";

type TokenRequest = {
  label?: string;
};

function createHealthDeviceToken() {
  return `trkh_${randomBytes(32).toString("base64url")}`;
}

function cleanDeviceLabel(value: unknown) {
  const label = typeof value === "string" ? value.trim() : "";
  return label.slice(0, 40) || "Téléphone Android";
}

export async function POST(request: Request) {
  const access = await requirePremiumApiAccess().catch(() => null);
  if (!access) return NextResponse.json({ ok: false, error: "auth_required" }, { status: 401 });
  if (!access.ok) return access.response;
  const { profile } = access;

  let body: TokenRequest = {};
  try {
    body = (await request.json()) as TokenRequest;
  } catch {
    body = {};
  }

  const token = createHealthDeviceToken();
  const label = cleanDeviceLabel(body.label);

  await prisma.healthDevice.create({
    data: {
      userProfileId: profile.id,
      label,
      tokenHash: hashDeviceToken(token),
      lastSeenAt: new Date(),
    },
  });

  await prisma.integrationConnection.upsert({
    where: { userProfileId_provider: { userProfileId: profile.id, provider: "HEALTH_CONNECT" } },
    update: {
      status: "PENDING",
      displayName: "Health Connect",
      scopes: ["ExerciseSession", "HeartRate", "Sleep", "TotalCaloriesBurned", "Distance"],
      disconnectedAt: null,
      metadata: {
        source: "android_device_token",
        deviceLabel: label,
      },
    },
    create: {
      userProfileId: profile.id,
      provider: "HEALTH_CONNECT",
      status: "PENDING",
      displayName: "Health Connect",
      scopes: ["ExerciseSession", "HeartRate", "Sleep", "TotalCaloriesBurned", "Distance"],
      metadata: {
        source: "android_device_token",
        deviceLabel: label,
      },
    },
  });

  return NextResponse.json({ ok: true, token });
}
