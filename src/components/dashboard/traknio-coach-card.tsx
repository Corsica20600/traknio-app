"use client";

import { useCallback, useEffect, useState } from "react";
import { GlassCard } from "@/src/components/ui/glass-card";
import { LoadingSkeleton } from "@/src/components/ui/loading-skeleton";
import { PrimaryButton } from "@/src/components/ui/primary-button";
import { StatBadge } from "@/src/components/ui/stat-badge";

type CoachFeedback = "USEFUL" | "NOT_USEFUL";
type CoachStatus = "PENDING" | "COMPLETED" | "FAILED";

type CoachResponse = {
  summary: string;
  positives: string[];
  watchouts: string[];
  recommendations: Array<{ title: string; rationale: string; dataUsed: string[] }>;
  confidence: "LOW" | "MEDIUM" | "HIGH";
};

type CoachReport = {
  id: string;
  status: CoachStatus;
  response: CoachResponse | null;
  feedback: CoachFeedback | null;
  nextAvailableAt: string;
};

type CoachPeriod = {
  key: string;
  nextAvailableAt: string;
};

type CoachApiResponse = {
  report?: CoachReport | null;
  period?: CoachPeriod;
  error?: string;
};

type CardState = "loading" | "empty" | "pending" | "failed" | "completed" | "unavailable" | "error";

const confidenceLabels = {
  LOW: "Confiance limitée",
  MEDIUM: "Confiance modérée",
  HIGH: "Confiance élevée",
} as const;

function formatDate(value: string | undefined) {
  if (!value) return "la prochaine période";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "la prochaine période";
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" }).format(date);
}

function formatDataKey(key: string) {
  const labels: Record<string, string> = {
    "sessions.completed": "séances réalisées",
    "sessions.planned": "séances prévues",
    "sessions.skipped": "séances annulées",
    "sessions.missed": "séances manquées",
    "totals.volumeKg": "volume total",
    "totals.repetitions": "répétitions réalisées",
    "totals.completedSets": "séries réalisées",
    "totals.durationSeconds": "durée des séances",
    "recovery.sleepMinutes": "sommeil",
    "recovery.restingHeartRate": "fréquence cardiaque au repos",
    "recovery.calories": "calories",
    "limitations.declared": "limitations déclarées",
  };
  if (labels[key]) return labels[key];
  if (key.startsWith("exercise.")) return "évolution d'un exercice";
  return "données de la période";
}

function getState(report: CoachReport | null, error: string | null): CardState {
  if (error === "coach_unavailable" || error === "premium_required") return "unavailable";
  if (error) return "error";
  if (!report) return "empty";
  if (report.status === "PENDING") return "pending";
  if (report.status === "FAILED") return "failed";
  return "completed";
}

export function TraknioCoachCard() {
  const [report, setReport] = useState<CoachReport | null>(null);
  const [period, setPeriod] = useState<CoachPeriod | null>(null);
  const [state, setState] = useState<CardState>("loading");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSavingFeedback, setIsSavingFeedback] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  const loadReport = useCallback(async () => {
    setState("loading");
    try {
      const response = await fetch("/api/coach/weekly", { cache: "no-store" });
      const payload = await response.json().catch(() => ({})) as CoachApiResponse;
      if (!response.ok) {
        setState(getState(null, payload.error ?? "request_failed"));
        return;
      }
      const nextReport = payload.report ?? null;
      setReport(nextReport);
      setPeriod(payload.period ?? null);
      setState(getState(nextReport, null));
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      void loadReport();
    }, 0);
    return () => window.clearTimeout(loadTimer);
  }, [loadReport]);

  async function generateReport() {
    if (isGenerating || state === "pending" || state === "completed") return;
    setIsGenerating(true);
    setFeedbackError(null);
    try {
      const response = await fetch("/api/coach/weekly", { method: "POST" });
      const payload = await response.json().catch(() => ({})) as CoachApiResponse;
      if (!response.ok && !payload.report) {
        setState(getState(null, payload.error ?? "generation_failed"));
        return;
      }
      const nextReport = payload.report ?? null;
      setReport(nextReport);
      setState(getState(nextReport, null));
    } catch {
      setState("failed");
    } finally {
      setIsGenerating(false);
    }
  }

  async function saveFeedback(feedback: CoachFeedback) {
    if (!report || isSavingFeedback) return;
    setIsSavingFeedback(true);
    setFeedbackError(null);
    try {
      const response = await fetch("/api/coach/weekly", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId: report.id, feedback }),
      });
      const payload = await response.json().catch(() => ({})) as CoachApiResponse;
      if (!response.ok || !payload.report) {
        setFeedbackError("Ton retour n'a pas pu être enregistré. Réessaie plus tard.");
        return;
      }
      setReport(payload.report);
    } catch {
      setFeedbackError("Ton retour n'a pas pu être enregistré. Réessaie plus tard.");
    } finally {
      setIsSavingFeedback(false);
    }
  }

  const nextAvailableAt = report?.nextAvailableAt ?? period?.nextAvailableAt;

  return (
    <GlassCard className="grid gap-4 p-4 sm:p-5" aria-labelledby="traknio-coach-title">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="m-0 text-[0.68rem] font-black uppercase tracking-[0.18em] text-[var(--fit-accent-cyan)]">
            Traknio Coach
          </p>
          <h2 id="traknio-coach-title" className="m-0 mt-1 text-xl font-black tracking-[-0.04em] text-[var(--fit-text)]">
            Ton bilan hebdomadaire
          </h2>
        </div>
        {state === "completed" && report?.response ? (
          <StatBadge tone={report.response.confidence === "HIGH" ? "success" : report.response.confidence === "LOW" ? "warning" : "accent"}>
            {confidenceLabels[report.response.confidence]}
          </StatBadge>
        ) : null}
      </div>

      {state === "loading" ? <LoadingSkeleton lines={4} aria-label="Chargement du bilan Traknio Coach" /> : null}

      {state === "empty" ? (
        <div className="grid gap-3">
          <p className="m-0 text-sm font-semibold leading-relaxed text-[var(--fit-text-muted)]">
            Reçois une lecture claire de tes quatre dernières semaines d&apos;entraînement, basée sur tes séances et ta récupération disponible.
          </p>
          <PrimaryButton type="button" onClick={generateReport} disabled={isGenerating}>
            {isGenerating ? "Génération du bilan..." : "Générer mon bilan"}
          </PrimaryButton>
        </div>
      ) : null}

      {state === "pending" ? (
        <div className="grid gap-2">
          <StatBadge tone="accent">Bilan en cours</StatBadge>
          <p className="m-0 text-sm font-semibold leading-relaxed text-[var(--fit-text-muted)]">
            Ton bilan est en cours de préparation. Il sera disponible ici dès qu&apos;il sera finalisé.
          </p>
        </div>
      ) : null}

      {state === "failed" ? (
        <div className="grid gap-3">
          <StatBadge tone="warning">Génération à relancer</StatBadge>
          <p className="m-0 text-sm font-semibold leading-relaxed text-[var(--fit-text-muted)]">
            Le bilan n&apos;a pas pu être généré. Réessaie dans quelques instants.
          </p>
          <PrimaryButton type="button" onClick={generateReport} disabled={isGenerating}>
            {isGenerating ? "Nouvelle tentative..." : "Réessayer la génération"}
          </PrimaryButton>
        </div>
      ) : null}

      {state === "unavailable" ? (
        <p className="m-0 text-sm font-semibold leading-relaxed text-[var(--fit-text-muted)]">
          Traknio Coach n&apos;est pas disponible pour ce compte pour le moment.
        </p>
      ) : null}

      {state === "error" ? (
        <div className="grid gap-3">
          <p className="m-0 text-sm font-semibold leading-relaxed text-[var(--fit-text-muted)]">
            Impossible de charger ton bilan pour le moment.
          </p>
          <button type="button" className="ghost-btn justify-self-start" onClick={() => void loadReport()}>
            Réessayer
          </button>
        </div>
      ) : null}

      {state === "completed" && report?.response ? (
        <div className="grid gap-4">
          <p className="m-0 text-sm font-semibold leading-relaxed text-[var(--fit-text-muted)]">{report.response.summary}</p>

          {report.response.positives.length > 0 ? (
            <section className="grid gap-2" aria-label="Points positifs">
              <h3 className="m-0 text-sm font-black text-[var(--fit-text)]">Points positifs</h3>
              <ul className="m-0 grid gap-1.5 pl-5 text-sm font-semibold leading-relaxed text-[var(--fit-text-muted)]">
                {report.response.positives.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </section>
          ) : null}

          {report.response.watchouts.length > 0 ? (
            <section className="grid gap-2" aria-label="Points de vigilance">
              <h3 className="m-0 text-sm font-black text-[var(--fit-text)]">Points de vigilance</h3>
              <ul className="m-0 grid gap-1.5 pl-5 text-sm font-semibold leading-relaxed text-[var(--fit-text-muted)]">
                {report.response.watchouts.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </section>
          ) : null}

          {report.response.recommendations.length > 0 ? (
            <section className="grid gap-2" aria-label="Recommandations">
              <h3 className="m-0 text-sm font-black text-[var(--fit-text)]">À retenir</h3>
              <div className="grid gap-2">
                {report.response.recommendations.slice(0, 3).map((recommendation) => (
                  <div key={`${recommendation.title}-${recommendation.rationale}`} className="rounded-2xl border border-[var(--fit-border)] bg-[rgba(6,17,39,.54)] p-3">
                    <p className="m-0 text-sm font-black text-[var(--fit-text)]">{recommendation.title}</p>
                    <p className="m-0 mt-1 text-sm font-semibold leading-relaxed text-[var(--fit-text-muted)]">{recommendation.rationale}</p>
                    <p className="m-0 mt-2 text-xs font-semibold text-[var(--fit-text-muted)]">
                      Basé sur : {recommendation.dataUsed.map(formatDataKey).filter((value, index, values) => values.indexOf(value) === index).join(", ")}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <div className="grid gap-2 border-t border-[var(--fit-border)] pt-3">
            <p className="m-0 text-xs font-bold text-[var(--fit-text-muted)]">
              Prochain bilan disponible le {formatDate(nextAvailableAt)}.
            </p>
            <div className="flex flex-wrap gap-2" aria-label="Donner un avis sur le bilan">
              <button type="button" className="ghost-btn" disabled={isSavingFeedback} onClick={() => void saveFeedback("USEFUL")}>
                {report.feedback === "USEFUL" ? "Utile" : "Utile ?"}
              </button>
              <button type="button" className="ghost-btn" disabled={isSavingFeedback} onClick={() => void saveFeedback("NOT_USEFUL")}>
                {report.feedback === "NOT_USEFUL" ? "Pas utile" : "Pas utile ?"}
              </button>
            </div>
            {feedbackError ? <p className="m-0 text-xs font-semibold text-[var(--fit-danger)]">{feedbackError}</p> : null}
          </div>
        </div>
      ) : null}

      {state !== "completed" && nextAvailableAt ? (
        <p className="m-0 text-xs font-bold text-[var(--fit-text-muted)]">
          Prochain bilan disponible le {formatDate(nextAvailableAt)}.
        </p>
      ) : null}
    </GlassCard>
  );
}
