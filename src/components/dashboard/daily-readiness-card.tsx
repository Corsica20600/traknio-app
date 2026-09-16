import Link from "next/link";
import { GlassCard } from "@/src/components/ui/glass-card";
import { StatBadge } from "@/src/components/ui/stat-badge";

type DailyReadinessCardProps = {
  readiness: {
    connected: boolean;
    prepared: boolean;
    providerLabel: string;
    score: number | null;
    tone: "accent" | "success" | "orange" | "danger";
    sleepLabel: string | null;
    averageHeartRate: number | null;
    caloriesToday: number | null;
    recommendation: string;
  };
};

function formatNumber(value: number | null) {
  return value == null ? "-" : value.toLocaleString("fr-FR");
}

function toneLabel(tone: DailyReadinessCardProps["readiness"]["tone"]) {
  if (tone === "success") return "Excellent";
  if (tone === "accent") return "Correct";
  if (tone === "orange") return "Fatigue";
  return "Repos";
}

export function DailyReadinessCard({ readiness }: DailyReadinessCardProps) {
  if (!readiness.prepared) {
    return (
      <GlassCard className="daily-readiness-card daily-readiness-card--empty">
        <div>
          <p className="eyebrow">État du jour</p>
          <h2>Synchronise ta montre</h2>
          <p className="muted">
            Connecte Health Connect ou Samsung Health pour afficher ton sommeil, ta récupération et tes statistiques quotidiennes.
          </p>
        </div>
        <Link href="/settings" prefetch={false} className="outline-link">Connecter</Link>
      </GlassCard>
    );
  }

  if (!readiness.connected) {
    return (
      <GlassCard className="daily-readiness-card daily-readiness-card--accent">
        <div className="daily-readiness-card__head">
          <div>
            <p className="eyebrow">État du jour</p>
            <h2>{readiness.providerLabel}</h2>
          </div>
          <div className="daily-readiness-card__score daily-readiness-card__score--pending">
            <strong>-</strong>
            <span>%</span>
          </div>
        </div>

        <div className="daily-readiness-card__bar" aria-hidden="true">
          <i style={{ width: "12%" }} />
        </div>

        <div className="daily-readiness-card__metrics">
          <span><b>{readiness.sleepLabel ?? "-"}</b>Sommeil</span>
          <span><b>{readiness.averageHeartRate ? `${readiness.averageHeartRate} bpm` : "-"}</b>FC moyenne</span>
          <span><b>{readiness.caloriesToday ? `${formatNumber(readiness.caloriesToday)} kcal` : "-"}</b>Calories</span>
        </div>

        <p className="muted">La FC moyenne ne mesure pas la FC au repos et ne participe pas au score.</p>
      <div className="daily-readiness-card__footer">
          <StatBadge tone="accent">Prêt</StatBadge>
          <p>{readiness.recommendation}</p>
        </div>
      </GlassCard>
    );
  }

  return (
    <GlassCard className={`daily-readiness-card daily-readiness-card--${readiness.tone}`}>
      <div className="daily-readiness-card__head">
        <div>
          <p className="eyebrow">État du jour</p>
          <h2>Récupération estimée</h2>
        </div>
        <div className="daily-readiness-card__score">
          <strong>{readiness.score ?? "-"}</strong>
          <span>%</span>
        </div>
      </div>

      <div className="daily-readiness-card__bar" aria-hidden="true">
        <i style={{ width: `${Math.max(4, readiness.score ?? 0)}%` }} />
      </div>

      <div className="daily-readiness-card__metrics">
        <span><b>{readiness.sleepLabel ?? "-"}</b>Sommeil</span>
        <span><b>{readiness.averageHeartRate ? `${readiness.averageHeartRate} bpm` : "-"}</b>FC moyenne</span>
        <span><b>{readiness.caloriesToday ? `${formatNumber(readiness.caloriesToday)} kcal` : "-"}</b>Calories</span>
      </div>

      <div className="daily-readiness-card__footer">
        <StatBadge tone={readiness.tone}>{toneLabel(readiness.tone)}</StatBadge>
        <p>{readiness.recommendation}</p>
      </div>
    </GlassCard>
  );
}
