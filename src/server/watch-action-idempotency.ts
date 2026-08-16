import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/src/lib/prisma";

export type WatchActionOperation =
  | "validate-set"
  | "update-live-target"
  | "skip-rest"
  | "adjust-rest"
  | "pause-rest"
  | "resume-rest"
  | "next-exercise"
  | "previous-exercise"
  | "select-exercise"
  | "complete-session"
  | "submit-session-metrics";

type StoredResponse = {
  payload?: unknown;
  error?: string;
};

export type WatchActionResult<T> = {
  status: number;
  body: StoredResponse & { payload?: T };
};

const IN_PROGRESS_STALE_AFTER_MS = 90_000;

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function hashWatchActionPayload(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function toStoredResponse(value: Prisma.JsonValue | null): StoredResponse {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as StoredResponse
    : { error: "watch_action_unavailable" };
}

export async function runIdempotentWatchAction<T>(input: {
  userProfileId: string;
  requestId: string | null;
  operation: WatchActionOperation;
  payload: unknown;
  execute: (tx: Prisma.TransactionClient) => Promise<WatchActionResult<T>>;
}): Promise<WatchActionResult<T>> {
  const requestId = input.requestId?.trim();
  if (!requestId) return prisma.$transaction((tx) => input.execute(tx));
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(requestId)) {
    return { status: 400, body: { error: "invalid_watch_request_id" } };
  }

  const payloadHash = hashWatchActionPayload(input.payload);
  const key = {
    userProfileId_requestId_operation: {
      userProfileId: input.userProfileId,
      requestId,
      operation: input.operation,
    },
  };

  // PostgreSQL's advisory lock serializes this request key across both transports.
  const lockKey = createHash("sha256")
    .update(`${input.userProfileId}:${requestId}:${input.operation}`)
    .digest()
    .readBigInt64BE(0)
    .toString();

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${BigInt(lockKey)})`;
    const existing = await tx.watchActionReceipt.findUnique({ where: key });
    if (existing) {
      if (existing.payloadHash !== payloadHash) {
        console.warn("WATCH_ACTION_IDEMPOTENCY_CONFLICT", {
          operation: input.operation,
          requestIdSuffix: requestId.slice(-8),
        });
        return { status: 409, body: { error: "watch_action_payload_conflict" } };
      }
      if (existing.status === "COMPLETED" && existing.httpStatus != null) {
        return { status: existing.httpStatus, body: toStoredResponse(existing.response) as WatchActionResult<T>["body"] };
      }
      if (Date.now() - existing.updatedAt.getTime() < IN_PROGRESS_STALE_AFTER_MS) {
        return { status: 202, body: { error: "watch_action_pending" } };
      }
      await tx.watchActionReceipt.update({
        where: key,
        data: { updatedAt: new Date() },
      });
    } else {
      await tx.watchActionReceipt.create({
        data: {
          userProfileId: input.userProfileId,
          requestId,
          operation: input.operation,
          payloadHash,
        },
      });
    }

    try {
      const result = await input.execute(tx);
      // Client and expected business errors are safe to replay. Unexpected failures escape
      // the transaction so the temporary receipt is not persisted as a final response.
      if (result.status >= 500) {
        throw new RetryableWatchActionError(result.body.error ?? "watch_action_server_error");
      }
      await tx.watchActionReceipt.update({
        where: key,
        data: {
          status: "COMPLETED",
          httpStatus: result.status,
          response: result.body as Prisma.InputJsonValue,
          completedAt: new Date(),
        },
      });
      return result;
    } catch (error) {
      if (error instanceof RetryableWatchActionError) throw error;
      throw error;
    }
  });
}

export class RetryableWatchActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RetryableWatchActionError";
  }
}
