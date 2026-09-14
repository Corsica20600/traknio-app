import { prisma } from "@/src/lib/prisma";
import { getAuthenticatedUserProfile } from "@/src/server/fitness-queries";
import { hasPremiumAccess } from "@/src/lib/premium-access-rules";

export async function GET(request: Request) {
  const profile = await getAuthenticatedUserProfile().catch(() => null);
  if (!profile) return Response.json({ error: "Connexion requise." }, { status: 401 });
  if (!hasPremiumAccess(profile)) return Response.json({ error: "Accès expiré." }, { status: 403 });
  const params = new URL(request.url).searchParams;
  const query = (params.get("q") ?? "").trim().slice(0, 100);
  const page = Math.max(0, Math.min(1000, Number(params.get("page")) || 0));
  const rows = await prisma.exercise.findMany({
    where: { isActive: true, ...(query ? { OR: [{ name: { contains: query, mode: "insensitive" as const } }, { nameFr: { contains: query, mode: "insensitive" as const } }, { slug: { contains: query.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "-"), mode: "insensitive" as const } }, { primaryMusclesFr: { has: query } }] } : {}) },
    select: { id: true, name: true, nameFr: true, fallbackThumbnailPath: true, primaryMusclesFr: true },
    orderBy: [{ nameFr: "asc" }, { id: "asc" }], skip: Math.floor(page) * 24, take: 25,
  });
  return Response.json({ exercises: rows.slice(0, 24).map(ex => ({ id: ex.id, name: ex.nameFr || ex.name, image: ex.fallbackThumbnailPath, muscle: ex.primaryMusclesFr[0] ?? "" })), hasMore: rows.length > 24 }, { headers: { "Cache-Control": "private, max-age=120" } });
}
