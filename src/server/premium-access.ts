import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { hasFullAccess } from "@/src/lib/premium-access-rules";
import { getAuthenticatedUserProfile } from "@/src/server/fitness-queries";

type PremiumProfile = Awaited<ReturnType<typeof getAuthenticatedUserProfile>>;

export async function requirePremiumAccess(): Promise<PremiumProfile> {
  const profile = await getAuthenticatedUserProfile();

  if (!hasFullAccess(profile)) {
    redirect("/settings?access=premium");
  }

  return profile;
}

export async function requirePremiumApiAccess() {
  const profile = await getAuthenticatedUserProfile();

  if (!hasFullAccess(profile)) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "premium_required" }, { status: 402 }),
    };
  }

  return { ok: true as const, profile };
}
