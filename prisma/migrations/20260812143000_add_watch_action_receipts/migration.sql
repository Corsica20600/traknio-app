-- Idempotent receipts for Watch direct and phone-relayed mutations.
CREATE TYPE "WatchActionReceiptStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED');

CREATE TABLE "WatchActionReceipt" (
    "id" TEXT NOT NULL,
    "userProfileId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "status" "WatchActionReceiptStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "httpStatus" INTEGER,
    "response" JSONB,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WatchActionReceipt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WatchActionReceipt_userProfileId_requestId_operation_key"
    ON "WatchActionReceipt"("userProfileId", "requestId", "operation");
CREATE INDEX "WatchActionReceipt_userProfileId_status_updatedAt_idx"
    ON "WatchActionReceipt"("userProfileId", "status", "updatedAt");
CREATE INDEX "WatchActionReceipt_status_createdAt_idx"
    ON "WatchActionReceipt"("status", "createdAt");

ALTER TABLE "WatchActionReceipt"
    ADD CONSTRAINT "WatchActionReceipt_userProfileId_fkey"
    FOREIGN KEY ("userProfileId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
