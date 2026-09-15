import { MediaFormat } from "@prisma/client";
import { prisma } from "@/src/lib/prisma";
import type { ExerciseGuidePilot } from "@/src/lib/exercise-pilots";

type TechnicalTempo = { value: string; detail: string[] };
const categoryLabel: Record<string, string> = { CHEST: "Pectoraux", BACK: "Dos", SHOULDERS: "Épaules", BICEPS: "Biceps", TRICEPS: "Triceps", LEGS: "Jambes", ABS: "Abdominaux", CARDIO_MOBILITY: "Cardio & mobilité" };

function mediaUrl(items: Array<{ role: string | null; format: MediaFormat; publicUrl: string }>, role: string, format?: MediaFormat) {
  return items.find((item) => item.role === role && (!format || item.format === format))?.publicUrl;
}

function tempo(value: unknown): TechnicalTempo | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as { value?: unknown; detail?: unknown };
  return typeof candidate.value === "string" && Array.isArray(candidate.detail) && candidate.detail.every((item) => typeof item === "string")
    ? { value: candidate.value, detail: candidate.detail }
    : null;
}

/**
 * Reads the additive Neon representation. A schema-migration error is allowed
 * to fall through to the legacy pilot during the rollout, preserving the exact
 * current visual output until production has received the migration.
 */
export async function getTechnicalSheetFromDatabase(slug: string): Promise<ExerciseGuidePilot | null> {
  try {
    const exercise = await prisma.exercise.findUnique({
      where: { slug },
      include: { media: { orderBy: { sortOrder: "asc" } } },
    });
    if (!exercise || exercise.technicalSheetStatus === "MISSING") return null;

    const parsedTempo = tempo(exercise.technicalTempo);
    const start = mediaUrl(exercise.media, "START");
    const end = mediaUrl(exercise.media, "CONTRACTION");
    const animationWebm = mediaUrl(exercise.media, "ANIMATION", "OTHER");
    const animationWebp = mediaUrl(exercise.media, "ANIMATION", "WEBP");
    if (!exercise.nameFr || !exercise.whyFr || !exercise.executionStepsFr.length || !exercise.breathingFr || !parsedTempo || !start || !end || !animationWebm || !animationWebp) return null;

    return {
      slug: exercise.slug,
      canonicalName: exercise.name,
      displayNameFr: exercise.nameFr,
      watchDisplayName: exercise.watchDisplayName || exercise.nameFr || exercise.name,
      category: categoryLabel[exercise.category] ?? exercise.category,
      equipment: exercise.equipmentFr.join(" · ") || exercise.equipment.join(" · ") || "Poids du corps",
      movementPattern: exercise.movementPatternFr || exercise.movementType,
      exerciseType: exercise.exerciseTypeFr || (exercise.isCompound ? "Polyarticulaire" : "Isolation"),
      why: exercise.whyFr,
      mediaStart: { src: start, alt: `${exercise.nameFr} : position de départ.` },
      mediaEnd: { src: end, alt: `${exercise.nameFr} : position finale contrôlée.` },
      mediaAnimation: { webm: animationWebm, webp: animationWebp, alt: `Animation de ${exercise.nameFr}.` },
      anatomyPrimaryMedia: mediaUrl(exercise.media, "ANATOMY_PRIMARY"),
      anatomySecondaryMedia: mediaUrl(exercise.media, "ANATOMY_SECONDARY"),
      anatomyStatus: exercise.media.some((item) => item.role === "ANATOMY_PRIMARY" || item.role === "ANATOMY_SECONDARY") ? "REVIEW_REQUIRED" : "READY",
      primaryMuscles: exercise.primaryMusclesFr.length ? exercise.primaryMusclesFr : exercise.primaryMuscles,
      secondaryMuscles: exercise.secondaryMuscles,
      steps: exercise.executionStepsFr,
      breathing: exercise.breathingFr,
      tempo: parsedTempo,
      tips: exercise.tipsFr,
      mistakes: exercise.commonMistakesFr.length ? exercise.commonMistakesFr : exercise.commonMistakes,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("does not exist") || message.includes("P2022")) return null;
    throw error;
  }
}
