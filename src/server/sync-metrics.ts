import { AsyncLocalStorage } from "node:async_hooks";

export type SyncMetricContext = {
  sessionId?: string;
  actionId?: string;
  action?: string;
  origin?: "WATCH" | "PHONE" | "UNKNOWN";
  transport?: "HTTPS_WATCH_DIRECT" | "PHONE_RELAY" | "HTTPS_PHONE" | "POLLING" | "UNKNOWN";
};

type SyncMetricFields = SyncMetricContext & {
  event: string;
  status?: number;
  retry?: number;
  bootstrap?: boolean;
  replay?: boolean;
  durationMs?: number;
};

const metricContext = new AsyncLocalStorage<SyncMetricContext>();

/**
 * Logging only: intentionally never writes telemetry to Neon and never throws.
 * Fields are limited to correlation and timing metadata; workout payloads/tokens
 * must not be added here.
 */
export function logSyncMetric(fields: SyncMetricFields) {
  try {
    console.info("TRAKNIO_SYNC_METRIC", JSON.stringify({
      ts: new Date().toISOString(),
      ...metricContext.getStore(),
      ...fields,
    }));
  } catch {
    // Observability is strictly best-effort.
  }
}

export async function withSyncMetricContext<T>(context: SyncMetricContext, execute: () => Promise<T>): Promise<T> {
  return metricContext.run(context, execute);
}

export function currentSyncMetricContext() {
  return metricContext.getStore();
}
