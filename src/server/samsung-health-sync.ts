import { prisma } from "@/src/lib/prisma";
import { getOrCreateDemoProfile } from "@/src/server/fitness-queries";

export type SamsungMetricInput = {
  metric: "heart_rate" | "sleep_minutes" | "calories" | "distance_m";
  value: number;
  measuredAt: string;
  sourceDevice?: string;
};

type HealthSyncProvider = "samsung_health" | "health_connect";

const providerConfig: Record<
  HealthSyncProvider,
  {
    connectionProvider: "SAMSUNG_HEALTH" | "HEALTH_CONNECT";
    displayName: string;
    source: string;
  }
> = {
  samsung_health: {
    connectionProvider: "SAMSUNG_HEALTH",
    displayName: "Samsung Health",
    source: "private_android_bridge",
  },
  health_connect: {
    connectionProvider: "HEALTH_CONNECT",
    displayName: "Health Connect",
    source: "android_health_connect",
  },
};

function toUnit(metric: SamsungMetricInput["metric"]) {
  if (metric === "heart_rate") return "bpm";
  if (metric === "sleep_minutes") return "min";
  if (metric === "calories") return "kcal";
  if (metric === "distance_m") return "m";
  return "raw";
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parseMeasuredAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

export async function ingestHealthMetrics(
  records: SamsungMetricInput[],
  provider: HealthSyncProvider,
  userProfileId?: string,
) {
  const profile = userProfileId ? { id: userProfileId } : await getOrCreateDemoProfile();
  const config = providerConfig[provider];
  const valid = records.filter((item) => {
    if (!item || typeof item !== "object") return false;
    if (!isFiniteNumber(item.value)) return false;
    if (!parseMeasuredAt(item.measuredAt)) return false;
    if (item.metric === "sleep_minutes" && (item.value < 60 || item.value > 12 * 60)) return false;
    return true;
  });

  if (valid.length === 0) {
    return { inserted: 0, ignored: records.length };
  }

  await prisma.progressMetric.createMany({
    data: valid.map((item) => ({
      userProfileId: profile.id,
      metricType: "PERFORMANCE",
      value: item.value,
      unit: toUnit(item.metric),
      measuredAt: parseMeasuredAt(item.measuredAt) ?? new Date(),
      notes: JSON.stringify({
        provider,
        metric: item.metric,
        sourceDevice: item.sourceDevice ?? null,
      }),
    })),
  });

  await prisma.integrationConnection.upsert({
    where: { userProfileId_provider: { userProfileId: profile.id, provider: config.connectionProvider } },
    update: {
      status: "CONNECTED",
      displayName: config.displayName,
      scopes: Array.from(new Set(valid.map((item) => item.metric))),
      lastSyncAt: new Date(),
      connectedAt: new Date(),
      disconnectedAt: null,
      metadata: {
        source: config.source,
        inserted: valid.length,
      },
    },
    create: {
      userProfileId: profile.id,
      provider: config.connectionProvider,
      status: "CONNECTED",
      displayName: config.displayName,
      scopes: Array.from(new Set(valid.map((item) => item.metric))),
      lastSyncAt: new Date(),
      connectedAt: new Date(),
      metadata: {
        source: config.source,
        inserted: valid.length,
      },
    },
  });

  return {
    inserted: valid.length,
    ignored: records.length - valid.length,
  };
}

export async function ingestSamsungHealthMetrics(records: SamsungMetricInput[]) {
  return ingestHealthMetrics(records, "samsung_health");
}
