"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  createRestDeadlineFromServer,
  formatWatchRest,
  getRemainingFromDeadline,
  shouldReplaceRestDeadline,
  type WatchRestDeadline,
} from "@/src/lib/watch-timer";
import { BRAND } from "@/src/lib/brand";

type WatchState = {
  sessionId: string;
  exerciseName: string;
  exerciseIndex: number;
  totalExercises: number;
  setIndex: number;
  totalSets: number;
  targetReps: number;
  weight: number | null;
  restRemaining: number;
  status: string;
};

type ApiResponse = {
  payload?: WatchState;
  error?: string;
};

type SyncState = "boot" | "ok" | "syncing" | "offline" | "error";

function shortExerciseName(name: string) {
  return name
    .replace(/\s*-\s*/g, " ")
    .replace(/\([^)]*\)/g, "")
    .trim();
}

function useHaptics() {
  const vibrate = useCallback((pattern: number | number[]) => {
    if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
    navigator.vibrate(pattern);
  }, []);

  return useMemo(() => ({
    restStart: () => vibrate(35),
    restWarning: () => vibrate([25, 55, 25]),
    restEnd: () => vibrate(90),
    action: () => vibrate(25),
    error: () => vibrate([30, 45, 30]),
  }), [vibrate]);
}

export default function WatchPage() {
  const [state, setState] = useState<WatchState | null>(null);
  const [displayRestRemaining, setDisplayRestRemaining] = useState(0);
  const [syncState, setSyncState] = useState<SyncState>("boot");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [finishConfirm, setFinishConfirm] = useState(false);
  const [lastSuccessAt, setLastSuccessAt] = useState<Date | null>(null);
  const sequenceRef = useRef(0);
  const stateKeyRef = useRef<string | null>(null);
  const restDeadlineRef = useRef<WatchRestDeadline | null>(null);
  const warnedAtThreeRef = useRef(false);
  const wasRestingRef = useRef(false);
  const haptics = useHaptics();

  const setDeadline = useCallback((next: WatchRestDeadline | null) => {
    restDeadlineRef.current = next;
  }, []);

  const applyPayload = useCallback((payload: WatchState, receivedAtEpochMs = Date.now(), receivedAtPerfMs = performance.now()) => {
    const nextKey = `${payload.sessionId}:${payload.exerciseIndex}:${payload.setIndex}`;
    const contextChanged = stateKeyRef.current !== nextKey;
    stateKeyRef.current = nextKey;
    setState(payload);
    setError(null);
    setSyncState("ok");
    setLastSuccessAt(new Date(receivedAtEpochMs));

    const nextDeadline = createRestDeadlineFromServer({
      restRemaining: payload.restRemaining ?? 0,
      receivedAtEpochMs,
      receivedAtPerfMs,
    });

    if (shouldReplaceRestDeadline({
      current: restDeadlineRef.current,
      next: nextDeadline,
      perfNowMs: receivedAtPerfMs,
      contextChanged,
    })) {
      setDeadline(nextDeadline);
      setDisplayRestRemaining(nextDeadline ? getRemainingFromDeadline(nextDeadline, receivedAtPerfMs) : 0);
      warnedAtThreeRef.current = false;
    }
  }, [setDeadline]);

  const refreshState = useCallback(async (silent = false) => {
    const sequence = sequenceRef.current + 1;
    sequenceRef.current = sequence;
    if (!silent) setSyncState((current) => current === "boot" ? "boot" : "syncing");

    try {
      const response = await fetch("/api/watch/current-session", { cache: "no-store" });
      const receivedAtEpochMs = Date.now();
      const receivedAtPerfMs = performance.now();
      const data = (await response.json()) as ApiResponse;
      if (sequence < sequenceRef.current) return;

      if (!response.ok || !data.payload) {
        setState(null);
        stateKeyRef.current = null;
        setDeadline(null);
        setDisplayRestRemaining(0);
        setError(data.error ?? "Aucune séance active.");
        setSyncState(response.status === 404 ? "ok" : "error");
        return;
      }

      applyPayload(data.payload, receivedAtEpochMs, receivedAtPerfMs);
    } catch {
      if (sequence < sequenceRef.current) return;
      setError("Réseau indisponible.");
      setSyncState("offline");
    }
  }, [applyPayload, setDeadline]);

  useEffect(() => {
    const bootId = window.setTimeout(() => void refreshState(), 0);
    const intervalMs = state?.status === "IN_PROGRESS" ? 15_000 : 60_000;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshState(true);
    }, intervalMs);
    return () => {
      window.clearTimeout(bootId);
      window.clearInterval(id);
    };
  }, [refreshState, state?.status]);

  useEffect(() => {
    const refreshDisplay = () => {
      const remaining = getRemainingFromDeadline(restDeadlineRef.current, performance.now());
      setDisplayRestRemaining(remaining);

      if (remaining > 0 && !wasRestingRef.current) {
        wasRestingRef.current = true;
        warnedAtThreeRef.current = false;
        haptics.restStart();
      }
      if (remaining <= 3 && remaining > 0 && !warnedAtThreeRef.current) {
        warnedAtThreeRef.current = true;
        haptics.restWarning();
      }
      if (remaining <= 0 && wasRestingRef.current) {
        wasRestingRef.current = false;
        setDeadline(null);
        haptics.restEnd();
      }
    };

    refreshDisplay();
    const id = window.setInterval(refreshDisplay, 250);
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        refreshDisplay();
        void refreshState(true);
      }
    };
    window.addEventListener("focus", onVisibility);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onVisibility);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [haptics, refreshState, setDeadline]);

  const perform = useCallback(async (path: string, actionId: string, body?: Record<string, unknown>) => {
    if (!state || busyAction) return;
    setBusyAction(actionId);
    setFinishConfirm(false);
    setSyncState("syncing");
    haptics.action();

    if (actionId === "skip-rest") {
      setDeadline(null);
      setDisplayRestRemaining(0);
    }
    if (actionId === "add-rest") {
      const nowEpoch = Date.now();
      const nowPerf = performance.now();
      const currentRemaining = getRemainingFromDeadline(restDeadlineRef.current, nowPerf);
      const optimistic = createRestDeadlineFromServer({
        restRemaining: currentRemaining + 15,
        receivedAtEpochMs: nowEpoch,
        receivedAtPerfMs: nowPerf,
      });
      setDeadline(optimistic);
      setDisplayRestRemaining(currentRemaining + 15);
    }

    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: state.sessionId, ...body }),
      });
      const data = (await response.json()) as ApiResponse;

      if (!response.ok || !data.payload) {
        setError(data.error ?? "Action refusée.");
        setSyncState("error");
        haptics.error();
        void refreshState(true);
        return;
      }

      applyPayload(data.payload);
    } catch {
      setError("Erreur réseau.");
      setSyncState("offline");
      haptics.error();
      void refreshState(true);
    } finally {
      setBusyAction(null);
    }
  }, [applyPayload, busyAction, haptics, refreshState, setDeadline, state]);

  const isResting = displayRestRemaining > 0;
  const isCompleted = state?.status === "COMPLETED";
  const exerciseName = state ? shortExerciseName(state.exerciseName) : BRAND.name;
  const progressPercent = state
    ? Math.max(0, Math.min(100, (((state.exerciseIndex - 1) + (state.setIndex / Math.max(1, state.totalSets))) / Math.max(1, state.totalExercises)) * 100))
    : 0;
  const restProgress = state && isResting
    ? Math.max(5, Math.min(100, (displayRestRemaining / Math.max(1, state.restRemaining || displayRestRemaining)) * 100))
    : progressPercent;
  const ringStyle = {
    "--watch-progress": `${isResting ? restProgress : progressPercent}%`,
  } as CSSProperties;
  const syncLabel = useMemo(() => {
    if (syncState === "boot") return "Connexion";
    if (syncState === "syncing") return "Sync...";
    if (syncState === "offline") return "Hors ligne";
    if (syncState === "error") return "À vérifier";
    return lastSuccessAt ? "Sync OK" : "Prêt";
  }, [lastSuccessAt, syncState]);

  return (
    <main className={`watch-page-v2 ${isResting ? "is-resting" : ""}`} data-watch-route="true">
      <section className="watch-round-shell" style={ringStyle} aria-live="polite">
        <div className="watch-time-text">
          <Image src="/brand/traknio-watch-mark-exact.png" alt="" width={91} height={52} priority />
        </div>
        <span className={`watch-sync-dot watch-sync-dot--${syncState}`}>{syncLabel}</span>

        {!state ? (
          <div className="watch-empty-state">
            <span className="watch-empty-state__orb" aria-hidden="true" />
            <h1>Aucune séance</h1>
            <p>Démarre une séance sur le téléphone, la montre se synchronise automatiquement.</p>
            <button type="button" className="watch-secondary-action" disabled={busyAction != null} onClick={() => void refreshState()}>
              Actualiser
            </button>
            {error ? <span className="watch-inline-error">{error}</span> : null}
          </div>
        ) : isCompleted ? (
          <div className="watch-empty-state watch-empty-state--done">
            <span className="watch-empty-state__orb" aria-hidden="true" />
            <h1>Séance terminée</h1>
            <p>Synchronisation effectuée. Tu peux retrouver le détail dans l’historique {BRAND.name}.</p>
            <button type="button" className="watch-secondary-action" disabled={busyAction != null} onClick={() => void refreshState()}>
              Actualiser
            </button>
          </div>
        ) : isResting ? (
          <div className="watch-rest-layout">
            <span className="watch-kicker">Repos</span>
            <strong className="watch-rest-time">{formatWatchRest(displayRestRemaining)}</strong>
            <p>{state.setIndex}/{state.totalSets} · Prochaine série</p>
            <div className="watch-rest-actions">
              <button type="button" disabled={busyAction != null} onClick={() => void perform("/api/watch/adjust-rest", "add-rest", { deltaSeconds: 15 })}>
                +15 s
              </button>
              <button type="button" disabled={busyAction != null} onClick={() => void perform("/api/watch/skip-rest", "skip-rest")}>
                Passer
              </button>
            </div>
          </div>
        ) : (
          <div className="watch-active-layout">
            <h1 title={state.exerciseName}>{exerciseName}</h1>
            <div className="watch-primary-metric">
              <span>Série</span>
              <strong>{state.setIndex}/{state.totalSets}</strong>
            </div>
            <div className="watch-target-row">
              <span><b>{state.targetReps}</b> reps</span>
              <span><b>{state.weight == null ? "-" : state.weight}</b>{state.weight == null ? "" : " kg"}</span>
            </div>
            <button
              type="button"
              className="watch-validate-action"
              disabled={busyAction != null}
              onClick={() => void perform("/api/watch/validate-set", "validate", {
                actualReps: state.targetReps,
                weight: state.weight,
              })}
            >
              {busyAction === "validate" ? "..." : "Valider"}
            </button>
          </div>
        )}

        {state && !isCompleted ? (
          <div className="watch-nav-actions" aria-label="Navigation séance">
            <button type="button" disabled={busyAction != null} onClick={() => void perform("/api/watch/previous-exercise", "previous")}>Préc.</button>
            <button type="button" disabled={busyAction != null} onClick={() => void perform("/api/watch/next-exercise", "next")}>Suiv.</button>
            <button
              type="button"
              className="watch-danger-action"
              disabled={busyAction != null}
              onClick={() => {
                if (!finishConfirm) {
                  setFinishConfirm(true);
                  haptics.action();
                  return;
                }
                void perform("/api/watch/complete-session", "finish");
              }}
            >
              {finishConfirm ? "Confirmer" : "Fin"}
            </button>
          </div>
        ) : null}

        {error && state ? <span className="watch-inline-error">{error}</span> : null}
      </section>
    </main>
  );
}
