-- Additive technical-sheet storage. No existing Exercise, ProgramExercise,
-- WorkoutSet, WorkoutSession or media rows are deleted or rewritten here.
CREATE TYPE "ExerciseMediaRole" AS ENUM ('THUMBNAIL', 'START', 'MID', 'MID_2', 'MID_3', 'CONTRACTION', 'ANIMATION', 'ANATOMY_PRIMARY', 'ANATOMY_SECONDARY');
CREATE TYPE "ExerciseTechnicalSheetStatus" AS ENUM ('MISSING', 'GENERATING', 'REVIEW_REQUIRED', 'READY');
CREATE TYPE "ExerciseMediaStatus" AS ENUM ('MISSING', 'GENERATING', 'REVIEW_REQUIRED', 'READY');
CREATE TYPE "HumanReviewStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED');

ALTER TABLE "Exercise"
  ADD COLUMN "watchDisplayName" TEXT,
  ADD COLUMN "movementPatternFr" TEXT,
  ADD COLUMN "exerciseTypeFr" TEXT,
  ADD COLUMN "whyFr" TEXT,
  ADD COLUMN "executionStepsFr" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "breathingFr" TEXT,
  ADD COLUMN "technicalTempo" JSONB,
  ADD COLUMN "tipsFr" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "technicalSheetStatus" "ExerciseTechnicalSheetStatus" NOT NULL DEFAULT 'MISSING';

ALTER TABLE "ExerciseMedia"
  ADD COLUMN "role" "ExerciseMediaRole",
  ADD COLUMN "mediaStatus" "ExerciseMediaStatus" NOT NULL DEFAULT 'MISSING',
  ADD COLUMN "humanReviewStatus" "HumanReviewStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
  ADD COLUMN "characterProfile" TEXT,
  ADD COLUMN "brandingRequired" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "ExerciseMedia_exerciseId_role_mediaStatus_idx"
  ON "ExerciseMedia"("exerciseId", "role", "mediaStatus");

CREATE UNIQUE INDEX "ExerciseMedia_exerciseId_role_format_key"
  ON "ExerciseMedia"("exerciseId", "role", "format");
