"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/src/lib/prisma";
import { hasFullAccess, hasPremiumAccess } from "@/src/lib/premium-access-rules";
import { assertProgramAccess, TrialProgramAccessError } from "./trial-program-access";
import { validateProgramDraft } from "@/src/lib/program-draft";
import { getAuthenticatedUserProfile } from "@/src/server/fitness-queries";
import { editorInclude, persistProgramDraft, toProgramDraft, ProgramEditorError } from "@/src/server/program-editor";

export async function loadProgramEditor(id: string) {
  const profile = await getAuthenticatedUserProfile();
  if (!hasPremiumAccess(profile)) return { error: "Ton accès a expiré. Retrouve ton abonnement dans les paramètres." };
  try { await assertProgramAccess(prisma, profile, id); }
  catch (error) { if (error instanceof TrialProgramAccessError) return { error: error.message }; throw error; }
  const program = await prisma.program.findFirst({ where: { id, userProfileId: profile.id }, include: editorInclude });
  return program ? { draft: toProgramDraft(program) } : { error: "Programme introuvable." };
}

export async function saveProgramEditor(input: unknown, activate: boolean) {
  const profile = await getAuthenticatedUserProfile();
  if (!hasPremiumAccess(profile)) return { error: "Ton accès a expiré. Ton brouillon reste sur cet appareil." };
  if (!validateProgramDraft(input) || typeof activate !== "boolean") return { error: "Vérifie les noms, les séries, les répétitions et les temps de repos." };
  try {
    const draft = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "UserProfile" WHERE id = ${profile.id} FOR UPDATE`;
      await assertProgramAccess(tx, profile, input.id, input.revision === null);
      return persistProgramDraft(tx, profile.id, input, activate);
    }, { timeout: 30000 });
    revalidatePath("/programs");
    revalidatePath("/dashboard");
    return { draft };
  } catch (error) {
    return { error: error instanceof ProgramEditorError || error instanceof TrialProgramAccessError ? error.message : "Enregistrement impossible. Ton brouillon est conservé ; réessaie." };
  }
}

export async function deleteProgramEditor(id: string) {
  const profile = await getAuthenticatedUserProfile();
  if (!hasFullAccess(profile)) return { error: "Pendant l’essai, modifie ton programme existant. La suppression et la création d’autres programmes sont réservées aux abonnés." };
  try {
    await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "UserProfile" WHERE id = ${profile.id} FOR UPDATE`;
      if (await tx.workoutSession.findFirst({ where: { userProfileId: profile.id, programId: id, status: "IN_PROGRESS" }, select: { id: true } })) throw new ProgramEditorError("Termine la séance en cours avant de supprimer ce programme.");
      // Cascades remove the template only. WorkoutSession/WorkoutSet links use SetNull.
      await tx.program.deleteMany({ where: { id, userProfileId: profile.id } });
    });
    revalidatePath("/programs");
    revalidatePath("/dashboard");
    return { ok: true as const };
  } catch (error) {
    return { error: error instanceof ProgramEditorError ? error.message : "Suppression impossible. Réessaie." };
  }
}
