import { hasFullAccess } from "@/src/lib/premium-access-rules";

type CoachAccessProfile = Parameters<typeof hasFullAccess>[0];
type Environment = Record<string, string | undefined>;

function isEnabled(value: string | undefined) {
  return ["1", "true", "yes", "on"].includes(value?.trim().toLowerCase() ?? "");
}

/** The Coach always uses the same premium entitlement as the rest of Traknio. */
export function hasTraknioCoachAccess(profile: CoachAccessProfile, environment: Environment = process.env) {
  const enabled = environment.ENABLE_TRAKNIO_COACH === undefined
    ? environment.NODE_ENV !== "production"
    : isEnabled(environment.ENABLE_TRAKNIO_COACH);
  return enabled && hasFullAccess(profile);
}
