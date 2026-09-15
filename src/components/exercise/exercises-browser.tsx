"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ExerciseVisual } from "@/src/components/exercise/exercise-visual";

type ExerciseCard = {
  id: string;
  slug: string;
  name: string;
  primaryMuscles: string[];
  equipment: string[];
  difficulty: string;
  fallbackImagePath: string;
  fallbackThumbnailPath: string;
  fallbackAnimationPath: string;
  media: Array<{ type: "IMAGE" | "THUMBNAIL" | "ANIMATION"; publicUrl?: string | null; url?: string | null; format?: string | null }>;
};

const muscleFilters = ["Pectoraux", "Dos", "Epaules", "Biceps", "Triceps", "Jambes", "Abdos", "Cardio"];
const equipmentFilters = ["Halteres", "Barre", "Machine", "Poulie", "Poids du corps"];

function normalize(value: string) {
  return value.toLowerCase();
}

function includesKey(items: string[], key: string) {
  const target = normalize(key);
  return items.some((item) => normalize(item).includes(target));
}

export function ExercisesBrowser({ exercises }: { exercises: ExerciseCard[] }) {
  const [search, setSearch] = useState("");
  const [muscle, setMuscle] = useState<string | null>(null);
  const [equipment, setEquipment] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return exercises.filter((exercise) => {
      const bySearch =
        search.length < 2 ||
        normalize(exercise.name).includes(normalize(search)) ||
        exercise.primaryMuscles.some((muscleItem) => normalize(muscleItem).includes(normalize(search)));

      const byMuscle = !muscle || includesKey(exercise.primaryMuscles, muscle);
      const byEquipment = !equipment || includesKey(exercise.equipment, equipment);

      return bySearch && byMuscle && byEquipment;
    });
  }, [exercises, search, muscle, equipment]);

  return (
    <section className="stack">
      <section className="card exercises-toolbar">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="input"
          placeholder="Rechercher un exercice"
        />

        <div className="filter-block">
          <p className="eyebrow">Muscle</p>
          <div className="chips interactive">
            {muscleFilters.map((item) => (
              <button key={item} type="button" className={`chip ${muscle === item ? "active" : ""}`} onClick={() => setMuscle(muscle === item ? null : item)}>
                {item}
              </button>
            ))}
          </div>
        </div>

        <div className="filter-block">
          <p className="eyebrow">Materiel</p>
          <div className="chips interactive">
            {equipmentFilters.map((item) => (
              <button key={item} type="button" className={`chip ${equipment === item ? "active" : ""}`} onClick={() => setEquipment(equipment === item ? null : item)}>
                {item}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="exercise-grid">
        {filtered.map((exercise) => (
          <article key={exercise.id} className="exercise-card card">
            <ExerciseVisual
              media={exercise.media}
              fallbackImage={exercise.fallbackThumbnailPath || exercise.fallbackImagePath}
              fallbackAnimation={exercise.fallbackAnimationPath}
              title={exercise.name}
              compact
              context="CATALOG"
            />
            <div className="exercise-card-body">
              <h3>{exercise.name}</h3>
              <p className="muted">{exercise.primaryMuscles[0] ?? "Full body"}</p>
              <div className="exercise-meta-inline">
                <span>{exercise.equipment[0] ?? "Poids du corps"}</span>
                <span>{exercise.difficulty}</span>
              </div>
              <Link href={`/exercises/${exercise.slug}`} className="outline-link">Voir detail</Link>
            </div>
          </article>
        ))}
      </section>
    </section>
  );
}
