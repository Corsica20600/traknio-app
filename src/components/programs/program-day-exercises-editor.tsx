"use client";

import { useMemo, useState, type FormEvent } from "react";
import {
  closestCenter,
  DndContext,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { useRouter } from "next/navigation";
import { ExerciseVisual } from "@/src/components/exercise/exercise-visual";
import { BrandSelect } from "@/src/components/ui/brand-select";
import { PrimaryButton } from "@/src/components/ui/primary-button";
import { ContextualWalkthrough } from "@/src/components/onboarding/contextual-walkthrough";

type ExerciseOption = {
  id: string;
  name: string;
  nameFr: string | null;
  primaryMuscles: string[];
  primaryMusclesFr: string[];
};

type DayExercise = {
  id: string;
  exerciseId: string;
  sets: number;
  repsMin: number | null;
  repsText: string | null;
  restSeconds: number;
  exercise: {
    id: string;
    name: string;
    nameFr: string | null;
    fallbackThumbnailPath: string;
    fallbackImagePath: string;
    primaryAnimationPath: string | null;
    media: Array<{
      type: "IMAGE" | "THUMBNAIL" | "ANIMATION";
      publicUrl: string;
      url: string | null;
      format: string;
    }>;
  };
};

function SortableExerciseCard({
  ex,
  idx,
  total,
  exerciseOptions,
  onUpdate,
  onDelete,
  onReplace,
}: {
  ex: DayExercise;
  idx: number;
  total: number;
  exerciseOptions: ExerciseOption[];
  onUpdate: (programExerciseId: string, values: {
    sets: number;
    repetitions: number;
    restSeconds: number;
    targetWeightKg: number;
  }) => Promise<void>;
  onDelete: (programExerciseId: string) => Promise<void>;
  onReplace: (programExerciseId: string, exerciseId: string) => Promise<void>;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: ex.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.92 : 1,
  };

  const [replaceExerciseId, setReplaceExerciseId] = useState(ex.exerciseId);
  const [updating, setUpdating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [replacing, setReplacing] = useState(false);

  async function handleUpdateSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (updating || deleting) return;
    const formData = new FormData(event.currentTarget);
    setUpdating(true);
    try {
      await onUpdate(ex.id, {
        sets: Number(formData.get("sets") ?? ex.sets),
        repetitions: Number(formData.get("repetitions") ?? ex.repsMin ?? 10),
        restSeconds: Number(formData.get("restSeconds") ?? ex.restSeconds),
        targetWeightKg: Number(formData.get("targetWeightKg") ?? 0),
      });
    } finally {
      setUpdating(false);
    }
  }

  async function handleDeleteClick() {
    if (updating || deleting) return;
    setDeleting(true);
    try {
      await onDelete(ex.id);
    } finally {
      setDeleting(false);
    }
  }

  async function handleReplaceSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!replaceExerciseId || replaceExerciseId === ex.exerciseId || replacing) return;
    setReplacing(true);
    try {
      await onReplace(ex.id, replaceExerciseId);
    } finally {
      setReplacing(false);
    }
  }

  return (
    <article ref={setNodeRef} style={style} className={`program-day-item ${isDragging ? "is-dragging" : ""}`}>
      <ExerciseVisual
        media={
          ex.exercise.media?.map((m) => ({
            type: m.type,
            publicUrl: m.publicUrl,
            url: m.url,
            format: String(m.format || "").toLowerCase(),
          })) ?? []
        }
        fallbackImage={ex.exercise.fallbackThumbnailPath || ex.exercise.fallbackImagePath}
        fallbackAnimation={ex.exercise.primaryAnimationPath}
        title={ex.exercise.nameFr || ex.exercise.name}
        compact
        className="program-day-item-visual"
      />
      <div>
        <div className="program-day-item-head">
          <p className="program-day-item-title">{ex.exercise.nameFr || ex.exercise.name}</p>
          <button
            type="button"
            className="reorder-btn drag-handle"
            data-onboarding-target="program-reorder"
            aria-label={`Déplacer ${ex.exercise.nameFr || ex.exercise.name}`}
            title="Glisser pour réordonner"
            {...attributes}
            {...listeners}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M9 6a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3m6 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3M9 10.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3m6 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3M9 15a1.5 1.5 0 1 1 0 3A1.5 1.5 0 0 1 9 15m6 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3" />
            </svg>
          </button>
        </div>
        <p className="muted">
          {ex.sets} séries · {ex.repsMin ?? "?"} reps · {ex.restSeconds ?? "?"} sec · {ex.repsText || "Poids libre"}
        </p>
        <form onSubmit={(event) => { void handleUpdateSubmit(event); }} className="form-grid" style={{ marginTop: 8 }}>
          <div className="grid-2">
            <div>
              <label className="field-label">Séries</label>
              <input name="sets" type="number" defaultValue={ex.sets} className="input" />
            </div>
            <div>
              <label className="field-label">Répétitions</label>
              <input name="repetitions" type="number" defaultValue={ex.repsMin ?? 10} className="input" />
            </div>
          </div>
          <div className="grid-2">
            <div>
              <label className="field-label">Repos (sec)</label>
              <input name="restSeconds" type="number" defaultValue={ex.restSeconds ?? 60} className="input" />
            </div>
            <div>
              <label className="field-label">Poids (kg)</label>
              <input name="targetWeightKg" type="number" defaultValue={Number(ex.repsText?.replace(/[^\d.,]/g, "").replace(",", ".") || 0)} className="input" />
            </div>
          </div>
          <div className="grid-2">
            <PrimaryButton type="submit" disabled={updating || deleting}>
              {updating ? "Modification..." : "Modifier"}
            </PrimaryButton>
            <button
              className="ghost-btn chip danger"
              type="button"
              disabled={updating || deleting}
              onClick={() => { void handleDeleteClick(); }}
            >
              {deleting ? "Suppression..." : "Retirer"}
            </button>
          </div>
        </form>
        <form onSubmit={(event) => { void handleReplaceSubmit(event); }} className="form-grid" style={{ marginTop: 8 }}>
          <label className="field-label">Remplacer par</label>
          <BrandSelect
            name="exerciseId"
            value={replaceExerciseId}
            onValueChange={setReplaceExerciseId}
            options={exerciseOptions.map((opt) => ({
              value: opt.id,
              label: `${opt.nameFr || opt.name} · ${opt.primaryMusclesFr[0] || opt.primaryMuscles[0] || "Full body"}`,
            }))}
          />
          <PrimaryButton type="submit" disabled={replacing || replaceExerciseId === ex.exerciseId}>
            {replacing ? "Remplacement..." : "Remplacer l'exercice"}
          </PrimaryButton>
        </form>
        <div className="chips" style={{ marginTop: 8 }}>
          <span className="chip muted">Position : {idx + 1}/{total}</span>
        </div>
      </div>
    </article>
  );
}

export function ProgramDayExercisesEditor({
  programId,
  initialExercises,
  exerciseOptions,
  showReorderWalkthrough = false,
}: {
  programId: string;
  initialExercises: DayExercise[];
  exerciseOptions: ExerciseOption[];
  showReorderWalkthrough?: boolean;
}) {
  const router = useRouter();
  const [exercises, setExercises] = useState(initialExercises);
  const [replaceFeedback, setReplaceFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 8 } }),
  );

  const ids = useMemo(() => exercises.map((item) => item.id), [exercises]);

  async function persistMove(exerciseId: string, direction: "up" | "down") {
    const res = await fetch(`/api/programs/${encodeURIComponent(programId)}/exercises/reorder`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ exerciseId, direction }),
    });
    if (!res.ok) {
      throw new Error(`reorder_failed_${res.status}`);
    }
  }

  async function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = exercises.findIndex((item) => item.id === active.id);
    const newIndex = exercises.findIndex((item) => item.id === over.id);
    if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;

    const previous = exercises;
    const movedId = String(active.id);
    const direction: "up" | "down" = newIndex < oldIndex ? "up" : "down";
    const hops = Math.abs(newIndex - oldIndex);

    setExercises((prev) => arrayMove(prev, oldIndex, newIndex));

    try {
      for (let i = 0; i < hops; i += 1) {
        await persistMove(movedId, direction);
      }
      if (showReorderWalkthrough) {
        window.dispatchEvent(new CustomEvent("traknio:onboarding-dismiss", { detail: { step: "reorderSeen" } }));
      }
    } catch {
      setExercises(previous);
    }
  }

  async function onReplace(programExerciseId: string, exerciseId: string) {
    setReplaceFeedback(null);
    const response = await fetch(
      `/api/programs/${encodeURIComponent(programId)}/exercises/${encodeURIComponent(programExerciseId)}/replace`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ exerciseId }),
      },
    );

    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as { error?: string };
      setReplaceFeedback({
        type: "error",
        message: payload.error || "Impossible de remplacer cet exercice.",
      });
      return;
    }

    const payload = await response.json() as {
      programExerciseId: string;
      exerciseId: string;
      exercise: DayExercise["exercise"];
    };

    setExercises((prev) =>
      prev.map((item) => (
        item.id === payload.programExerciseId
          ? {
              ...item,
              exerciseId: payload.exerciseId,
              exercise: payload.exercise,
            }
          : item
      )),
    );
    setReplaceFeedback({ type: "success", message: "Exercice remplacé." });
    router.refresh();
    window.setTimeout(() => setReplaceFeedback(null), 1800);
  }

  async function onUpdate(programExerciseId: string, values: {
    sets: number;
    repetitions: number;
    restSeconds: number;
    targetWeightKg: number;
  }) {
    setReplaceFeedback(null);
    const response = await fetch(
      `/api/programs/${encodeURIComponent(programId)}/exercises/${encodeURIComponent(programExerciseId)}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(values),
      },
    );

    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as { error?: string };
      setReplaceFeedback({
        type: "error",
        message: payload.error || "Impossible de modifier cet exercice.",
      });
      return;
    }

    const payload = await response.json() as {
      exercise: Pick<DayExercise, "id" | "sets" | "repsMin" | "repsText" | "restSeconds">;
    };

    setExercises((prev) =>
      prev.map((item) => (
        item.id === payload.exercise.id
          ? {
              ...item,
              sets: payload.exercise.sets,
              repsMin: payload.exercise.repsMin,
              repsText: payload.exercise.repsText,
              restSeconds: payload.exercise.restSeconds,
            }
          : item
      )),
    );
    setReplaceFeedback({ type: "success", message: "Exercice modifié." });
    router.refresh();
    window.setTimeout(() => setReplaceFeedback(null), 1800);
  }

  async function onDelete(programExerciseId: string) {
    setReplaceFeedback(null);
    const previous = exercises;
    setExercises((prev) => prev.filter((item) => item.id !== programExerciseId));

    const response = await fetch(
      `/api/programs/${encodeURIComponent(programId)}/exercises/${encodeURIComponent(programExerciseId)}`,
      { method: "DELETE" },
    );

    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as { error?: string };
      setExercises(previous);
      setReplaceFeedback({
        type: "error",
        message: payload.error || "Impossible de retirer cet exercice.",
      });
      return;
    }

    setReplaceFeedback({ type: "success", message: "Exercice retiré." });
    router.refresh();
    window.setTimeout(() => setReplaceFeedback(null), 1800);
  }

  return (
    <>
      <ContextualWalkthrough
        active={showReorderWalkthrough && exercises.length >= 2}
        step="reorderSeen"
        target="[data-onboarding-target='program-reorder']"
        title="Réorganise ta séance"
        message="Maintiens cette poignée et fais glisser l’exercice pour changer l’ordre."
      />

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis]}
        onDragEnd={(event) => { void onDragEnd(event); }}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <div className="program-day-list">
            <p className="program-reorder-hint">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M9 6a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3m6 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3M9 10.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3m6 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3M9 15a1.5 1.5 0 1 1 0 3A1.5 1.5 0 0 1 9 15m6 0a1.5 1.5 0 1 1 0 3A1.5 1.5 0 0 1 15 15" />
              </svg>
              Maintiens l&apos;icône à 6 points pour déplacer un exercice.
            </p>
            {replaceFeedback ? (
              <p
                className={replaceFeedback.type === "success" ? "status-success" : "status-danger"}
                role="status"
                aria-live="polite"
              >
                {replaceFeedback.message}
              </p>
            ) : null}
            {exercises.map((ex, idx) => (
              <SortableExerciseCard
                key={ex.id}
                ex={ex}
                idx={idx}
                total={exercises.length}
                exerciseOptions={exerciseOptions}
                onUpdate={onUpdate}
                onDelete={onDelete}
                onReplace={onReplace}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </>
  );
}
