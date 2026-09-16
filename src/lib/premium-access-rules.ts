export const ACCOUNT_TRIAL_MS = 7 * 24 * 60 * 60 * 1000;

export type AccessProfile = {
  email: string | null | undefined;
  subscriptionStatus: string;
  subscriptionCurrentPeriodEnd: Date | null;
  trialStartedAt?: Date | null;
  trialEndsAt?: Date | null;
};

export function accountTrialEnd(profile: AccessProfile): number {
  if (!profile.trialStartedAt || !profile.trialEndsAt) return 0;
  return Math.min(profile.trialEndsAt.getTime(), profile.trialStartedAt.getTime() + ACCOUNT_TRIAL_MS);
}

export function hasActiveAccountTrial(profile: AccessProfile, now = Date.now()) {
  return !!profile.trialStartedAt && profile.trialStartedAt.getTime() <= now && accountTrialEnd(profile) > now;
}

export function getFreeAccessEmails() {
  return new Set(
    (process.env.TRAKNIO_FREE_ACCESS_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function hasSubscriptionAccess(profile: AccessProfile, now = Date.now()) {
  const email = profile.email?.trim().toLowerCase();
  if (email && getFreeAccessEmails().has(email)) return true;
  const entitlementEnd = profile.subscriptionCurrentPeriodEnd?.getTime() ?? 0;
  return entitlementEnd > now
    && ["ACTIVE", "TRIALING", "PAST_DUE", "CANCELED"].includes(profile.subscriptionStatus);
}

/** Full features require a paid entitlement (or an explicitly granted access). */
export function hasFullAccess(profile: AccessProfile, now = Date.now()) {
  const email = profile.email?.trim().toLowerCase();
  if (email && getFreeAccessEmails().has(email)) return true;
  return profile.subscriptionStatus !== "TRIALING" && hasSubscriptionAccess(profile, now);
}

/** Training access; use hasFullAccess for catalogue, coaching and advanced tracking. */
export function hasPremiumAccess(profile: AccessProfile, now = Date.now()) {
  return hasSubscriptionAccess(profile, now) || hasActiveAccountTrial(profile, now);
}
