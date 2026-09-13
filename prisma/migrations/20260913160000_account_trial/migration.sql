-- Explicit, one-time account trial. Existing subscriptions remain unchanged.
ALTER TABLE "UserProfile" ADD COLUMN "trialStartedAt" TIMESTAMP(3),
ADD COLUMN "trialEndsAt" TIMESTAMP(3);
ALTER TABLE "AiProgramGeneration" ADD COLUMN "generatedProgram" JSONB,
ADD COLUMN "savedProgramId" TEXT;
