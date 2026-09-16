import { prisma } from "@/src/lib/prisma";
import { requirePremiumAccess } from "@/src/server/premium-access";

const PREF_NOTE = "{\"provider\":\"samsung_health_pref\",\"key\":\"auto_sync\"}";

export async function getSamsungAutoSyncPreference() {
  const profile = await requirePremiumAccess();
  const latest = await prisma.progressMetric.findFirst({
    where: {
      userProfileId: profile.id,
      metricType: "PERFORMANCE",
      unit: "sync_auto",
      notes: PREF_NOTE,
    },
    orderBy: { measuredAt: "desc" },
  });
  if (!latest) return false;
  return latest.value >= 1;
}

export async function setSamsungAutoSyncPreference(enabled: boolean) {
  const profile = await requirePremiumAccess();
  await prisma.progressMetric.create({
    data: {
      userProfileId: profile.id,
      metricType: "PERFORMANCE",
      value: enabled ? 1 : 0,
      unit: "sync_auto",
      measuredAt: new Date(),
      notes: PREF_NOTE,
    },
  });
  return enabled;
}

