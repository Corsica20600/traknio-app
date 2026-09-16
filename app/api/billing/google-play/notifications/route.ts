import { Auth } from "googleapis";
import { prisma } from "@/src/lib/prisma";
import { absoluteUrl } from "@/src/lib/site-url";
import { parseGooglePlayNotification } from "@/src/lib/google-play-notification";
import { getGooglePlayServiceAccountEmail, hashGooglePlayPurchaseToken, isGooglePlayBillingConfigured } from "@/src/server/google-play-billing";
import { syncGooglePlayPurchase } from "@/src/server/google-play-sync";

const verifier = new Auth.OAuth2Client();
export const maxDuration = 30;

export async function POST(request: Request) {
  if (!isGooglePlayBillingConfigured()) return Response.json({ error: "billing_not_configured" }, { status: 503 });
  const token = request.headers.get("authorization")?.match(/^Bearer (\S+)$/i)?.[1];
  if (!token) return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    const ticket = await verifier.verifyIdToken({ idToken: token, audience: absoluteUrl("/api/billing/google-play/notifications") });
    const payload = ticket.getPayload();
    if (!payload?.email_verified || payload.email !== getGooglePlayServiceAccountEmail()) return Response.json({ error: "unauthorized" }, { status: 401 });
  } catch { return Response.json({ error: "unauthorized" }, { status: 401 }); }

  const packageName = process.env.GOOGLE_PLAY_PACKAGE_NAME!.trim();
  const notification = parseGooglePlayNotification(await request.json().catch(() => null), packageName);
  if (!notification) return Response.json({ error: "invalid_notification" }, { status: 400 });
  if (!notification.purchaseToken) return new Response(null, { status: 204 });
  try {
    const owner = await prisma.userProfile.findUnique({ where: { googlePlayPurchaseTokenHash: hashGooglePlayPurchaseToken(notification.purchaseToken) }, select: { id: true } });
    if (owner) await syncGooglePlayPurchase({ userProfileId: owner.id, packageName, productId: process.env.GOOGLE_PLAY_SUBSCRIPTION_PRODUCT_ID!.trim(), purchaseToken: notification.purchaseToken, existingOnly: true });
    // First purchases are attached to their authenticated owner by /verify.
    return new Response(null, { status: 204 });
  } catch {
    // Non-2xx makes Pub/Sub retry. Never log raw purchase tokens or message bodies.
    console.error("[GOOGLE_PLAY_NOTIFICATION] reconciliation_failed");
    return Response.json({ error: "reconciliation_failed" }, { status: 503 });
  }
}
