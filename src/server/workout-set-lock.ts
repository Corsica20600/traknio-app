import type { Prisma } from "@prisma/client";

/** Called inside the existing transaction, before reading or saving a series. */
export async function lockWorkoutForSet(tx: Prisma.TransactionClient, sessionId: string, userProfileId: string) {
  const sessions = await tx.$queryRaw<Array<{ id: string; programId: string | null; status: string }>>`
    SELECT "id", "programId", "status" FROM "WorkoutSession"
    WHERE "id" = ${sessionId} AND "userProfileId" = ${userProfileId}
    FOR UPDATE
  `;
  return sessions[0] ?? null;
}
