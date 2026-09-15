import { MediaFormat, Prisma } from "@prisma/client";
import { prisma } from "@/src/lib/prisma";
import {
  AB_ROLLER_PILOT, ALTERNATE_HAMMER_CURL_PILOT, BARBELL_BENCH_PRESS_PILOT,
  BARBELL_SQUAT_PILOT, LAT_PULLDOWN_MACHINE_PILOT, ONE_ARM_DUMBBELL_ROW_PILOT,
  type ExerciseGuidePilot,
} from "@/src/lib/exercise-pilots";
import { getExerciseOverride } from "@/src/lib/exercise-overrides";

const apply = process.argv.includes("--apply");
const guides = [LAT_PULLDOWN_MACHINE_PILOT, ALTERNATE_HAMMER_CURL_PILOT, BARBELL_BENCH_PRESS_PILOT, ONE_ARM_DUMBBELL_ROW_PILOT, BARBELL_SQUAT_PILOT, AB_ROLLER_PILOT] as const;

function format(url: string): MediaFormat { return url.endsWith(".webp") ? "WEBP" : "OTHER"; }
function media(guide: ExerciseGuidePilot) {
  const thumbnail = getExerciseOverride(guide.slug)?.cardImage ?? guide.mediaStart.src;
  return [
    ["THUMBNAIL", thumbnail], ["START", guide.mediaStart.src], ["CONTRACTION", guide.mediaEnd.src],
    ["ANIMATION", guide.mediaAnimation?.webm], ["ANIMATION", guide.mediaAnimation?.webp],
    ["ANATOMY_PRIMARY", guide.anatomyPrimaryMedia], ["ANATOMY_SECONDARY", guide.anatomySecondaryMedia],
  ].filter((item): item is [string, string] => Boolean(item[1]));
}

async function main() {
  const report: Array<{ slug: string; action: string; media: number }> = [];
  for (const guide of guides) {
    const exercise = await prisma.exercise.findUnique({ where: { slug: guide.slug }, select: { id: true } });
    if (!exercise) { report.push({ slug: guide.slug, action: "missing-exercise", media: 0 }); continue; }
    const entries = media(guide);
    if (apply) await prisma.$transaction(async (tx) => {
      await tx.exercise.update({ where: { id: exercise.id }, data: {
        nameFr: guide.displayNameFr, watchDisplayName: guide.watchDisplayName,
        equipmentFr: guide.equipment.split(" · "),
        movementPatternFr: guide.movementPattern, exerciseTypeFr: guide.exerciseType,
        primaryMusclesFr: [...guide.primaryMuscles], secondaryMuscles: [...guide.secondaryMuscles],
        whyFr: guide.why, executionStepsFr: [...guide.steps], breathingFr: guide.breathing,
        technicalTempo: guide.tempo as Prisma.InputJsonValue, tipsFr: [...guide.tips],
        commonMistakesFr: [...guide.mistakes], technicalSheetStatus: "REVIEW_REQUIRED",
      } });
      for (const [role, publicUrl] of entries) {
        const existing = await tx.exerciseMedia.findFirst({ where: { exerciseId: exercise.id, role: role as never, format: format(publicUrl) } });
        const data = { type: role === "THUMBNAIL" ? "THUMBNAIL" as const : role === "ANIMATION" ? "ANIMATION" as const : "IMAGE" as const, role: role as never, format: format(publicUrl), publicUrl, storagePath: publicUrl.replace(/^\//, ""), mediaStatus: "REVIEW_REQUIRED" as const, humanReviewStatus: "PENDING" as const, characterProfile: "TRAKNIO_MALE_V1", brandingRequired: role !== "ANATOMY_PRIMARY" && role !== "ANATOMY_SECONDARY", isPrimary: role === "THUMBNAIL", sortOrder: entries.findIndex((item) => item[0] === role && item[1] === publicUrl) };
        if (existing) await tx.exerciseMedia.update({ where: { id: existing.id }, data }); else await tx.exerciseMedia.create({ data: { exerciseId: exercise.id, ...data } });
      }
    });
    report.push({ slug: guide.slug, action: apply ? "upserted" : "would-upsert", media: entries.length });
  }
  console.table(report);
  console.log(JSON.stringify({ apply, total: report.length, migrated: report.filter((item) => item.action !== "missing-exercise").length }, null, 2));
}
main().finally(() => prisma.$disconnect());
