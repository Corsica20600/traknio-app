import { createHmac, randomBytes } from "crypto";
import { hasPremiumAccess } from "@/src/lib/premium-access-rules";
import { prisma } from "@/src/lib/prisma";
import { hashWatchDeviceToken } from "@/src/lib/watch-device-token";

const PAIRING_TOKEN_TTL_MS = 60_000;

type PairingProfile = {
  id: string;
  email: string | null;
  subscriptionStatus: string;
  subscriptionCurrentPeriodEnd: Date | null;
  trialStartedAt?: Date | null;
  trialEndsAt?: Date | null;
};

export function createAccountPairingId(profile: Pick<PairingProfile, "id">) {
  const secret = process.env.INTEGRATION_ENCRYPTION_KEY
    || process.env.NEXTAUTH_SECRET
    || process.env.AUTH_SECRET
    || "traknio-local-pairing";

  return createHmac("sha256", secret)
    .update(profile.id)
    .digest("base64url")
    .slice(0, 32);
}

function createPairingToken() {
  return `trkp_${randomBytes(32).toString("base64url")}`;
}

function createWatchDeviceToken() {
  return `trkw_${randomBytes(32).toString("base64url")}`;
}

export function cleanWatchLabel(value: unknown) {
  const label = String(value ?? "").trim();
  return label.slice(0, 40) || "Montre Wear OS";
}

export async function createTemporaryWatchPairingToken(profile: PairingProfile, labelValue: unknown) {
  if (!hasPremiumAccess(profile)) {
    return { ok: false as const, status: 402, error: "premium_required" };
  }

  const label = cleanWatchLabel(labelValue);
  const token = createPairingToken();
  const expiresAt = new Date(Date.now() + PAIRING_TOKEN_TTL_MS);

  await prisma.watchPairingToken.create({
    data: {
      userProfileId: profile.id,
      label,
      tokenHash: hashWatchDeviceToken(token),
      expiresAt,
    },
  });

  return {
    ok: true as const,
    pairingToken: token,
    expiresAt,
    accountPairingId: createAccountPairingId(profile),
  };
}

export async function completeWatchPairing(pairingToken: string, labelValue: unknown) {
  const token = pairingToken.trim();
  if (!token) {
    return { ok: false as const, status: 400, error: "missing_pairing_token" };
  }

  const pairing = await prisma.watchPairingToken.findUnique({
    where: { tokenHash: hashWatchDeviceToken(token) },
    include: {
      userProfile: {
        select: {
          id: true,
          email: true,
          subscriptionStatus: true,
          subscriptionCurrentPeriodEnd: true,
          trialStartedAt: true,
          trialEndsAt: true,
        },
      },
    },
  });

  if (!pairing || pairing.consumedAt || pairing.expiresAt.getTime() < Date.now()) {
    return { ok: false as const, status: 401, error: "pairing_token_expired" };
  }

  if (!hasPremiumAccess(pairing.userProfile)) {
    return { ok: false as const, status: 402, error: "premium_required" };
  }

  const label = cleanWatchLabel(labelValue || pairing.label);
  const deviceToken = createWatchDeviceToken();
  const now = new Date();

  await prisma.$transaction([
    prisma.watchPairingToken.update({
      where: { id: pairing.id },
      data: { consumedAt: now },
    }),
    prisma.watchDevice.updateMany({
      where: {
        userProfileId: pairing.userProfileId,
        label,
        revokedAt: null,
      },
      data: { revokedAt: now },
    }),
    prisma.watchDevice.create({
      data: {
        userProfileId: pairing.userProfileId,
        label,
        tokenHash: hashWatchDeviceToken(deviceToken),
        lastSeenAt: now,
      },
    }),
  ]);

  return {
    ok: true as const,
    deviceToken,
    label,
    accountPairingId: createAccountPairingId(pairing.userProfile),
  };
}
