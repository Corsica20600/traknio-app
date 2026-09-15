"use client";

import Image from "next/image";
import { getExerciseDisplayName, getExerciseOverride } from "@/src/lib/exercise-overrides";
import { resolveExerciseMedia, type ResolvableExerciseMedia } from "@/src/lib/exercise-media-resolver";

type NextExerciseCardProps = {
  exercise?: {
    slug?: string;
    name: string;
    nameFr: string | null;
    primaryMuscles: string[];
    primaryMusclesFr: string[];
    fallbackThumbnailPath: string;
    fallbackImagePath: string;
    media?: ResolvableExerciseMedia[];
    plannedSets: number | null;
    plannedWeightKg: number | null;
  } | null;
};

export function NextExerciseCard({ exercise }: NextExerciseCardProps) {
  if (!exercise) {
    return (
      <section className="next-exercise-card">
        <p className="eyebrow">À suivre</p>
        <h2>Fin de séance en approche</h2>
        <p className="muted">Tu es sur le dernier exercice prévu.</p>
      </section>
    );
  }

  const override = exercise.slug ? getExerciseOverride(exercise.slug) : null;
  const title = getExerciseDisplayName(exercise);
  const muscle = override?.primaryMuscleFr || exercise.primaryMusclesFr[0] || "Corps complet";
  const image = resolveExerciseMedia(exercise, "PHONE_WORKOUT").image;

  return (
    <section className="next-exercise-card">
      {image ? <Image src={image} alt={title} width={220} height={140} /> : null}
      <div>
        <p className="eyebrow">À suivre</p>
        <h2>{title}</h2>
        <p className="muted">{muscle} · {exercise.plannedSets ?? 3} séries{exercise.plannedWeightKg != null ? ` · ${exercise.plannedWeightKg} kg` : ""}</p>
      </div>
    </section>
  );
}
