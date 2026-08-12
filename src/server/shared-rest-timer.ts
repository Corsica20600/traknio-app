export type SharedRestTimerStatus = "IDLE" | "ACTIVE" | "PAUSED";

export type SharedRestTimerSnapshot = {
  status: SharedRestTimerStatus;
  remainingSeconds: number;
  updatedAt: Date | null;
};

const MAX_REST_SECONDS = 600;

export function clampRestSeconds(value: number) {
  return Math.max(0, Math.min(MAX_REST_SECONDS, Math.floor(Number.isFinite(value) ? value : 0)));
}

export function getSharedRestRemaining(input: SharedRestTimerSnapshot, now = new Date()) {
  const stored = clampRestSeconds(input.remainingSeconds);
  if (input.status !== "ACTIVE" || !input.updatedAt) return input.status === "IDLE" ? 0 : stored;
  const elapsed = Math.max(0, Math.floor((now.getTime() - input.updatedAt.getTime()) / 1000));
  return Math.max(0, stored - elapsed);
}

export function normalizeSharedRest(input: SharedRestTimerSnapshot, now = new Date()): SharedRestTimerSnapshot {
  const remainingSeconds = getSharedRestRemaining(input, now);
  if (remainingSeconds <= 0) return { status: "IDLE", remainingSeconds: 0, updatedAt: now };
  return {
    status: input.status,
    remainingSeconds,
    updatedAt: input.status === "ACTIVE" ? now : input.updatedAt,
  };
}
