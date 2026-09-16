import { ACCOUNT_TRIAL_MS } from "./premium-access-rules";

export type GooglePlayLineItem = {
  productId?: string;
  expiryTime?: string;
  offerDetails?: { basePlanId?: string; offerId?: string };
  offerPhase?: {
    freeTrial?: object; basePrice?: object; introductoryPrice?: object;
    prorationPeriod?: { originalOfferPhaseType?: string };
  };
};

export function googlePlayEntitlement(state: string | undefined, item: GooglePlayLineItem | null, startTime?: string, now = Date.now()) {
  const parsedEnd = item?.expiryTime ? new Date(item.expiryTime) : null;
  const currentPeriodEnd = parsedEnd && Number.isFinite(parsedEnd.getTime()) ? parsedEnd : null;
  const remaining = !!currentPeriodEnd && currentPeriodEnd.getTime() > now;
  const phase = item?.offerPhase;
  const start = startTime ? Date.parse(startTime) : NaN;
  // offerId survives renewal. Prefer the current phase; the time-bound fallback
  // supports older responses without incorrectly treating every renewal as a trial.
  const trial = phase
    ? phase.freeTrial !== undefined || phase.prorationPeriod?.originalOfferPhaseType === "FREE_TRIAL"
    : item?.offerDetails?.offerId === "trial-7-days" && Number.isFinite(start) && now >= start
      && now < start + ACCOUNT_TRIAL_MS && !!currentPeriodEnd && currentPeriodEnd.getTime() <= start + ACCOUNT_TRIAL_MS;
  const active = remaining && ["SUBSCRIPTION_STATE_ACTIVE", "SUBSCRIPTION_STATE_IN_GRACE_PERIOD", "SUBSCRIPTION_STATE_CANCELED"].includes(state ?? "");
  let status: "ACTIVE" | "TRIALING" | "PAST_DUE" | "CANCELED" | "INCOMPLETE" | "UNPAID" | "PAUSED" | "FREE" = "FREE";
  if (active) status = trial ? "TRIALING" : state === "SUBSCRIPTION_STATE_CANCELED" ? "CANCELED" : state === "SUBSCRIPTION_STATE_IN_GRACE_PERIOD" ? "PAST_DUE" : "ACTIVE";
  else if (state === "SUBSCRIPTION_STATE_ON_HOLD") status = "UNPAID";
  else if (state === "SUBSCRIPTION_STATE_PAUSED") status = "PAUSED";
  else if (state === "SUBSCRIPTION_STATE_PENDING") status = "INCOMPLETE";
  return { active, status, currentPeriodEnd, cancelAtPeriodEnd: state === "SUBSCRIPTION_STATE_CANCELED" };
}
