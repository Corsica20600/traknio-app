import { timingSafeEqual } from "node:crypto";

type ReviewerCredentials = {
  email: string;
  password: string;
};

function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function passwordsMatch(candidate: string, expected: string) {
  const candidateBytes = Buffer.from(candidate, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");

  return candidateBytes.length === expectedBytes.length && timingSafeEqual(candidateBytes, expectedBytes);
}

export function getReviewerCredentials(): ReviewerCredentials | null {
  const email = normalizeEmail(process.env.TRAKNIO_REVIEWER_EMAIL);
  const password = process.env.TRAKNIO_REVIEWER_PASSWORD;

  return email && password ? { email, password } : null;
}

/**
 * This provider is deliberately limited to the single Play reviewer identity.
 * It is not a general password-login feature for customer accounts.
 */
export function verifyReviewerCredentials(input: { email?: unknown; password?: unknown }) {
  const reviewer = getReviewerCredentials();
  const email = normalizeEmail(input.email);
  const password = typeof input.password === "string" ? input.password : "";

  if (!reviewer || !email || !password || email !== reviewer.email) return null;
  return passwordsMatch(password, reviewer.password) ? reviewer : null;
}
