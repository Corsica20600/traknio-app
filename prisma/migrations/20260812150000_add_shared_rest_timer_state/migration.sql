CREATE TYPE "RestTimerStatus" AS ENUM ('IDLE', 'ACTIVE', 'PAUSED');

ALTER TABLE "WatchSession"
  ADD COLUMN "restStatus" "RestTimerStatus" NOT NULL DEFAULT 'IDLE',
  ADD COLUMN "restRemainingSeconds" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "restUpdatedAt" TIMESTAMP(3);
