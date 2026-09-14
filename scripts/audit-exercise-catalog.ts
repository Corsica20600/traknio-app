import "dotenv/config";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { PrismaClient, type Exercise } from "@prisma/client";
import { characterLockPrompt, requiredExerciseMedia, requiredMediaChecks, resolveMediaReadiness, TRAKNIO_CHARACTER_LOCK } from "../src/lib/exercise-media-policy";

/**
 * Read-only catalogue audit. It deliberately never calls create/update/delete.
 * It produces the migration baseline and media-generation manifest requested by
 * the catalogue normalisation work; review this output before changing data.
 */
const prisma = new PrismaClient();
const publicRoot = path.resolve("public");
const reportRoot = path.resolve("reports", "exercise-catalog-audit");

type Media = {
  id: string; type: string; format: string; storagePath: string; publicUrl: string;
  url: string | null; mimeType: string | null; width: number | null; height: number | null;
  durationSeconds: number | null; isLoop: boolean; isPrimary: boolean; sortOrder: number;
  sourceName: string | null; sourceUrl: string | null; license: string | null;
};
type Row = Exercise & { media: Media[] };

function key(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/\b(machine|machine\s+exercise|exercise)\b/g, " ")
    .replace(/\b(with|avec|a|au|aux|de|du|des|the)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}
function localFile(url: string) {
  if (!url.startsWith("/")) return null;
  const target = path.resolve(publicRoot, url.slice(1));
  return target.startsWith(publicRoot) ? target : null;
}
function mediaAudit(media: Media) {
  const local = localFile(media.publicUrl);
  return {
    ...media,
    localFile: local ? path.relative(process.cwd(), local).replaceAll("\\", "/") : null,
    localFileExists: local ? existsSync(local) : null,
  };
}
function knownMachine(name: string) {
  return /(leg press|leg extension|leg curl|pec deck|chest press|shoulder press|lat pulldown|pulldown|row|rowing|calf raise|hack squat|smith|reverse hyper|adductor|abductor|dip machine|preacher curl|cable crossover|stairmaster|treadmill|air bike|elliptical|bike|sled)/i.test(name);
}
function needsReferenceReview(row: Row) {
  const source = `${row.name} ${row.slug} ${row.equipment.join(" ")}`;
  return row.equipment.some(e => /machine/i.test(e)) && !knownMachine(source);
}
function semanticWarnings(row: Row) {
  const source = `${row.name} ${row.slug}`.toLowerCase();
  const warnings: string[] = [];
  if (/(air bike|treadmill|stairmaster|elliptical|rowing machine|exercise bike)/.test(source) && row.category !== "CARDIO_MOBILITY") warnings.push("category_semantic_mismatch_cardio");
  if (/(stretch|mobility)/.test(source) && !["STRETCH", "MOBILITY"].includes(row.movementType)) warnings.push("movement_semantic_mismatch_mobility");
  if (row.equipment.some(item => /^(other|unknown|n\/a)$/i.test(item.trim()))) warnings.push("equipment_uncontrolled_value");
  return warnings;
}
function needsReference(row: Row, media: ReturnType<typeof mediaAudit>[]) {
  const hasExistingReference = media.some(item => item.localFileExists || /^https?:\/\//.test(item.publicUrl));
  const genericMachine = row.equipment.some(e => /machine/i.test(e)) && !knownMachine(`${row.name} ${row.slug}`);
  return genericMachine && !hasExistingReference;
}
function watchDisplayName(row: Row) {
  const source = row.nameFr?.trim() || row.name;
  const compact = source.replace(/\bavec\b.*$/i, "").replace(/\bprise\b.*$/i, "").trim();
  return compact.length <= 24 ? compact : compact.slice(0, 23).trimEnd() + "…";
}
function mediaStatus(row: Row, media: ReturnType<typeof mediaAudit>[], kind: "card" | "guide" | "animation") {
  const desiredName = kind === "card" ? "card.webp" : kind === "guide" ? "guide.webp" : "animation.webp";
  const exact = media.some(item => item.publicUrl.endsWith(`/${desiredName}`) && item.localFileExists !== false);
  if (exact) return "ready";
  const usableLegacy = kind === "card"
    ? media.some(item => item.type === "THUMBNAIL" || item.type === "IMAGE")
    : kind === "animation" && media.some(item => item.type === "ANIMATION" && ["WEBP", "GIF", "MP4"].includes(item.format));
  return usableLegacy ? "review" : "missing";
}
function referencePath(media: ReturnType<typeof mediaAudit>[]) {
  const preferred = media.find(item => item.isPrimary && (item.localFileExists || /^https?:\/\//.test(item.publicUrl)))
    ?? media.find(item => item.localFileExists || /^https?:\/\//.test(item.publicUrl));
  return preferred?.publicUrl ?? null;
}
function prompt(row: Row, type: "card" | "guide", referenceMode: "REQUIRED" | "REVIEW" | null) {
  const display = row.nameFr?.trim() || row.name;
  const equipment = row.equipment.join(", ") || "matériel non renseigné";
  const primary = row.primaryMuscles.join(", ") || "non renseignés";
  const secondary = row.secondaryMuscles.join(", ") || "non renseignés";
  const base = [
    `Exercise: ${row.name} (${display}).`,
    `Movement class: ${row.movementType}; category: ${row.category}; equipment recorded: ${equipment}.`,
    `Primary muscles: ${primary}; secondary muscles: ${secondary}.`,
    "Depict only the recorded equipment and a biomechanically plausible start and end position.",
    "Do not add text, labels, logos, invented attachments, plates, handles, or a different machine.",
    referenceMode === "REQUIRED"
      ? "REFERENCE_REQUIRED: machine geometry is ambiguous in the catalogue. Do not generate until a verified reference photo identifies the exact machine."
      : referenceMode === "REVIEW"
        ? "REFERENCE_REVIEW: a legacy source image exists, but confirm that it identifies the exact machine and attachment before generation."
      : "If the supplied reference image conflicts with this metadata, stop and flag the conflict for human review.",
    characterLockPrompt(),
  ];
  if (type === "card") return [
    ...base,
    "Traknio media card: dark anthracite clean background, realistic athlete, equipment fully visible, centered silhouette, no long text, square/vertical-safe composition, WebP target.",
    "Camera: three-quarter side view showing the line of movement and contact points clearly.",
  ].join(" ");
  return [
    ...base,
    "Traknio pedagogical guide: dark anthracite background, subtle green accents, realistic athlete and faithful equipment, two clearly separated positions (start and finish), primary muscles red and secondary muscles blue.",
    "Reserve visual space for short French blocks: Exécution, Conseils, Erreurs fréquentes; do not render their words inside the image until editorial copy is approved.",
    "Camera: three-quarter side view plus sufficient framing for both positions.",
  ].join(" ");
}
function hasText(value: string | null | undefined) { return Boolean(value?.trim()); }

async function main() {
  const rows = await prisma.exercise.findMany({
    include: { media: { orderBy: [{ type: "asc" }, { sortOrder: "asc" }] } },
    orderBy: [{ isActive: "desc" }, { name: "asc" }, { slug: "asc" }],
  }) as Row[];
  const canonicalNameGroups = new Map<string, Row[]>();
  const frenchNameGroups = new Map<string, Row[]>();
  for (const row of rows) {
    // Strict equality: Machine Reverse Flyes and Reverse Flyes must remain
    // separate unless a human validates they are mechanically identical.
    const canonical = row.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const french = key(row.nameFr || row.name);
    canonicalNameGroups.set(canonical, [...(canonicalNameGroups.get(canonical) || []), row]);
    frenchNameGroups.set(french, [...(frenchNameGroups.get(french) || []), row]);
  }
  const exactDuplicates = [...canonicalNameGroups.entries()].filter(([, group]) => group.length > 1)
    .map(([groupKey, group]) => ({ groupKey, matches: group.map(row => ({ id: row.id, slug: row.slug, name: row.name, nameFr: row.nameFr, isActive: row.isActive })) }));
  const frenchCollisions = [...frenchNameGroups.entries()].filter(([, group]) => group.length > 1)
    .map(([groupKey, group]) => ({ groupKey, matches: group.map(row => ({ id: row.id, slug: row.slug, name: row.name, nameFr: row.nameFr, isActive: row.isActive })) }));

  const exercises = rows.map(row => {
    const media = row.media.map(mediaAudit);
    const referenceRequired = needsReference(row, media);
    const referenceReview = needsReferenceReview(row);
    const cardStatus = mediaStatus(row, media, "card");
    const guideStatus = mediaStatus(row, media, "guide");
    const animationStatus = mediaStatus(row, media, "animation");
    const translationProblems = [
      !hasText(row.nameFr) ? "nameFr_missing" : null,
      !hasText(row.instructionsFr) ? "instructionsFr_missing" : null,
      row.primaryMusclesFr.length === 0 ? "primaryMusclesFr_missing" : null,
      row.equipmentFr.length === 0 ? "equipmentFr_missing" : null,
      row.commonMistakesFr.length === 0 ? "commonMistakesFr_missing" : null,
    ].filter(Boolean);
    const classificationProblems = [
      row.primaryMuscles.length === 0 ? "primaryMuscles_missing" : null,
      row.secondaryMuscles.some(m => row.primaryMuscles.includes(m)) ? "primary_secondary_overlap" : null,
      row.equipment.length === 0 ? "equipment_missing" : null,
      row.shortTechnicalCues.length === 0 ? "tips_missing" : null,
      row.detailedInstructions.trim().length === 0 ? "instructions_missing" : null,
      row.commonMistakes.length === 0 ? "commonMistakes_missing" : null,
      ...semanticWarnings(row),
    ].filter(Boolean);
    return {
      id: row.id, slug: row.slug, canonicalName: row.name, displayNameFr: row.nameFr,
      watchDisplayName: watchDisplayName(row), category: row.category, primaryMuscles: row.primaryMuscles,
      primaryMusclesFr: row.primaryMusclesFr, secondaryMuscles: row.secondaryMuscles,
      equipment: row.equipment, equipmentFr: row.equipmentFr, movementPattern: row.movementType,
      exerciseType: row.isCompound ? "COMPOUND" : row.movementType, difficulty: row.difficulty,
      objectives: row.objectives, instructions: row.detailedInstructions, instructionsFr: row.instructionsFr,
      tips: row.shortTechnicalCues, commonMistakes: row.commonMistakes, commonMistakesFr: row.commonMistakesFr,
      contraindications: row.contraindications, variants: row.variants, alternatives: row.alternatives,
      fallback: { image: row.fallbackImagePath, thumbnail: row.fallbackThumbnailPath, animation: row.fallbackAnimationPath, primaryAnimation: row.primaryAnimationPath },
      media, cardStatus, guideStatus, animationStatus, referenceImage: referencePath(media),
      referenceRequired, referenceReview, translationProblems, classificationProblems,
    };
  });

  const manifest = exercises.map(item => {
    const referenceStatus = item.referenceRequired ? "REFERENCE_REQUIRED" as const : item.referenceReview ? "REFERENCE_REVIEW" as const : "NONE" as const;
    const validation = Object.fromEntries(requiredMediaChecks.map(check => [check, false]));
    return {
      slug: item.slug, canonicalName: item.canonicalName, displayNameFr: item.displayNameFr || item.canonicalName,
      characterLock: TRAKNIO_CHARACTER_LOCK,
      requiredMedia: requiredExerciseMedia,
      cardPrompt: prompt(rows.find(row => row.id === item.id)!, "card", item.referenceRequired ? "REQUIRED" : item.referenceReview ? "REVIEW" : null),
      guidePrompt: prompt(rows.find(row => row.id === item.id)!, "guide", item.referenceRequired ? "REQUIRED" : item.referenceReview ? "REVIEW" : null),
      referenceImage: item.referenceImage, referenceStatus,
      cardStatus: item.cardStatus, guideStatus: item.guideStatus, animationStatus: item.animationStatus,
      validation, mediaReadiness: resolveMediaReadiness(referenceStatus, validation),
      ...(item.referenceRequired ? { reviewFlag: "REFERENCE_REQUIRED" } : item.referenceReview ? { reviewFlag: "REFERENCE_REVIEW" } : {}),
    };
  });
  const active = exercises.filter(item => rows.find(row => row.id === item.id)!.isActive);
  const totals = {
    totalExercises: exercises.length, activeExercises: active.length, inactiveExercises: exercises.length - active.length,
    exactCanonicalNameDuplicateGroups: exactDuplicates.length, frenchDisplayNameCollisionGroups: frenchCollisions.length,
    card: Object.fromEntries(["ready", "review", "missing"].map(status => [status, exercises.filter(item => item.cardStatus === status).length])),
    guide: Object.fromEntries(["ready", "review", "missing"].map(status => [status, exercises.filter(item => item.guideStatus === status).length])),
    animation: Object.fromEntries(["ready", "review", "missing"].map(status => [status, exercises.filter(item => item.animationStatus === status).length])),
    referenceRequired: exercises.filter(item => item.referenceRequired).length,
    referenceReview: exercises.filter(item => item.referenceReview).length,
    missingFrenchName: exercises.filter(item => item.translationProblems.includes("nameFr_missing")).length,
    missingFrenchInstructions: exercises.filter(item => item.translationProblems.includes("instructionsFr_missing")).length,
    missingTips: exercises.filter(item => item.classificationProblems.includes("tips_missing")).length,
    brokenLocalMedia: exercises.flatMap(item => item.media).filter(item => item.localFileExists === false).length,
  };
  const audit = {
    generatedAt: new Date().toISOString(), mode: "READ_ONLY", totals,
    schemaMapping: {
      canonicalName: "Exercise.name", displayNameFr: "Exercise.nameFr", slug: "Exercise.slug", category: "Exercise.category",
      primaryMuscles: "Exercise.primaryMuscles", secondaryMuscles: "Exercise.secondaryMuscles", equipment: "Exercise.equipment",
      movementPattern: "Exercise.movementType", exerciseType: "Exercise.isCompound + Exercise.movementType",
      instructions: "Exercise.detailedInstructions / Exercise.instructionsFr", tips: "Exercise.shortTechnicalCues",
      commonMistakes: "Exercise.commonMistakes / Exercise.commonMistakesFr", mediaCard: "ExerciseMedia(THUMBNAIL or IMAGE)",
      mediaGuide: "not modelled", mediaAnimation: "ExerciseMedia(ANIMATION)", watchDisplayName: "not modelled",
    },
    exactDuplicates, frenchCollisions, exercises,
  };
  await fs.mkdir(reportRoot, { recursive: true });
  await fs.writeFile(path.join(reportRoot, "exercise-catalog-audit.json"), JSON.stringify(audit, null, 2) + "\n", "utf8");
  await fs.writeFile(path.resolve("exercise-media-manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");
  const lines = [
    "# Audit du catalogue d’exercices", "", `Généré le ${audit.generatedAt}. **Lecture seule : aucune donnée Prisma ni média n’a été modifié.**`, "",
    "## Totaux", "", `- Exercices : ${totals.totalExercises} (${totals.activeExercises} actifs, ${totals.inactiveExercises} inactifs)`,
    `- Groupes de doublons canoniques exacts : ${totals.exactCanonicalNameDuplicateGroups}`, `- Collisions de nom d’affichage français : ${totals.frenchDisplayNameCollisionGroups}`,
    `- Cartes : ${totals.card.ready} prêtes selon la convention, ${totals.card.review} médias historiques à revoir, ${totals.card.missing} manquantes`,
    `- Guides : ${totals.guide.ready} prêts, ${totals.guide.missing} manquants`, `- Animations : ${totals.animation.ready} prêtes, ${totals.animation.review} à revoir, ${totals.animation.missing} manquantes`,
    `- Références humaines requises : ${totals.referenceRequired}; références machine à contrôler : ${totals.referenceReview}`, `- Nom FR absent : ${totals.missingFrenchName}; instructions FR absentes : ${totals.missingFrenchInstructions}; conseils absents : ${totals.missingTips}`,
    `- Fichiers médias locaux référencés mais absents : ${totals.brokenLocalMedia}`, "",
    "## Structure existante", "", "Les champs demandés correspondent majoritairement au modèle `Exercise` actuel. `watchDisplayName`, `mediaGuide` et un champ distinct `exerciseType` ne sont pas encore stockés. Le rapport JSON contient le détail complet par exercice et le manifeste est généré sans réécrire le catalogue.", "",
    "## Doublons et validation humaine", "", "Les groupes listés dans `exercise-catalog-audit.json` sont des **candidats** : aucun n’est fusionné automatiquement. Les exercices marqués `REFERENCE_REQUIRED` ne doivent pas recevoir d’image générée avant l’ajout d’une photo machine vérifiée. `REFERENCE_REVIEW` signifie qu’une image source existe mais que la machine générique doit être validée avant toute régénération.", "",
    "## Fichiers", "", "- `reports/exercise-catalog-audit/exercise-catalog-audit.json` : inventaire complet et anomalies par exercice.", "- `exercise-media-manifest.json` : suivi des prompts et statuts média.",
  ];
  await fs.writeFile(path.join(reportRoot, "README.md"), lines.join("\n") + "\n", "utf8");
  console.log(JSON.stringify(totals, null, 2));
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => prisma.$disconnect());
