import Link from "next/link";
import { ExerciseVisual } from "@/src/components/exercise/exercise-visual";
import { getExerciseDisplayName } from "@/src/lib/exercise-overrides";
import { levelToFr } from "@/src/lib/exercise-i18n";

type ExerciseCardProps = {
  exercise: {
    id: string;
    slug: string;
    name: string;
    nameFr: string | null;
    primaryMuscles: string[];
    primaryMusclesFr: string[];
    equipment: string[];
    equipmentFr: string[];
    difficulty: "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
    fallbackImagePath: string;
    fallbackThumbnailPath: string;
    fallbackAnimationPath: string | null;
    media: Array<{
      type: "IMAGE" | "THUMBNAIL" | "ANIMATION";
      publicUrl?: string | null;
      url?: string | null;
      format?: string | null;
    }>;
  };
};

export function ExerciseCard({ exercise }: ExerciseCardProps) {
  const title = getExerciseDisplayName(exercise);
  const primaryMuscle = exercise.primaryMusclesFr[0] || exercise.primaryMuscles[0] || "Full body";
  const equipment = exercise.equipmentFr[0] || exercise.equipment[0] || "Poids du corps";

  return (
    <Link
      href={`/exercises/${exercise.slug}`}
      className="exercise-card exercise-card-premium exercise-card-link"
      aria-label={`Voir le détail de ${title}`}
    >
      <ExerciseVisual
        media={exercise.media}
        fallbackImage={exercise.fallbackThumbnailPath || exercise.fallbackImagePath}
        fallbackAnimation={exercise.fallbackAnimationPath}
        context="CATALOG"
        title={title}
        compact
      />
      <div className="exercise-card-overlay">
        <div className="exercise-card-kicker">
          <span className="exercise-muscle-badge">{primaryMuscle}</span>
        </div>
        <h3 className="exercise-card-title">{title}</h3>
        <div className="chips" aria-label="Informations de l'exercice">
          <span className="chip">{equipment}</span>
          <span className="chip">{levelToFr(exercise.difficulty)}</span>
        </div>
        <span className="outline-link exercise-card-cta">Voir le détail</span>
      </div>
    </Link>
  );
}
