import { requirePremiumAccess } from "@/src/server/premium-access";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AddToProgramForm } from "@/src/components/exercise/add-to-program-form";
import { ExerciseDetailSheet } from "@/src/components/exercise/exercise-detail-sheet";
import { ExerciseTechnicalSheet } from "@/src/components/exercise/exercise-technical-sheet";
import { PrimaryButton } from "@/src/components/ui/primary-button";
import { buildExerciseDetailContent } from "@/src/lib/exercise-detail-content";
import { categoryToFr, levelToFr, translateSimple } from "@/src/lib/exercise-i18n";
import { getExerciseDisplayName, getExerciseOverride } from "@/src/lib/exercise-overrides";
import { getExerciseGuidePilot } from "@/src/lib/exercise-pilots";
import { getTechnicalSheetFromDatabase } from "@/src/lib/exercise-technical-sheet-data";
import { privatePageMetadata } from "@/src/lib/private-page-metadata";
import { addExerciseToProgramDayAction } from "@/src/server/fitness-actions";
import { getExerciseBySlug, getProgramsForDemoUser } from "@/src/server/fitness-queries";

export const metadata = privatePageMetadata(
  "Fiche exercice",
  "Fiche exercice privée Traknio avec technique, conseils, muscles et erreurs à éviter.",
);

function uniqueText(items: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const raw of items) {
    const value = raw.trim();
    if (!value) continue;
    const key = value.toLocaleLowerCase("fr");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }

  return out;
}

function buildTips(input: {
  difficulty: "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
  equipment: string[];
  category: string;
}) {
  return uniqueText([
    `Niveau: ${levelToFr(input.difficulty)}`,
    `Matériel: ${input.equipment.join(" · ") || "Poids du corps"}`,
    `Objectif: ${categoryToFr(input.category)}`,
    "Tempo: descente contrôlée, remontée propre",
    "Respiration: expire sur l'effort, inspire au retour",
  ]);
}

export default async function ExerciseDetailPage(props: PageProps<"/exercises/[slug]">) {
  await requirePremiumAccess();
  const { slug } = await props.params;

  const databaseGuide = await getTechnicalSheetFromDatabase(slug);
  const pilotGuide = databaseGuide ?? getExerciseGuidePilot(slug);

  // Isolated technical-sheet pilots reuse the same rendering engine without
  // overwriting the historic exercise records or their existing media.
  if (pilotGuide) {
    const [pilotExercise, programs] = await Promise.all([
      getExerciseBySlug(slug),
      getProgramsForDemoUser(),
    ]);
    return (
      <ExerciseTechnicalSheet
        guide={pilotGuide}
        exerciseId={pilotExercise?.id}
        programs={programs.map((program) => ({
          id: program.id,
          name: program.name,
          days: program.days.map((day) => ({ id: day.id, dayIndex: day.dayIndex, title: day.title })),
        }))}
        addToProgramAction={addExerciseToProgramDayAction}
      />
    );
  }

  const [exercise, programs] = await Promise.all([
    getExerciseBySlug(slug),
    getProgramsForDemoUser(),
  ]);

  if (!exercise) notFound();

  const override = getExerciseOverride(exercise.slug);
  const displayName = getExerciseDisplayName(exercise);
  const primaryMuscles = uniqueText(
    exercise.primaryMusclesFr.length
      ? exercise.primaryMusclesFr
      : exercise.primaryMuscles.map((item) => translateSimple(item).text),
  );
  const secondaryMuscles = uniqueText(exercise.secondaryMuscles.map((item) => translateSimple(item).text));
  const equipment = uniqueText(
    exercise.equipmentFr.length
      ? exercise.equipmentFr
      : exercise.equipment.map((item) => translateSimple(item).text),
  );
  const content = buildExerciseDetailContent(exercise);
  const programsForForm = programs.map((program) => ({
    id: program.id,
    name: program.name,
    days: program.days.map((day) => ({
      id: day.id,
      dayIndex: day.dayIndex,
      title: day.title,
    })),
  }));

  const addToProgramSlot = programsForForm.length === 0 ? (
    <div className="stack">
      <p className="muted">Crée d&apos;abord un programme pour ajouter cet exercice.</p>
      <Link href="/programs">
        <PrimaryButton>Créer un programme</PrimaryButton>
      </Link>
    </div>
  ) : (
    <AddToProgramForm
      exerciseId={exercise.id}
      programs={programsForForm}
      action={addExerciseToProgramDayAction}
    />
  );

  return (
    <ExerciseDetailSheet
      title={displayName}
      subtitle={`Technique propre pour cibler ${primaryMuscles[0]?.toLowerCase() || "les muscles visés"}`}
      categoryLabel={categoryToFr(exercise.category)}
      difficultyLabel={levelToFr(exercise.difficulty)}
      muscles={{
        primary: primaryMuscles,
        secondary: secondaryMuscles,
      }}
      equipment={equipment}
      visual={{
        media: exercise.media,
        fallbackAnimation: exercise.fallbackAnimationPath,
        fallbackImage: override?.cardImage || exercise.fallbackImagePath,
        frameAnimationUrls: override?.frameAnimationUrls,
        frameIntervalMs: override?.frameIntervalMs,
        detailImage: override?.detailImage,
      }}
      content={content}
      tips={buildTips({
        difficulty: exercise.difficulty,
        equipment,
        category: exercise.category,
      })}
      addToProgramSlot={addToProgramSlot}
      backSlot={<Link href="/exercises" className="outline-link">Retour catalogue</Link>}
    />
  );
}
