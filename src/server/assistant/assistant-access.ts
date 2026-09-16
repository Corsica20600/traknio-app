import { hasFullAccess } from "@/src/lib/premium-access-rules";

type AssistantAccessProfile = Parameters<typeof hasFullAccess>[0];
type Environment = Record<string, string | undefined>;

function isEnabled(value: string | undefined) {
  return ["1", "true", "yes", "on"].includes(value?.trim().toLowerCase() ?? "");
}

export function isTraknioAssistantEnabled(environment: Environment = process.env) {
  return environment.ENABLE_TRAKNIO_ASSISTANT === undefined
    ? environment.NODE_ENV !== "production"
    : isEnabled(environment.ENABLE_TRAKNIO_ASSISTANT);
}

/** The assistant follows the existing Traknio premium entitlement. */
export function hasTraknioAssistantAccess(profile: AssistantAccessProfile, environment: Environment = process.env) {
  return isTraknioAssistantEnabled(environment) && hasFullAccess(profile);
}
