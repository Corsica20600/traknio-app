"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MouseEvent, TouchEvent } from "react";
import { useRouter } from "next/navigation";
import { CurrentExerciseCard } from "@/src/components/workout/current-exercise-card";
import { NextExerciseCard } from "@/src/components/workout/next-exercise-card";
import { RestTimerCard } from "@/src/components/workout/rest-timer-card";
import { WorkoutProgressHeader } from "@/src/components/workout/workout-progress-header";
import { PrimaryAction } from "@/src/components/ui/primary-action";

type WorkoutExercise = {
  id: string;
  slug: string;
  name: string;
  nameFr: string | null;
  category: string;
  categoryFr?: string;
  movementType: string;
  primaryMuscles: string[];
  primaryMusclesFr: string[];
  equipment: string[];
  equipmentFr: string[];
  difficulty: "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
  fallbackImagePath: string;
  fallbackThumbnailPath: string;
  fallbackAnimationPath: string;
  plannedSets: number | null;
  plannedRepsMin: number | null;
  plannedRepsMax: number | null;
  plannedWeightKg: number | null;
  plannedRestSeconds: number | null;
  programExerciseId: string | null;
  technicalCue: string | null;
  media: Array<{
    id: string;
    type: "IMAGE" | "THUMBNAIL" | "ANIMATION";
    publicUrl: string;
    url: string | null;
    format: string;
  }>;
};

type ExistingSet = {
  id: string;
  exerciseId: string;
  setIndex: number;
  targetRepsMin: number | null;
  actualReps: number | null;
  actualWeightKg: number | null;
  createdAt: string;
};

type CompletedSet = {
  id: string;
  exerciseId: string;
  setIndex: number;
  targetRepsMin: number;
  actualReps: number | null;
  actualWeightKg: number | null;
  createdAt: string;
};

type ReplacementOption = Pick<
  WorkoutExercise,
  | "id"
  | "slug"
  | "name"
  | "nameFr"
  | "category"
  | "categoryFr"
  | "movementType"
  | "difficulty"
  | "primaryMuscles"
  | "primaryMusclesFr"
  | "equipment"
  | "equipmentFr"
  | "fallbackImagePath"
  | "fallbackThumbnailPath"
  | "fallbackAnimationPath"
  | "media"
>;

type WorkoutSummary = {
  durationSeconds: number | null;
  exercisesCount: number;
  setsCount: number;
  volumeTotal: number;
};

const PLANNED_REPS = [12, 10, 10];

type WakeLockSentinelLike = {
  released: boolean;
  release: () => Promise<void>;
};

type WakeLockNavigator = Navigator & {
  wakeLock?: {
    request: (type: "screen") => Promise<WakeLockSentinelLike>;
  };
};

function buildPlannedReps(exercise: WorkoutExercise, forcedSets?: number) {
  const setsCount = Math.max(1, Math.min(12, forcedSets ?? exercise.plannedSets ?? PLANNED_REPS.length));
  const targetReps = exercise.plannedRepsMin ?? exercise.plannedRepsMax ?? null;
  return Array.from({ length: setsCount }, (_, idx) => targetReps ?? PLANNED_REPS[idx] ?? PLANNED_REPS[PLANNED_REPS.length - 1] ?? 10);
}

export function GuidedWorkoutClient({
  sessionId,
  sessionTitle,
  programName,
  startedAt,
  exercises: initialExercises,
  existingSets,
}: {
  sessionId: string;
  sessionTitle: string;
  programName?: string | null;
  startedAt?: string | null;
  exercises: WorkoutExercise[];
  existingSets: ExistingSet[];
}) {
  const router = useRouter();
  const initialRestChoice = initialExercises[0]?.plannedRestSeconds && initialExercises[0].plannedRestSeconds > 0
    ? initialExercises[0].plannedRestSeconds
    : 90;

  const [exercises, setExercises] = useState(initialExercises);
  const [exerciseIndex, setExerciseIndex] = useState(0);
  const [restChoice, setRestChoice] = useState(initialRestChoice);
  const [restRemaining, setRestRemaining] = useState(0);
  const [restEndsAt, setRestEndsAt] = useState<number | null>(null);
  const [restPaused, setRestPaused] = useState(false);
  const [restSyncPending, setRestSyncPending] = useState(false);
  const [completedSets, setCompletedSets] = useState<CompletedSet[]>(
    existingSets.map((item) => ({
      id: item.id,
      exerciseId: item.exerciseId,
      setIndex: item.setIndex,
      targetRepsMin: item.targetRepsMin ?? PLANNED_REPS[Math.max(0, item.setIndex - 1)] ?? 10,
      actualReps: item.actualReps,
      actualWeightKg: item.actualWeightKg,
      createdAt: item.createdAt,
    })),
  );
  const [ending, setEnding] = useState(false);
  const [summary, setSummary] = useState<WorkoutSummary | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(() => {
    if (!startedAt) return 0;
    return Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
  });
  const [completionError, setCompletionError] = useState<string | null>(null);
  const [canRepairCompletion, setCanRepairCompletion] = useState(false);
  const [replacementOpen, setReplacementOpen] = useState(false);
  const [replacementLoading, setReplacementLoading] = useState(false);
  const [replacementError, setReplacementError] = useState<string | null>(null);
  const [replacementOptions, setReplacementOptions] = useState<ReplacementOption[]>([]);
  const [replacingExerciseId, setReplacingExerciseId] = useState<string | null>(null);
  const [replacementOriginByExercise, setReplacementOriginByExercise] = useState<Record<string, string>>({});
  const [repsByKey, setRepsByKey] = useState<Record<string, number>>({});
  const [weightByKey, setWeightByKey] = useState<Record<string, number>>({});
  const [plannedSetsByExercise, setPlannedSetsByExercise] = useState<Record<string, number>>({});
  const [justValidated, setJustValidated] = useState(false);
  const [isSetValidationPending, setIsSetValidationPending] = useState(false);
  const [isRestActionPending, setIsRestActionPending] = useState(false);
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const lastSyncedWatchPositionRef = useRef<string>("");
  const liveTargetTimerRef = useRef<number | null>(null);
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const prevRestRemainingRef = useRef<number>(0);
  const skipRestRequestedRef = useRef(false);
  const surfaceTapReadyAtRef = useRef<number>(0);
  const setValidationInFlightRef = useRef(false);
  const restActionInFlightRef = useRef(false);
  const pendingRestActionRef = useRef<{ requestId: string; operation: "pause" | "resume" } | null>(null);

  const computeRemainingFromEndsAt = useCallback((endsAt: number) => {
    return Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
  }, []);

  const clearRestTimer = useCallback(() => {
    setRestEndsAt(null);
    setRestRemaining(0);
    setRestPaused(false);
  }, []);

  const startRestTimer = useCallback((restDurationSeconds: number) => {
    const duration = Math.max(0, Math.floor(restDurationSeconds));
    if (duration <= 0) {
      clearRestTimer();
      return;
    }
    const restStartedAt = Date.now();
    const endsAt = restStartedAt + duration * 1000;
    setRestPaused(false);
    setRestEndsAt(endsAt);
    setRestRemaining(computeRemainingFromEndsAt(endsAt));
  }, [clearRestTimer, computeRemainingFromEndsAt]);

  const unlockRestAudio = useCallback(() => {
    try {
      const audioContext = audioCtxRef.current ?? new AudioContext();
      audioCtxRef.current = audioContext;
      if (audioContext.state === "suspended") {
        void audioContext.resume();
      }
    } catch {
      // Audio can be unavailable in some embedded browsers; the workout must continue.
    }
  }, []);

  const pushSyncState = useCallback((nextExerciseIndex: number, nextSetIndex: number, nextRest?: number, status: "ACTIVE" | "PAUSED" | "COMPLETED" = "ACTIVE") => {
    const body: Record<string, unknown> = {
      workoutSessionId: sessionId,
      currentExerciseIndex: Math.max(0, nextExerciseIndex),
      currentSetIndex: Math.max(1, nextSetIndex),
      status,
      lastSyncAt: new Date().toISOString(),
    };
    if (Number.isFinite(nextRest)) {
      body.restRemaining = Math.max(0, nextRest as number);
      body.restStatus = nextRest && nextRest > 0 ? "ACTIVE" : "IDLE";
    }
    void fetch("/api/watch/syncWorkoutState", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }, [sessionId]);

  const pushLiveTarget = useCallback((input: {
    exerciseId: string;
    programExerciseId: string | null;
    setIndex: number;
    targetReps: number;
    targetWeightKg: number;
    currentExerciseIndex: number;
  }) => {
    if (liveTargetTimerRef.current != null) {
      window.clearTimeout(liveTargetTimerRef.current);
    }
    liveTargetTimerRef.current = window.setTimeout(() => {
      void fetch("/api/workout/live-target", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId,
          exerciseId: input.exerciseId,
          programExerciseId: input.programExerciseId,
          setIndex: input.setIndex,
          targetReps: input.targetReps,
          targetWeightKg: input.targetWeightKg,
          currentExerciseIndex: input.currentExerciseIndex,
          currentSetIndex: input.setIndex,
        }),
      });
    }, 450);
  }, [sessionId]);

  const exercise = exercises[exerciseIndex];
  const isActiveWorkoutSurface = restRemaining <= 0;
  const plannedRepsForExercise = buildPlannedReps(exercise, plannedSetsByExercise[exercise.id]);
  const replacedFromExerciseId = replacementOriginByExercise[exercise.id] ?? null;
  const completedForExercise = completedSets
    .filter((item) => item.exerciseId === exercise.id || item.exerciseId === replacedFromExerciseId)
    .sort((a, b) => a.setIndex - b.setIndex);
  const nextSetIndex = completedForExercise.length + 1;
  const setRows = plannedRepsForExercise.map((planned, idx) => ({
    setIndex: idx + 1,
    plannedReps: planned,
    existing: completedForExercise.find((set) => set.setIndex === idx + 1),
  }));

  const getPlannedRestForIndex = useCallback((index: number) => {
    const nextRest = exercises[index]?.plannedRestSeconds;
    return nextRest && nextRest > 0 ? nextRest : 90;
  }, [exercises]);

  useEffect(() => {
    if (restEndsAt == null || restPaused) return;
    const refresh = () => {
      const remainingSeconds = computeRemainingFromEndsAt(restEndsAt);
      setRestRemaining(remainingSeconds);
      if (remainingSeconds <= 0) {
        setRestEndsAt(null);
      }
    };
    refresh();
    const interval = window.setInterval(refresh, 250);
    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [restEndsAt, restPaused, computeRemainingFromEndsAt]);

  useEffect(() => {
    if (!startedAt) return;
    const refresh = () => setElapsedSeconds(Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)));
    refresh();
    const interval = window.setInterval(refresh, 30000);
    return () => window.clearInterval(interval);
  }, [startedAt]);

  const playRestFinishedBeep = useCallback(() => {
    try {
      const audioContext = audioCtxRef.current ?? new AudioContext();
      audioCtxRef.current = audioContext;
      if (audioContext.state === "suspended") {
        void audioContext.resume();
      }
      const now = audioContext.currentTime;
      const notes = [659, 880, 1175];
      notes.forEach((frequency, index) => {
        const start = now + index * 0.13;
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(frequency, start);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.18, start + 0.018);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.19);
        osc.connect(gain);
        gain.connect(audioContext.destination);
        osc.start(start);
        osc.stop(start + 0.21);
      });
    } catch {
      // Keep workout flow resilient if audio API is unavailable.
    }
  }, []);

  useEffect(() => {
    const previous = prevRestRemainingRef.current;
    if (previous > 0 && restRemaining === 0) {
      playRestFinishedBeep();
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate?.([120, 80, 120]);
      }
    }
    prevRestRemainingRef.current = restRemaining;
  }, [restRemaining, playRestFinishedBeep]);

  useEffect(() => {
    if (!justValidated) return;
    const t = window.setTimeout(() => setJustValidated(false), 420);
    return () => window.clearTimeout(t);
  }, [justValidated]);

  useEffect(() => {
    const nav = navigator as WakeLockNavigator;

    const requestWakeLock = async () => {
      try {
        if (!nav.wakeLock || document.visibilityState !== "visible") return;
        if (wakeLockRef.current && !wakeLockRef.current.released) return;
        wakeLockRef.current = await nav.wakeLock.request("screen");
      } catch {
        // Wake Lock may be blocked by browser/power policy; ignore gracefully.
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void requestWakeLock();
      }
    };

    void requestWakeLock();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      if (wakeLockRef.current && !wakeLockRef.current.released) {
        void wakeLockRef.current.release();
      }
      wakeLockRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (summary) return;
    let alive = true;

    async function pullWatchState() {
      try {
        const response = await fetch(`/api/watch/current-session?sessionId=${encodeURIComponent(sessionId)}`, {
          cache: "no-store",
        });
        if (!response.ok) return;
        const data = await response.json() as {
          payload?: {
            exerciseIndex?: number;
            setIndex?: number;
            totalSets?: number;
            restRemaining?: number;
            restStatus?: "IDLE" | "ACTIVE" | "PAUSED";
            status?: string;
          };
        };
        const state = data.payload;

        if (!alive || !state || setValidationInFlightRef.current || restActionInFlightRef.current || pendingRestActionRef.current) return;
        if (state.status === "COMPLETED") {
          clearRestTimer();
          setEnding(true);
          try {
            const completeResponse = await fetch("/api/workout/complete", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ sessionId, forceComplete: true }),
            });
            if (completeResponse.ok) {
              const completeData = await completeResponse.json() as { summary?: WorkoutSummary };
              if (alive && completeData.summary) {
                setSummary(completeData.summary);
                setEnding(false);
                return;
              }
            }
          } catch {
            // A manual refresh below is enough if the summary endpoint is temporarily unavailable.
          }
          if (alive) {
            setEnding(false);
            router.refresh();
          }
          return;
        }
        if (state.status !== "IN_PROGRESS") return;
        const exerciseIndexFromWatch = Math.max(1, Number(state.exerciseIndex ?? 1)) - 1;
        const setIndexFromWatch = Math.max(1, Number(state.setIndex ?? 1));
        const restFromWatch = Math.max(0, Number(state.restRemaining ?? 0));
        const restStatus = state.restStatus === "PAUSED" ? "PAUSED" : restFromWatch > 0 ? "ACTIVE" : "IDLE";
        const guard = `${exerciseIndexFromWatch}:${setIndexFromWatch}:${restFromWatch}:${restStatus}`;
        if (lastSyncedWatchPositionRef.current === guard) return;
        lastSyncedWatchPositionRef.current = guard;

        setExerciseIndex((prev) => {
          const next = Math.max(0, Math.min(exercises.length - 1, exerciseIndexFromWatch));
          return prev === next ? prev : next;
        });
        setRestChoice(getPlannedRestForIndex(exerciseIndexFromWatch));
        setRestPaused(restStatus === "PAUSED");
        setRestRemaining(() => {
          if (restFromWatch === 0 && skipRestRequestedRef.current) {
            skipRestRequestedRef.current = false;
            return 0;
          }
          return restFromWatch;
        });
        if (restFromWatch > 0 && restStatus !== "PAUSED") {
          const syncedEndsAt = Date.now() + restFromWatch * 1000;
          setRestEndsAt(syncedEndsAt);
        } else {
          setRestEndsAt(null);
        }

        const exerciseFromWatch = exercises[Math.max(0, Math.min(exercises.length - 1, exerciseIndexFromWatch))];
        if (!exerciseFromWatch) return;

        const planned = buildPlannedReps(exerciseFromWatch);
        const completedUntil = Math.max(0, setIndexFromWatch - 1);
        if (completedUntil <= 0) return;

        setCompletedSets((prev) => {
          const fromExercise = prev.filter((item) => item.exerciseId === exerciseFromWatch.id);
          const bySetIndex = new Map<number, CompletedSet>();
          for (const item of fromExercise) bySetIndex.set(item.setIndex, item);

          const strictForExercise: CompletedSet[] = [];
          for (let idx = 1; idx <= completedUntil; idx += 1) {
            const existing = bySetIndex.get(idx);
            strictForExercise.push(
              existing ?? {
                id: `watch-sync-${exerciseFromWatch.id}-${idx}`,
                exerciseId: exerciseFromWatch.id,
                setIndex: idx,
                targetRepsMin: planned[Math.max(0, idx - 1)] ?? 10,
                actualReps: null,
                actualWeightKg: null,
                createdAt: new Date().toISOString(),
              },
            );
          }

          return [
            ...prev.filter((item) => item.exerciseId !== exerciseFromWatch.id),
            ...strictForExercise,
          ];
        });
      } catch {
        // Keep local workout resilient if watch endpoint is temporarily unavailable.
      }
    }

    const interval = window.setInterval(pullWatchState, 1000);
    const pullFreshState = () => {
      void pullWatchState();
      router.refresh();
    };
    const onVisibleAgain = () => {
      if (document.visibilityState === "visible") pullFreshState();
    };
    window.addEventListener("focus", pullFreshState);
    window.addEventListener("pageshow", pullFreshState);
    window.addEventListener("traknio:app-resume", pullFreshState);
    document.addEventListener("visibilitychange", onVisibleAgain);
    void pullWatchState();
    return () => {
      alive = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", pullFreshState);
      window.removeEventListener("pageshow", pullFreshState);
      window.removeEventListener("traknio:app-resume", pullFreshState);
      document.removeEventListener("visibilitychange", onVisibleAgain);
    };
  }, [sessionId, exercises, getPlannedRestForIndex, clearRestTimer, router, summary]);

  useEffect(() => {
    surfaceTapReadyAtRef.current = Date.now() + 1200;
  }, [exerciseIndex, isActiveWorkoutSurface]);

  useEffect(() => {
    return () => {
      if (liveTargetTimerRef.current != null) {
        window.clearTimeout(liveTargetTimerRef.current);
      }
    };
  }, []);

  async function onValidateSet(setIndex: number, plannedReps: number) {
    if (setValidationInFlightRef.current) return;
    setValidationInFlightRef.current = true;
    setIsSetValidationPending(true);
    unlockRestAudio();
    const key = `${exercise.id}:${setIndex}`;
    const actualReps = Math.max(1, repsByKey[key] ?? plannedReps);
    const actualWeightKg = Math.max(0, weightByKey[key] ?? exercise.plannedWeightKg ?? 0);
    const validatedRestSeconds = restChoice;
    const previousRestEndsAt = restEndsAt;
    const previousRestRemaining = restRemaining;

    // Start locally so the rest screen never waits for the set persistence round trip.
    startRestTimer(validatedRestSeconds);

    try {
      const response = await fetch("/api/workout/log-set", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId,
          exerciseId: exercise.id,
          programExerciseId: exercise.programExerciseId,
          currentExerciseIndex: exerciseIndex,
          totalSetsForExercise: setRows.length,
          setIndex,
          targetReps: plannedReps,
          actualReps,
          actualWeightKg,
          restSeconds: validatedRestSeconds,
        }),
      });

      if (!response.ok) {
        setRestEndsAt(previousRestEndsAt);
        setRestRemaining(previousRestRemaining);
        return;
      }
      const data = await response.json();
      const saved = data.set as CompletedSet;
      setJustValidated(true);
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate?.(28);
      }

      setCompletedSets((prev) => {
        const withoutSame = prev.filter((item) => !(item.exerciseId === saved.exerciseId && item.setIndex === saved.setIndex));
        return [...withoutSame, saved];
      });
      const isLastSetForExercise = setIndex >= setRows.length;
      const optimisticExerciseIndex = isLastSetForExercise
        ? Math.max(0, Math.min(exercises.length - 1, exerciseIndex + 1))
        : exerciseIndex;
      if (isLastSetForExercise && exerciseIndex < exercises.length - 1) {
        setExerciseIndex(optimisticExerciseIndex);
        setRestChoice(getPlannedRestForIndex(optimisticExerciseIndex));
      }
      try {
        const strictStateRes = await fetch(`/api/watch/current-session?sessionId=${encodeURIComponent(sessionId)}`, { cache: "no-store" });
        if (strictStateRes.ok) {
          const strictData = await strictStateRes.json() as {
            payload?: { exerciseIndex?: number; setIndex?: number; restRemaining?: number; restStatus?: "IDLE" | "ACTIVE" | "PAUSED" };
          };
          const strictState = strictData.payload;
          if (!strictState) return;
          let strictExerciseIndex = Math.max(1, Number(strictState.exerciseIndex ?? 1)) - 1;
          const strictSetIndex = Math.max(1, Number(strictState.setIndex ?? (setIndex + 1)));
          const strictRest = Math.max(0, Number(strictState.restRemaining ?? validatedRestSeconds));
          const strictRestStatus = strictState.restStatus === "PAUSED" ? "PAUSED" : strictRest > 0 ? "ACTIVE" : "IDLE";
          if (isLastSetForExercise && strictExerciseIndex < optimisticExerciseIndex) {
            strictExerciseIndex = optimisticExerciseIndex;
          }
          setExerciseIndex(Math.max(0, Math.min(exercises.length - 1, strictExerciseIndex)));
          setRestChoice(getPlannedRestForIndex(strictExerciseIndex));
          setRestPaused(strictRestStatus === "PAUSED");
          setRestRemaining(() => {
            if (strictRest === 0 && skipRestRequestedRef.current) {
              skipRestRequestedRef.current = false;
              return 0;
            }
            return strictRest;
          });
          if (strictRest > 0 && strictRestStatus !== "PAUSED") {
            const strictEndsAt = Date.now() + strictRest * 1000;
            setRestEndsAt(strictEndsAt);
          } else {
            setRestEndsAt(null);
          }
          lastSyncedWatchPositionRef.current = `${strictExerciseIndex}:${strictSetIndex}:${strictRest}`;
        }
      } catch {
        // The local rest timer remains valid if the follow-up sync read is unavailable.
      }
    } catch {
      setRestEndsAt(previousRestEndsAt);
      setRestRemaining(previousRestRemaining);
    } finally {
      setValidationInFlightRef.current = false;
      setIsSetValidationPending(false);
    }
  }

  async function onAdjustSets(delta: number) {
    const currentSets = Math.max(1, setRows.length);
    const minAllowedSets = Math.max(1, completedForExercise.length);
    const desired = Math.max(minAllowedSets, Math.min(12, currentSets + delta));
    if (desired === currentSets) return;

    const previous = plannedSetsByExercise[exercise.id];
    setPlannedSetsByExercise((prev) => ({ ...prev, [exercise.id]: desired }));

    try {
      const response = await fetch("/api/workout/adjust-sets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId,
          exerciseId: exercise.id,
          programExerciseId: exercise.programExerciseId,
          nextSets: desired,
        }),
      });
      if (!response.ok) throw new Error("adjust_failed");
      const payload = await response.json() as { sets?: number };
      const confirmed = Math.max(minAllowedSets, Math.min(12, Number(payload.sets ?? desired)));
      setPlannedSetsByExercise((prev) => ({ ...prev, [exercise.id]: confirmed }));
    } catch {
      setPlannedSetsByExercise((prev) => {
        const next = { ...prev };
        if (previous == null) delete next[exercise.id];
        else next[exercise.id] = previous;
        return next;
      });
    }
  }

  function goToExercise(nextIdx: number) {
    unlockRestAudio();
    const clamped = Math.max(0, Math.min(exercises.length - 1, nextIdx));
    setExerciseIndex(clamped);
    setRestChoice(getPlannedRestForIndex(clamped));
    pushSyncState(clamped, 1, 0);
  }

  async function onSkipRest() {
    unlockRestAudio();
    skipRestRequestedRef.current = true;
    prevRestRemainingRef.current = 0;
    clearRestTimer();
    lastSyncedWatchPositionRef.current = `${exerciseIndex}:${Math.max(1, nextSetIndex)}:0`;
    try {
      const response = await fetch("/api/watch/skip-rest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      if (response.ok) {
        skipRestRequestedRef.current = false;
        clearRestTimer();
      }
    } catch {
      // Local skip remains useful even if the watch sync endpoint is unavailable.
    }
  }

  async function onAdjustRest(deltaSeconds: number) {
    if (restActionInFlightRef.current) return;
    restActionInFlightRef.current = true;
    setIsRestActionPending(true);
    unlockRestAudio();
    const currentRemaining = Math.max(0, restRemaining);
    const optimisticRemaining = Math.max(0, currentRemaining + deltaSeconds);
    if (optimisticRemaining > 0 && !restPaused) {
      startRestTimer(optimisticRemaining);
    } else if (optimisticRemaining > 0) {
      setRestRemaining(optimisticRemaining);
    } else {
      clearRestTimer();
      skipRestRequestedRef.current = true;
    }
    lastSyncedWatchPositionRef.current = `${exerciseIndex}:${Math.max(1, nextSetIndex)}:${optimisticRemaining}`;

    try {
      const response = await fetch("/api/watch/adjust-rest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId, deltaSeconds }),
      });
      if (!response.ok) throw new Error("adjust_rest_failed");

      const data = await response.json() as {
        payload?: { restRemaining?: number; restStatus?: "IDLE" | "ACTIVE" | "PAUSED"; exerciseIndex?: number; setIndex?: number };
      };
      const serverRemaining = Math.max(0, Number(data.payload?.restRemaining ?? optimisticRemaining));
      const serverRestStatus = data.payload?.restStatus === "PAUSED" ? "PAUSED" : serverRemaining > 0 ? "ACTIVE" : "IDLE";
      setRestPaused(serverRestStatus === "PAUSED");
      if (serverRemaining > 0 && serverRestStatus !== "PAUSED") {
        startRestTimer(serverRemaining);
      } else if (serverRemaining > 0) {
        setRestEndsAt(null);
        setRestRemaining(serverRemaining);
      } else {
        clearRestTimer();
      }
      lastSyncedWatchPositionRef.current = `${Math.max(1, Number(data.payload?.exerciseIndex ?? exerciseIndex + 1)) - 1}:${Math.max(1, Number(data.payload?.setIndex ?? nextSetIndex))}:${serverRemaining}`;
      skipRestRequestedRef.current = false;
    } catch {
      // Keep the local timer usable even if sync is temporarily unavailable.
    } finally {
      restActionInFlightRef.current = false;
      setIsRestActionPending(false);
    }
  }

  const applyRestPayload = useCallback((payload: { restRemaining?: number; restStatus?: "IDLE" | "ACTIVE" | "PAUSED" }) => {
    const remaining = Math.max(0, Number(payload.restRemaining ?? 0));
    const status = payload.restStatus === "PAUSED" ? "PAUSED" : remaining > 0 ? "ACTIVE" : "IDLE";
    setRestPaused(status === "PAUSED");
    if (remaining > 0 && status !== "PAUSED") {
      startRestTimer(remaining);
    } else if (remaining > 0) {
      setRestEndsAt(null);
      setRestRemaining(remaining);
    } else {
      clearRestTimer();
    }
  }, [clearRestTimer, startRestTimer]);

  const submitRestPauseAction = useCallback(async (action: { requestId: string; operation: "pause" | "resume" }) => {
    restActionInFlightRef.current = true;
    setIsRestActionPending(true);
    try {
      const response = await fetch(`/api/watch/${action.operation === "pause" ? "pause-rest" : "resume-rest"}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-traknio-action-id": action.requestId,
        },
        body: JSON.stringify({ sessionId }),
      });
      if (!response.ok) throw new Error("rest_pause_sync_failed");
      const data = await response.json() as { payload?: { restRemaining?: number; restStatus?: "IDLE" | "ACTIVE" | "PAUSED" } };
      applyRestPayload(data.payload ?? {});
      pendingRestActionRef.current = null;
      setRestSyncPending(false);
    } catch {
      // Keep the requested state visible and retry exactly the same idempotency key on reconnect.
      setRestSyncPending(true);
    } finally {
      restActionInFlightRef.current = false;
      setIsRestActionPending(false);
    }
  }, [applyRestPayload, sessionId]);

  function onToggleRestPause() {
    if (restActionInFlightRef.current || restRemaining <= 0) return;
    unlockRestAudio();
    const pending = pendingRestActionRef.current;
    const action = pending ?? {
      requestId: typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      operation: restPaused ? "resume" as const : "pause" as const,
    };
    pendingRestActionRef.current = action;
    setRestSyncPending(false);

    if (action.operation === "pause") {
      setRestPaused(true);
      setRestEndsAt(null);
    } else {
      setRestPaused(false);
      startRestTimer(restRemaining);
    }
    void submitRestPauseAction(action);
  }

  useEffect(() => {
    const retryPendingRestAction = () => {
      const pending = pendingRestActionRef.current;
      if (pending && !restActionInFlightRef.current) {
        void submitRestPauseAction(pending);
      }
    };
    window.addEventListener("online", retryPendingRestAction);
    return () => window.removeEventListener("online", retryPendingRestAction);
  }, [submitRestPauseAction]);

  async function openReplacementPanel() {
    unlockRestAudio();
    setReplacementOpen(true);
    setReplacementLoading(true);
    setReplacementError(null);
    setReplacementOptions([]);

    try {
      const response = await fetch(`/api/workout/replace-exercise?sessionId=${encodeURIComponent(sessionId)}&exerciseId=${encodeURIComponent(exercise.id)}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("alternatives_failed");
      const data = await response.json() as { alternatives?: ReplacementOption[] };
      setReplacementOptions(data.alternatives ?? []);
      if (!data.alternatives?.length) {
        setReplacementError("Aucune alternative de même gamme trouvée.");
      }
    } catch {
      setReplacementError("Impossible de charger les alternatives pour le moment.");
    } finally {
      setReplacementLoading(false);
    }
  }

  async function onReplaceExercise(option: ReplacementOption) {
    if (option.id === exercise.id || replacingExerciseId) return;
    setReplacingExerciseId(option.id);
    setReplacementError(null);

    try {
      const response = await fetch("/api/workout/replace-exercise", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId,
          programExerciseId: exercise.programExerciseId,
          currentExerciseId: exercise.id,
          targetExerciseId: option.id,
          currentExerciseIndex: exerciseIndex,
          currentSetIndex: Math.max(1, nextSetIndex),
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(payload.error || "replace_failed");
      }

      const data = await response.json() as { exercise?: ReplacementOption };
      const replacement = data.exercise ?? option;
      const previousExerciseId = exercise.id;
      const nextExercise: WorkoutExercise = {
        ...exercise,
        ...replacement,
        plannedSets: exercise.plannedSets,
        plannedRepsMin: exercise.plannedRepsMin,
        plannedRepsMax: exercise.plannedRepsMax,
        plannedWeightKg: exercise.plannedWeightKg,
        plannedRestSeconds: exercise.plannedRestSeconds,
        programExerciseId: exercise.programExerciseId,
        technicalCue: exercise.technicalCue,
      };

      setExercises((prev) => prev.map((item, idx) => (idx === exerciseIndex ? nextExercise : item)));
      setReplacementOriginByExercise((prev) => ({
        ...prev,
        [replacement.id]: prev[previousExerciseId] ?? previousExerciseId,
      }));
      lastSyncedWatchPositionRef.current = `${exerciseIndex}:${Math.max(1, nextSetIndex)}:${Math.max(0, restRemaining)}`;
      setReplacementOpen(false);
    } catch (error) {
      setReplacementError(error instanceof Error ? error.message : "Remplacement impossible.");
    } finally {
      setReplacingExerciseId(null);
    }
  }

  async function onCompleteWorkout(forceComplete = false) {
    unlockRestAudio();
    setEnding(true);
    setCompletionError(null);
    setCanRepairCompletion(false);
    const response = await fetch("/api/workout/complete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId, forceComplete }),
    });
    if (!response.ok) {
      if (response.status === 409) {
        const payload = await response.json() as {
          error?: string;
          missingSets?: Array<{ exerciseName?: string; missingSets?: number }>;
        };
        const topMissing = payload.missingSets?.slice(0, 3).map((item) => {
          const name = item.exerciseName ?? "Exercice";
          const missing = Math.max(1, Number(item.missingSets ?? 1));
          return `${name} (${missing})`;
        }) ?? [];
        setCompletionError(topMissing.length > 0
          ? `Séries manquantes: ${topMissing.join(", ")}${(payload.missingSets?.length ?? 0) > 3 ? "..." : ""}`
          : "Séries manquantes détectées. Termine les séries avant de valider.");
        setCanRepairCompletion(true);
      }
      setEnding(false);
      return;
    }

    const data = await response.json();
    if (data?.summary) {
      setCanRepairCompletion(false);
      setSummary(data.summary as WorkoutSummary);
      return;
    }

    router.refresh();
  }

  function formatDuration(seconds: number | null) {
    if (!seconds || seconds <= 0) return "0 min";
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest ? `${hours} h ${String(rest).padStart(2, "0")}` : `${hours} h`;
  }

  if (summary) {
    return (
      <section className="workout-finish-card stack">
        <p className="eyebrow">Séance terminée</p>
        <h1>Bon travail</h1>
        <p className="muted">Ta séance est enregistrée dans l&apos;historique.</p>
        <div className="chips workout-finish-card__chips">
          <span className="chip warning">Durée : {formatDuration(summary.durationSeconds)}</span>
          <span className="chip violet">Exercices: {summary.exercisesCount}</span>
          <span className="chip">Séries : {summary.setsCount}</span>
          <span className="chip success">Volume: {Math.round(summary.volumeTotal)} kg</span>
        </div>
        <PrimaryAction type="button" className="premium-glow" onClick={() => router.push("/history")}>Voir l&apos;historique</PrimaryAction>
        <button type="button" className="outline-link" onClick={() => router.push("/dashboard")}>Retour dashboard</button>
      </section>
    );
  }

  const isLastExercise = exerciseIndex >= exercises.length - 1;
  const isExerciseDone = completedForExercise.length >= setRows.length && setRows.length > 0;
  const isWorkoutDone = isLastExercise && isExerciseDone;
  const activeSet = setRows[Math.max(0, Math.min(nextSetIndex - 1, setRows.length - 1))];
  const activeKey = activeSet ? `${exercise.id}:${activeSet.setIndex}` : "";
  const activeReps = activeSet ? Math.max(1, repsByKey[activeKey] ?? activeSet.plannedReps) : 10;
  const weightFromCompleted = activeSet?.existing?.actualWeightKg ?? null;
  const activeWeight = activeSet ? Math.max(0, weightByKey[activeKey] ?? weightFromCompleted ?? exercise.plannedWeightKg ?? 0) : 0;
  const currentExercisePosition = Math.max(1, Math.min(exercises.length, exerciseIndex + 1));
  const totalExercises = Math.max(1, exercises.length);
  const currentSetPosition = Math.max(1, Math.min(setRows.length || 1, nextSetIndex));
  const currentSetTargetReps = activeSet?.plannedReps ?? (setRows[0]?.plannedReps ?? 10);
  const nextExercise = exercises[exerciseIndex + 1] ?? null;
  const elapsedLabel = elapsedSeconds > 0 ? `Depuis ${formatDuration(elapsedSeconds)}` : null;
  const restTotal = Math.max(restChoice, restRemaining);

  function updateLiveTarget(nextReps: number, nextWeight: number) {
    if (!activeSet) return;
    pushLiveTarget({
      exerciseId: exercise.id,
      programExerciseId: exercise.programExerciseId,
      setIndex: activeSet.setIndex,
      targetReps: nextReps,
      targetWeightKg: nextWeight,
      currentExerciseIndex: exerciseIndex,
    });
    lastSyncedWatchPositionRef.current = `${exerciseIndex}:${activeSet.setIndex}:${Math.max(0, restRemaining)}`;
  }

  function updateActiveReps(nextReps: number) {
    if (!activeSet) return;
    const normalized = Math.max(1, Math.floor(nextReps));
    setRepsByKey((prev) => ({ ...prev, [activeKey]: normalized }));
    updateLiveTarget(normalized, activeWeight);
  }

  function updateActiveWeight(nextWeight: number) {
    if (!activeSet) return;
    const normalized = Math.max(0, nextWeight);
    setWeightByKey((prev) => ({ ...prev, [activeKey]: normalized }));
    updateLiveTarget(activeReps, normalized);
  }

  function canTapToValidate() {
    return Boolean(activeSet) && !ending && restRemaining <= 0 && !isWorkoutDone;
  }

  function handleSurfaceTap(event: MouseEvent<HTMLElement>) {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (target.closest("button, a, input, select, textarea, label")) return;
    if (Date.now() < surfaceTapReadyAtRef.current) return;
    if (!canTapToValidate() || !activeSet) return;
    onValidateSet(activeSet.setIndex, activeSet.plannedReps);
  }

  function handleTouchStart(event: TouchEvent<HTMLElement>) {
    const touch = event.changedTouches[0];
    if (!touch) return;
    touchStartXRef.current = touch.clientX;
    touchStartYRef.current = touch.clientY;
  }

  function handleTouchEnd(event: TouchEvent<HTMLElement>) {
    const touch = event.changedTouches[0];
    if (!touch || touchStartXRef.current == null || touchStartYRef.current == null) return;
    const dx = touch.clientX - touchStartXRef.current;
    const dy = touch.clientY - touchStartYRef.current;
    touchStartXRef.current = null;
    touchStartYRef.current = null;

    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    if (absDx < 48 || absDx < absDy) return;

    if (dx > 0) {
      goToExercise(exerciseIndex + 1);
      return;
    }
    goToExercise(exerciseIndex - 1);
  }

  if (restRemaining > 0) {
    return (
      <section className="workout-session-stack">
        <WorkoutProgressHeader
          programName={programName}
          sessionTitle={sessionTitle}
          exercisePosition={currentExercisePosition}
          totalExercises={totalExercises}
          setPosition={currentSetPosition}
          totalSets={Math.max(1, setRows.length)}
          elapsedLabel={elapsedLabel}
        />
        <RestTimerCard
          remainingSeconds={restRemaining}
          totalSeconds={restTotal}
          context={`Exercice ${currentExercisePosition}/${totalExercises} · Série ${currentSetPosition}/${Math.max(1, setRows.length)}`}
          nextLabel={`Ensuite: ${exercise.nameFr || exercise.name} · cible ${currentSetTargetReps} reps`}
          onAdd15={() => void onAdjustRest(15)}
          onRemove15={() => void onAdjustRest(-15)}
          onTogglePause={onToggleRestPause}
          onSkip={onSkipRest}
          isPaused={restPaused}
          syncPending={restSyncPending}
          restActionPending={isRestActionPending}
        />
        <NextExerciseCard exercise={nextExercise} />
      </section>
    );
  }

  if (isWorkoutDone) {
    return (
      <section className="card workout-active-screen workout-complete-screen">
        <p className="eyebrow">Séance complète</p>
        <span className="chip success">Objectif atteint</span>
        <h1 className="workout-active-title">Terminer la séance</h1>
        <PrimaryAction type="button" className="workout-validate-main premium-glow" onClick={() => void onCompleteWorkout()} disabled={ending}>
          {ending ? "..." : "Valider"}
        </PrimaryAction>
        {completionError ? <p className="chip danger" style={{ margin: 0 }}>{completionError}</p> : null}
        {canRepairCompletion ? (
          <button type="button" className="outline-link" onClick={() => void onCompleteWorkout(true)} disabled={ending}>
            Compléter et terminer
          </button>
        ) : null}
      </section>
    );
  }

  return (
    <section
      className={`workout-session-stack ${justValidated ? "validated-flash" : ""}`}
      onClick={handleSurfaceTap}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <WorkoutProgressHeader
        programName={programName}
        sessionTitle={sessionTitle}
        exercisePosition={currentExercisePosition}
        totalExercises={totalExercises}
        setPosition={Math.min(nextSetIndex, setRows.length)}
        totalSets={Math.max(1, setRows.length)}
        elapsedLabel={elapsedLabel}
      />
      <CurrentExerciseCard
        exercise={exercise}
        setLabel={`Série ${Math.min(nextSetIndex, setRows.length)}/${setRows.length}`}
        targetRepsLabel={`Cible ${currentSetTargetReps} reps`}
        plannedWeightLabel={exercise.plannedWeightKg != null ? `Prévu ${exercise.plannedWeightKg} kg` : "Charge libre"}
        previousWeightLabel={weightFromCompleted != null ? `Dernière ${weightFromCompleted} kg` : null}
        cue={exercise.technicalCue || (Math.min(nextSetIndex, setRows.length) === setRows.length ? "Dernière série, propre et contrôlée." : null)}
      >
        <div className="workout-sets-adjust">
          <button type="button" className="ghost-btn" aria-label="Retirer une série" onClick={() => void onAdjustSets(-1)}>-</button>
          <strong>{Math.max(1, setRows.length)} séries</strong>
          <button type="button" className="ghost-btn" aria-label="Ajouter une série" onClick={() => void onAdjustSets(1)}>+</button>
        </div>
        <div className="workout-input-grid">
          <div className="workout-active-reps">
            <label htmlFor="workout-reps-input">Répétitions</label>
            <div className="workout-reps-control">
              <button
                type="button"
                className="ghost-btn"
                onClick={() => updateActiveReps(activeReps - 1)}
              >
                -
              </button>
              <input
                id="workout-reps-input"
                className="workout-input-xl"
                inputMode="numeric"
                type="number"
                min={1}
                value={activeReps}
                onChange={(event) => updateActiveReps(Number(event.target.value) || 1)}
                aria-label="Répétitions réalisées"
              />
              <button
                type="button"
                className="ghost-btn"
                onClick={() => updateActiveReps(activeReps + 1)}
              >
                +
              </button>
            </div>
          </div>
          <div className="workout-active-reps">
            <label htmlFor="workout-weight-input">Charge kg</label>
            <div className="workout-reps-control">
              <button
                type="button"
                className="ghost-btn"
                onClick={() => updateActiveWeight(activeWeight - 1)}
              >
                -
              </button>
              <input
                id="workout-weight-input"
                className="workout-input-xl"
                inputMode="decimal"
                type="number"
                min={0}
                step={0.5}
                value={activeWeight}
                onChange={(event) => updateActiveWeight(Number(event.target.value) || 0)}
                aria-label="Charge utilisée en kilogrammes"
              />
              <button
                type="button"
                className="ghost-btn"
                onClick={() => updateActiveWeight(activeWeight + 1)}
              >
                +
              </button>
            </div>
          </div>
        </div>
        <PrimaryAction
          type="button"
          className="workout-validate-main premium-glow"
          onClick={() => activeSet && onValidateSet(activeSet.setIndex, activeSet.plannedReps)}
          disabled={!activeSet || isSetValidationPending}
        >
          Série terminée
        </PrimaryAction>
      </CurrentExerciseCard>
      <NextExerciseCard exercise={nextExercise} />
      <section className="workout-secondary-actions">
        <button type="button" className="outline-link" onClick={() => activeSet && onValidateSet(activeSet.setIndex, activeSet.plannedReps)} disabled={!activeSet || isSetValidationPending}>
          Modifier / revalider
        </button>
        <button type="button" className="outline-link" onClick={() => activeSet && onValidateSet(activeSet.setIndex, activeSet.plannedReps)} disabled={!activeSet || isSetValidationPending}>
          Passer la série
        </button>
        <button type="button" className="outline-link" onClick={() => void openReplacementPanel()}>
          Remplacer
        </button>
        <button type="button" className="outline-link" onClick={() => void onCompleteWorkout()} disabled={ending}>
          {ending ? "..." : "Arrêter la séance"}
        </button>
        {completionError ? <p className="chip danger" style={{ margin: 0 }}>{completionError}</p> : null}
        {canRepairCompletion ? (
          <button type="button" className="outline-link" onClick={() => void onCompleteWorkout(true)} disabled={ending}>
            Compléter et terminer
          </button>
        ) : null}
      </section>
      {replacementOpen ? (
        <section className="workout-replace-backdrop" role="dialog" aria-modal="true" aria-label="Remplacer cet exercice" onClick={(event) => event.stopPropagation()}>
          <div className="workout-replace-sheet">
            <div className="workout-replace-head">
              <div>
                <p className="eyebrow">Même gamme</p>
                <h2>Remplacer discrètement</h2>
                <p className="muted">{exercise.nameFr || exercise.name} · {exercise.categoryFr || exercise.primaryMusclesFr[0] || exercise.primaryMuscles[0] || "Même groupe"}</p>
              </div>
              <button type="button" className="ghost-btn workout-replace-close" onClick={() => setReplacementOpen(false)}>Fermer</button>
            </div>
            {replacementLoading ? <p className="chip">Recherche des meilleures alternatives...</p> : null}
            {replacementError ? <p className="chip danger">{replacementError}</p> : null}
            <div className="workout-replace-list">
              {replacementOptions.map((option) => {
                const title = option.nameFr || option.name;
                const muscle = option.primaryMusclesFr[0] || option.primaryMuscles[0] || option.categoryFr || "Même gamme";
                const equipment = option.equipmentFr[0] || option.equipment[0] || "Matériel libre";
                return (
                  <button
                    key={option.id}
                    type="button"
                    className="workout-replace-option"
                    onClick={() => void onReplaceExercise(option)}
                    disabled={replacingExerciseId != null}
                  >
                    <span>
                      <strong>{title}</strong>
                      <small>{muscle} · {equipment}</small>
                    </span>
                    <b>{replacingExerciseId === option.id ? "..." : "Choisir"}</b>
                  </button>
                );
              })}
            </div>
            <p className="muted workout-replace-note">Les séries déjà faites restent dans l&apos;historique sur l&apos;ancien exercice. Les prochaines compteront sur le remplaçant.</p>
          </div>
        </section>
      ) : null}
    </section>
  );
}
