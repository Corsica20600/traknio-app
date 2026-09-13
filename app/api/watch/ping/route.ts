import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { requireWatchAccess } from "@/src/server/watch-auth";

export async function GET(request: Request) {
  const access = await requireWatchAccess(request);
  if (!access.ok) return access.response;

  const profile = { id: access.userProfileId, email: access.profileEmail ?? null };

  const activeSession = await prisma.workoutSession.findFirst({
    where: {
      userProfileId: profile.id,
      status: "IN_PROGRESS",
    },
    select: {
      id: true,
      title: true,
      status: true,
      startedAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  if (!activeSession) {
    return NextResponse.json(
      {
        ok: false,
        watchReady: false,
        reason: "Aucune séance IN_PROGRESS. Lance une séance depuis l'app téléphone.",
        profileEmail: profile.email,
      },
      { status: 404 },
    );
  }

  return NextResponse.json({
    ok: true,
    watchReady: true,
    reason: "Séance active trouvée.",
    profileEmail: profile.email,
    session: activeSession,
  });
}
