import "dotenv/config";
import { PrismaClient } from "@prisma/client";

/**
 * Explicitly creates or updates the single approved UI pilot. This is never
 * called by the normal catalog seed: an operator must opt in with
 * TRAKNIO_ALLOW_PILOT_CATALOG_WRITE=true on a non-production database.
 */
const prisma = new PrismaClient();

const slug = "lat-pulldown-machine";
const mediaBase = `/media/exercises/${slug}`;

async function main() {
  if (process.env.TRAKNIO_ALLOW_PILOT_CATALOG_WRITE !== "true") {
    throw new Error("Refusing catalog write. Set TRAKNIO_ALLOW_PILOT_CATALOG_WRITE=true to seed this single pilot.");
  }

  const exercise = await prisma.exercise.upsert({
    where: { slug },
    update: {
      name: "Lat Pulldown Machine",
      nameFr: "Tirage vertical à la machine",
      category: "BACK",
      movementType: "COMPOUND",
      primaryMuscles: ["Latissimus dorsi"],
      primaryMusclesFr: ["Grand dorsal"],
      secondaryMuscles: ["Teres major", "Middle trapezius", "Lower trapezius", "Rhomboids", "Biceps brachii", "Brachialis"],
      equipment: ["Independent lever machine"],
      equipmentFr: ["Machine à leviers indépendants"],
      difficulty: "BEGINNER",
      objectives: ["MUSCLE_GAIN", "STRENGTH"],
      shortTechnicalCues: ["Épaules basses", "Coudes vers le bas", "Retour contrôlé"],
      detailedInstructions: "Réglez le siège et les supports de cuisses. Saisissez les poignées bras tendus, gardez le tronc stable, tirez les coudes vers le bas puis revenez lentement sans relâcher la charge.",
      instructionsFr: "Réglez le siège et les supports de cuisses. Saisissez les poignées bras tendus, gardez le tronc stable, tirez les coudes vers le bas puis revenez lentement sans relâcher la charge.",
      commonMistakes: ["Charge trop lourde", "Balancement du buste", "Épaules remontées", "Amplitude incomplète", "Retour trop rapide"],
      commonMistakesFr: ["Charge trop lourde", "Balancement du buste", "Épaules remontées", "Amplitude incomplète", "Retour trop rapide"],
      variants: [],
      alternatives: ["Lat Pulldown Cable"],
      tags: ["back", "vertical-pull", "lever-machine", "compound"],
      contraindications: [],
      primaryAnimationPath: `${mediaBase}/animation.webm`,
      fallbackImagePath: `${mediaBase}/position-contraction.webp`,
      fallbackThumbnailPath: `${mediaBase}/position-start.webp`,
      fallbackAnimationPath: `${mediaBase}/animation.webp`,
      isCompound: true,
      isActive: true,
    },
    create: {
      slug,
      name: "Lat Pulldown Machine",
      nameFr: "Tirage vertical à la machine",
      category: "BACK",
      movementType: "COMPOUND",
      primaryMuscles: ["Latissimus dorsi"],
      primaryMusclesFr: ["Grand dorsal"],
      secondaryMuscles: ["Teres major", "Middle trapezius", "Lower trapezius", "Rhomboids", "Biceps brachii", "Brachialis"],
      equipment: ["Independent lever machine"],
      equipmentFr: ["Machine à leviers indépendants"],
      difficulty: "BEGINNER",
      objectives: ["MUSCLE_GAIN", "STRENGTH"],
      shortTechnicalCues: ["Épaules basses", "Coudes vers le bas", "Retour contrôlé"],
      detailedInstructions: "Réglez le siège et les supports de cuisses. Saisissez les poignées bras tendus, gardez le tronc stable, tirez les coudes vers le bas puis revenez lentement sans relâcher la charge.",
      instructionsFr: "Réglez le siège et les supports de cuisses. Saisissez les poignées bras tendus, gardez le tronc stable, tirez les coudes vers le bas puis revenez lentement sans relâcher la charge.",
      commonMistakes: ["Charge trop lourde", "Balancement du buste", "Épaules remontées", "Amplitude incomplète", "Retour trop rapide"],
      commonMistakesFr: ["Charge trop lourde", "Balancement du buste", "Épaules remontées", "Amplitude incomplète", "Retour trop rapide"],
      variants: [],
      alternatives: ["Lat Pulldown Cable"],
      tags: ["back", "vertical-pull", "lever-machine", "compound"],
      contraindications: [],
      primaryAnimationPath: `${mediaBase}/animation.webm`,
      fallbackImagePath: `${mediaBase}/position-contraction.webp`,
      fallbackThumbnailPath: `${mediaBase}/position-start.webp`,
      fallbackAnimationPath: `${mediaBase}/animation.webp`,
      isCompound: true,
      isActive: true,
    },
    select: { id: true, slug: true },
  });

  console.log(`Lat Pulldown Machine pilot ready: ${exercise.slug} (${exercise.id}).`);
}

main()
  .finally(async () => prisma.$disconnect());
