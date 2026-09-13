import { Prisma } from "@prisma/client";
import { prisma } from "@/src/lib/prisma";
import { getLastFourCompletedCalendarWeeks } from "./coach/coach-period";

export function decodeHistoryCursor(value: string | null) {
  if (!value) return null;
  if (value.length > 512) throw new Error("invalid_cursor");
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (typeof parsed.id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(parsed.id) ||
        typeof parsed.createdAt !== "string" || !Number.isFinite(Date.parse(parsed.createdAt))) throw new Error();
    return { id: parsed.id as string, createdAt: new Date(parsed.createdAt) };
  } catch { throw new Error("invalid_cursor"); }
}

export async function getWatchHistory(userProfileId: string, cursor: ReturnType<typeof decodeHistoryCursor>, db = prisma) {
  // No set rows or notes leave the database: aggregate only the selected page.
  const rows = await db.$queryRaw<Array<{
    id: string; title: string; createdAt: Date; endedAt: Date | null;
    durationSeconds: number | null; volumeKg: number; sets: number; exercises: number;
  }>>(Prisma.sql`
    WITH page AS (
      SELECT id, title, "createdAt", "endedAt", "durationSeconds"
      FROM "WorkoutSession" WHERE "userProfileId" = ${userProfileId} AND status = 'COMPLETED'
      ${cursor ? Prisma.sql`AND ("createdAt", id) < (${cursor.createdAt}, ${cursor.id})` : Prisma.empty}
      ORDER BY "createdAt" DESC, id DESC LIMIT 11
    )
    SELECT p.*, COUNT(s.id)::int AS sets, COUNT(DISTINCT s."exerciseId")::int AS exercises,
      COALESCE(SUM(GREATEST(0, s."actualReps") * GREATEST(0, s."actualWeightKg")), 0)::float8 AS "volumeKg"
    FROM page p LEFT JOIN "WorkoutSet" s ON s."workoutSessionId" = p.id AND s."isCompleted" = true
    GROUP BY p.id, p.title, p."createdAt", p."endedAt", p."durationSeconds"
    ORDER BY p."createdAt" DESC, p.id DESC
  `);
  const page = rows.slice(0, 10);
  return { history: page.map(row => ({ ...row, volumeKg: Math.round(row.volumeKg) })),
    nextCursor: rows.length > 10 ? Buffer.from(JSON.stringify({ id: page[9].id, createdAt: page[9].createdAt.toISOString() })).toString("base64url") : null };
}

export async function getWatchStatistics(userProfileId: string, now = new Date(), db = prisma) {
  const week = getLastFourCompletedCalendarWeeks(now);
  const previous = getLastFourCompletedCalendarWeeks(new Date(week.end.getTime() - 1));
  const rows = await db.$queryRaw<Array<{ day: string; sessions: number; volumeKg: number }>>(Prisma.sql`
    SELECT to_char(w."endedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Paris', 'YYYY-MM-DD') AS day,
      COUNT(DISTINCT w.id)::int AS sessions,
      COALESCE(SUM(GREATEST(0, s."actualReps") * GREATEST(0, s."actualWeightKg")), 0)::float8 AS "volumeKg"
    FROM "WorkoutSession" w LEFT JOIN "WorkoutSet" s ON s."workoutSessionId" = w.id AND s."isCompleted" = true
    WHERE w."userProfileId" = ${userProfileId} AND w.status = 'COMPLETED'
      AND w."endedAt" >= ${previous.end} AND w."endedAt" < ${week.nextAvailableAt}
    GROUP BY day ORDER BY day
  `);
  const current = rows.filter(row => row.day >= week.key);
  const previousVolume = rows.filter(row => row.day < week.key).reduce((sum, row) => sum + row.volumeKg, 0);
  const volume = current.reduce((sum, row) => sum + row.volumeKg, 0);
  const start = new Date(`${week.key}T12:00:00Z`);
  const days = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(start.getTime() + index * 86_400_000).toISOString().slice(0, 10);
    return { day, sessions: current.find(row => row.day === day)?.sessions ?? 0 };
  });
  return { statistics: { days, timeZone: "Europe/Paris", sessions: current.reduce((sum, row) => sum + row.sessions, 0),
    volumeKg: Math.round(volume), volumeChangePercent: previousVolume > 0 ? Math.round((volume / previousVolume - 1) * 100) : null } };
}
