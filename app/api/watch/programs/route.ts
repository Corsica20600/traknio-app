import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { requireWatchAccess } from "@/src/server/watch-auth";

export async function GET(request: Request) {
  const access = await requireWatchAccess(request);
  if (!access.ok) return access.response;
  if (!access.userProfileId) return NextResponse.json({ error: "watch_profile_required" }, { status: 401 });
  const cursor = new URL(request.url).searchParams.get("cursor")?.trim();
  const programs = await prisma.program.findMany({
    where: { userProfileId: access.userProfileId, status: { not: "ARCHIVED" }, id: { ...(cursor ? { gt: cursor } : {}), ...(access.allowedProgramId !== undefined ? { in: access.allowedProgramId ? [access.allowedProgramId] : [] } : {}) } },
    orderBy: { id: "asc" }, take: 21,
    select: { id: true, name: true, days: { orderBy: { dayIndex: "asc" },
      select: { id: true, title: true, focus: true, _count: { select: { exercises: true } } } } },
  });
  return NextResponse.json({ payload: {
    programs: programs.slice(0, 20).map(program => ({ id: program.id, name: program.name,
      days: program.days.map(day => ({ id: day.id, title: day.title, focus: day.focus, exerciseCount: day._count.exercises })) })),
    nextCursor: programs.length > 20 ? programs[19].id : null,
  } }, { headers: { "Cache-Control": "no-store" } });
}
