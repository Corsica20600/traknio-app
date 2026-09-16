import { NextResponse } from "next/server";
import { saveGeneratedProgram, type ValidGeneratedProgram } from "@/src/server/ai-program-generator";
import { getAuthenticatedUserProfile } from "@/src/server/fitness-queries";
import { hasFullAccess, hasPremiumAccess } from "@/src/lib/premium-access-rules";
import { assertProgramAccess, TrialProgramAccessError } from "@/src/server/trial-program-access";
import { prisma } from "@/src/lib/prisma";

export async function POST(request: Request) {
  const body = await request.json();
  const profile = await getAuthenticatedUserProfile();
  if (!hasPremiumAccess(profile)) return NextResponse.json({ ok: false, error: "premium_required" }, { status: 402 });
  const generationId = typeof body.generationId === "string" ? body.generationId : null;
  if (generationId) {
    const result = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "UserProfile" WHERE id = ${profile.id} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM "AiProgramGeneration" WHERE id = ${generationId} AND "userProfileId" = ${profile.id} FOR UPDATE`;
      const generation = await tx.aiProgramGeneration.findFirst({ where: { id: generationId, userProfileId: profile.id, status: "SUCCESS" } });
      if (!generation?.generatedProgram) return { ok: false as const, error: "generation_not_found" };
      try { await assertProgramAccess(tx, profile, generation.savedProgramId ?? undefined, !generation.savedProgramId); }
      catch (error) { if (error instanceof TrialProgramAccessError) return { ok: false as const, error: error.message }; throw error; }
      if (generation.savedProgramId) return { ok: true as const, programId: generation.savedProgramId, programName: "déjà enregistré" };
      // Use the server's successful generation, never a client-supplied replacement.
      const level = generation.level === "BEGINNER" || generation.level === "ADVANCED" ? generation.level : "INTERMEDIATE";
      const saved = await saveGeneratedProgram(generation.generatedProgram as unknown as ValidGeneratedProgram, { userProfileId: profile.id, db: tx, level });
      if (saved.ok) await tx.aiProgramGeneration.update({ where: { id: generation.id }, data: { savedProgramId: saved.programId } });
      return saved;
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 422 });
  }
  // Older subscribed clients remain supported; trial clients must reference their generation.
  if (!hasFullAccess(profile)) return NextResponse.json({ ok: false, error: "generation_id_required" }, { status: 403 });
  const program = body?.program;

  if (!program || typeof program !== "object") {
    return NextResponse.json({ ok: false, error: "invalid_program_payload" }, { status: 400 });
  }

  const result = await saveGeneratedProgram(program);
  if (!result.ok) return NextResponse.json(result, { status: 422 });
  return NextResponse.json(result);
}
