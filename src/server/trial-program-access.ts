import type { Prisma } from "@prisma/client";
import { hasFullAccess, hasPremiumAccess, type AccessProfile } from "../lib/premium-access-rules";

type ProgramDb = Pick<Prisma.TransactionClient, "program">;
type Profile = AccessProfile & { id: string };

export class TrialProgramAccessError extends Error {}

/** Stable selection, including archived programs. Trial deletion is forbidden. */
export async function getTrialProgramId(db: ProgramDb, userProfileId: string) {
  return (await db.program.findFirst({
    where: { userProfileId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true },
  }))?.id ?? null;
}

export async function accessibleProgramWhere(db: ProgramDb, profile: Profile): Promise<Prisma.ProgramWhereInput> {
  if (hasFullAccess(profile)) return { userProfileId: profile.id };
  const id = await getTrialProgramId(db, profile.id);
  return { userProfileId: profile.id, id: { in: id ? [id] : [] } };
}

/** Call under the UserProfile row lock when creating or saving a program. */
export async function assertProgramAccess(db: ProgramDb, profile: Profile, programId?: string, creating = false) {
  if (!hasPremiumAccess(profile)) throw new TrialProgramAccessError("Ton accès a expiré. Retrouve ton abonnement dans les paramètres.");
  if (hasFullAccess(profile)) return;
  const selected = await getTrialProgramId(db, profile.id);
  if ((!selected && creating) || (selected && selected === programId)) return;
  throw new TrialProgramAccessError("L’essai comprend un seul programme. Tu peux modifier ton programme existant ; abonne-toi pour en ajouter d’autres.");
}
