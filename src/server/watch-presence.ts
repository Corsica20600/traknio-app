import { prisma } from "@/src/lib/prisma";

// Presence is approximate display metadata, not authorization. Revocation and
// subscription are still checked on every request by requireWatchAccess.
export const WATCH_PRESENCE_INTERVAL_MS = 15 * 60_000;

export async function touchWatchPresence(device: { id: string; lastSeenAt: Date | null }, now = Date.now(), db = prisma) {
  const cutoff = new Date(now - WATCH_PRESENCE_INTERVAL_MS);
  if (device.lastSeenAt && device.lastSeenAt >= cutoff) return;
  await db.watchDevice.updateMany({
    where: { id: device.id, revokedAt: null, OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: cutoff } }] },
    data: { lastSeenAt: new Date(now) },
  });
}
