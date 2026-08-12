"use client";

type RestTimerCardProps = {
  remainingSeconds: number;
  totalSeconds: number;
  context: string;
  nextLabel: string;
  onAdd15: () => void;
  onRemove15: () => void;
  onTogglePause: () => void;
  onSkip: () => void;
  isPaused?: boolean;
  syncPending?: boolean;
  restActionPending?: boolean;
};

function formatTimer(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function RestTimerCard({
  remainingSeconds,
  totalSeconds,
  context,
  nextLabel,
  onAdd15,
  onRemove15,
  onTogglePause,
  onSkip,
  isPaused = false,
  syncPending = false,
  restActionPending = false,
}: RestTimerCardProps) {
  const percent = totalSeconds > 0 ? Math.max(0, Math.min(100, (remainingSeconds / totalSeconds) * 100)) : 0;

  return (
    <section className="rest-timer-card" aria-live="polite">
      <p className="eyebrow">Repos</p>
      <span className="chip warning">{isPaused ? "Récupération en pause" : "Récupération en cours"}</span>
      <strong className="rest-timer-card__time">{formatTimer(remainingSeconds)}</strong>
      <div className="rest-timer-card__bar" role="progressbar" aria-label={`Repos restant ${formatTimer(remainingSeconds)}`} aria-valuemin={0} aria-valuemax={totalSeconds} aria-valuenow={remainingSeconds}>
        <i style={{ width: `${percent}%` }} />
      </div>
      <p className="workout-active-set">{context}</p>
      <p className="muted">{nextLabel}</p>
      <div className="rest-timer-card__actions">
        <button type="button" className="ghost-btn" onClick={onRemove15} disabled={restActionPending}>-15 s</button>
        <button type="button" className="ghost-btn" onClick={onTogglePause} disabled={restActionPending}>{isPaused ? "Reprendre" : "Pause"}</button>
        <button type="button" className="ghost-btn" onClick={onAdd15} disabled={restActionPending}>+15 s</button>
        <button type="button" className="outline-link" onClick={onSkip} disabled={restActionPending}>Passer</button>
      </div>
      {syncPending ? <p className="muted">Synchronisation en attente</p> : null}
    </section>
  );
}
