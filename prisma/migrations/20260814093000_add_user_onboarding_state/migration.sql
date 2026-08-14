-- Additive walkthrough state. Existing profiles default to the current version
-- so they are never unexpectedly shown the first-run onboarding.
ALTER TABLE "UserProfile"
  ADD COLUMN "onboardingVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "onboardingState" JSONB;
