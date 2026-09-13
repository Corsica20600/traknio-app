import { NextResponse } from "next/server";
import { generateAiProgram } from "@/src/server/ai-program-generator";
import { completeAiProgramGeneration, reserveAiProgramGeneration } from "@/src/server/ai-generation-limits";
import { getAuthenticatedUserProfile } from "@/src/server/fitness-queries";
import { prisma } from "@/src/lib/prisma";

export async function GET() {
  const profile = await getAuthenticatedUserProfile().catch(() => null);
  if (!profile) return NextResponse.json({ error: "auth_required" }, { status: 401 });
  const generation = await prisma.aiProgramGeneration.findFirst({
    where: { userProfileId: profile.id, status: "SUCCESS", savedProgramId: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, generatedProgram: true },
  });
  return NextResponse.json({ generation }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const body = await request.json();

  const goal = String(body.goal ?? "").trim();
  const level = String(body.level ?? "").trim();
  const sessionDurationMin = Number(body.sessionDurationMin ?? 60);
  const availableEquipment = Array.isArray(body.availableEquipment) ? body.availableEquipment.map(String) : [];
  const priorityMuscles = Array.isArray(body.priorityMuscles) ? body.priorityMuscles.map(String) : [];
  const restrictions = String(body.restrictions ?? "").trim();

  if (!["MUSCLE_GAIN", "FAT_LOSS", "STRENGTH", "RECOMPOSITION"].includes(goal)) {
    return NextResponse.json({ ok: false, error: "invalid_goal" }, { status: 400 });
  }
  if (!["BEGINNER", "INTERMEDIATE", "ADVANCED"].includes(level)) {
    return NextResponse.json({ ok: false, error: "invalid_level" }, { status: 400 });
  }

  const reservation = await reserveAiProgramGeneration({ goal, level });
  if (!reservation.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: reservation.error,
        limit: reservation.limit,
        used: reservation.used,
        remaining: reservation.remaining,
        periodKey: reservation.periodKey,
      },
      { status: 429 },
    );
  }

  try {
    const result = await generateAiProgram({
      goal: goal as "MUSCLE_GAIN" | "FAT_LOSS" | "STRENGTH" | "RECOMPOSITION",
      level: level as "BEGINNER" | "INTERMEDIATE" | "ADVANCED",
      daysPerWeek: 1,
      sessionDurationMin: Number.isFinite(sessionDurationMin) ? Math.max(25, Math.min(120, Math.floor(sessionDurationMin))) : 60,
      availableEquipment,
      priorityMuscles,
      restrictions,
    });

    await completeAiProgramGeneration(reservation.usageId, result.ok, result.ok ? result.program : undefined);

    if (!result.ok) {
      return NextResponse.json({ ...result, usage: reservation }, { status: 422 });
    }

    return NextResponse.json({ ...result, usage: reservation });
  } catch {
    await completeAiProgramGeneration(reservation.usageId, false);
    return NextResponse.json({ ok: false, error: "generation_failed", message: "La génération n’a pas pu être confirmée. Recharge la page pour retrouver un éventuel aperçu enregistré." }, { status: 503 });
  }
}
