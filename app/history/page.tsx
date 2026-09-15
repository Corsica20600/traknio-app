import Link from "next/link";
import { connection } from "next/server";
import { SessionCard } from "@/src/components/history/session-card";
import { EmptyState } from "@/src/components/ui/empty-state";
import { GlassCard } from "@/src/components/ui/glass-card";
import { PageHeader } from "@/src/components/ui/page-header";
import { PrimaryButton } from "@/src/components/ui/primary-button";
import { SectionTitle } from "@/src/components/ui/section-title";
import { privatePageMetadata } from "@/src/lib/private-page-metadata";
import { resolveExerciseMedia } from "@/src/lib/exercise-media-resolver";
import { getWorkoutHistorySummaryForDemoUser } from "@/src/server/fitness-queries";

export const metadata = privatePageMetadata(
  "Historique",
  "Historique privé Traknio des séances terminées, volumes et séries enregistrées.",
);

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/Paris",
  }).format(date);
}

function formatGroupDate(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Paris",
  }).format(date);
}

function formatDuration(seconds: number | null) {
  if (!seconds || seconds <= 0) return "0 min";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${String(rest).padStart(2, "0")}` : `${hours} h`;
}

function formatKg(value: number) {
  return `${Math.round(value).toLocaleString("fr-FR")} kg`;
}

export default async function HistoryPage() {
  await connection();
  const { sessions, stats } = await getWorkoutHistorySummaryForDemoUser();
  const grouped = new Map<string, typeof sessions>();
  for (const session of sessions) {
    const date = session.startedAt ?? session.createdAt;
    const key = date.toISOString().slice(0, 10);
    grouped.set(key, [...(grouped.get(key) ?? []), session]);
  }

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Historique"
        title="Séances"
        description={`${sessions.length} ${sessions.length > 1 ? "séances enregistrées" : "séance enregistrée"} avec volume, durée et groupes travaillés.`}
      />

      <GlassCard>
        <SectionTitle eyebrow="Cette semaine" title="Résumé rapide" />
        <div className="chips">
          <span className="chip success">Volume: {formatKg(stats.weeklyVolume)}</span>
          <span className="chip">Séances: {stats.weeklySessionsCount}</span>
          <span className="chip warning">
            Meilleure: {stats.bestRecentSession ? formatKg(stats.bestRecentSession.totalVolume) : "N/A"}
          </span>
        </div>
      </GlassCard>

      {sessions.length > 0 ? (
        <GlassCard>
          <Link href="/workout">
            <PrimaryButton className="premium-glow">Démarrer une nouvelle séance</PrimaryButton>
          </Link>
        </GlassCard>
      ) : null}

      {sessions.length === 0 ? (
        <EmptyState
          title="Aucune séance enregistrée"
          description="Termine une séance guidée pour voir ton historique se construire ici."
          action={<Link href="/workout" className="primary-button">Démarrer une séance</Link>}
        />
      ) : (
        <section className="history-group-list">
          {[...grouped.entries()].map(([key, items]) => {
            const groupDate = items[0]?.startedAt ?? items[0]?.createdAt ?? new Date(key);
            return (
              <section key={key} className="history-day-group">
                <SectionTitle eyebrow="Journal" title={formatGroupDate(groupDate)} />
                <div className="history-session-list">
                  {items.map((session) => {
                    const coverExercise = session.sets[0]?.exercise;
                    const cover = coverExercise ? resolveExerciseMedia(coverExercise, "HISTORY").image : null;
                    const isBest = stats.bestRecentSession?.id === session.id;
                    return (
                      <SessionCard
                        key={session.id}
                        href={`/history/${session.id}`}
                        title={session.title}
                        dateLabel={formatDate(session.startedAt ?? session.createdAt)}
                        statusLabel={session.status === "COMPLETED" ? "Terminée" : "Brouillon"}
                        durationLabel={formatDuration(session.durationSeconds)}
                        volumeLabel={formatKg(session.totalVolume)}
                        exerciseCount={session.exerciseCount}
                        setsCount={session.setsCount}
                        muscles={session.primaryMuscles}
                        image={cover}
                        recordLabel={isBest ? "Meilleure séance récente" : null}
                      />
                    );
                  })}
                </div>
              </section>
            );
          })}
        </section>
      )}
    </div>
  );
}
