import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { getOrCreateDemoProfile } from "@/src/server/fitness-queries";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const sessionId = String(body.sessionId ?? "").trim();
    const exerciseId = String(body.exerciseId ?? "").trim();
    const programExerciseId = String(body.programExerciseId ?? "").trim();
    const nextSetsRaw = Number(body.nextSets ?? 0);

    if (!sessionId || !exerciseId || !Number.isFinite(nextSetsRaw)) {
      return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
    }

    const nextSets = Math.max(1, Math.min(12, Math.floor(nextSetsRaw)));
    const profile = await getOrCreateDemoProfile({ sessionId });

    const session = await prisma.workoutSession.findFirst({
      where: { id: sessionId, userProfileId: profile.id },
      select: { id: true, programId: true },
    });
    if (!session) {
      return NextResponse.json({ error: "session_not_found" }, { status: 404 });
    }

    const completedCount = await prisma.workoutSet.count({
      where: { workoutSessionId: sessionId, exerciseId, isCompleted: true },
    });
    const finalSets = Math.max(nextSets, completedCount, 1);

    if (programExerciseId && session.programId) {
      await prisma.programExercise.updateMany({
        where: {
          id: programExerciseId,
          exerciseId,
          programDay: { programId: session.programId },
        },
        data: { sets: finalSets },
      });
    }

    const watchSession = await prisma.watchSession.findUnique({
      where: { workoutSessionId: sessionId },
      select: { currentSetIndex: true },
    });
    if (watchSession) {
      await prisma.watchSession.update({
        where: { workoutSessionId: sessionId },
        data: { currentSetIndex: Math.max(1, Math.min(finalSets, watchSession.currentSetIndex)) },
      });
    }

    return NextResponse.json({ sets: finalSets });
  } catch {
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
