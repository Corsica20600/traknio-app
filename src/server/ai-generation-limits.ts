import { prisma } from "@/src/lib/prisma";
import { getOrCreateDemoProfile } from "@/src/server/fitness-queries";
import { hasFullAccess } from "@/src/lib/premium-access-rules";
import { getTrialProgramId } from "./trial-program-access";
import type { Prisma } from "@prisma/client";

export const AI_PROGRAM_GENERATION_MONTHLY_LIMIT = 4;

function getCurrentPeriodKey(now = new Date()) {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export type AiGenerationLimitResult =
  | {
      ok: true;
      usageId: string;
      limit: number;
      used: number;
      remaining: number;
      periodKey: string;
    }
  | {
      ok: false;
      error: "ai_generation_limit_reached";
      limit: number;
      used: number;
      remaining: number;
      periodKey: string;
    };

export async function reserveAiProgramGeneration(input: {
  goal: string;
  level: string;
}): Promise<AiGenerationLimitResult> {
  const profile = await getOrCreateDemoProfile();
  const trial = !hasFullAccess(profile);
  const periodKey = trial ? "ACCOUNT_TRIAL" : getCurrentPeriodKey();
  const limit = trial ? 1 : AI_PROGRAM_GENERATION_MONTHLY_LIMIT;

  return prisma.$transaction(async (tx) => {
    // Serialize quota reservations across processes, not just browser tabs.
    await tx.$queryRaw`SELECT id FROM "UserProfile" WHERE id = ${profile.id} FOR UPDATE`;
    await tx.aiProgramGeneration.updateMany({
      where: { userProfileId: profile.id, status: "RESERVED", createdAt: { lt: new Date(Date.now() - 15 * 60_000) } },
      data: { status: "FAILED" },
    });
    const used = await tx.aiProgramGeneration.count({
      where: {
        userProfileId: profile.id,
        // Include older Google Play trial generations, previously stored monthly.
        ...(trial ? {} : { periodKey }),
        status: { in: ["RESERVED", "SUCCESS"] },
      },
    });

    if (used >= limit || (trial && await getTrialProgramId(tx, profile.id))) {
      return {
        ok: false as const,
        error: "ai_generation_limit_reached" as const,
        limit,
        used,
        remaining: 0,
        periodKey,
      };
    }

    const usage = await tx.aiProgramGeneration.create({
      data: {
        userProfileId: profile.id,
        periodKey,
        goal: input.goal,
        level: input.level,
        status: "RESERVED",
      },
      select: { id: true },
    });

    return {
      ok: true as const,
      usageId: usage.id,
      limit,
      used: used + 1,
      remaining: Math.max(0, limit - used - 1),
      periodKey,
    };
  });
}

export async function completeAiProgramGeneration(usageId: string, ok: boolean, program?: Prisma.InputJsonValue) {
  const result = await prisma.aiProgramGeneration.updateMany({
    where: { id: usageId, status: "RESERVED" },
    data: { status: ok ? "SUCCESS" : "FAILED", ...(ok && program ? { generatedProgram: program } : {}) },
  });
  if (ok && result.count !== 1) throw new Error("generation_reservation_expired");
}
