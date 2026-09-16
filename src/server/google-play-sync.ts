import { prisma } from "../lib/prisma";
import { hashGooglePlayPurchaseToken, verifyGooglePlaySubscription } from "./google-play-billing";

export class GooglePlaySyncError extends Error {}

/** Lock before verifying so concurrent restore/RTDN deliveries cannot write an older snapshot last. */
export async function syncGooglePlayPurchase(input: { userProfileId: string; packageName: string; productId: string; purchaseToken: string; existingOnly?: boolean }, db = prisma, verify = verifyGooglePlaySubscription) {
  const tokenHash = hashGooglePlayPurchaseToken(input.purchaseToken);
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "UserProfile" WHERE id = ${input.userProfileId} FOR UPDATE`;
    const profile = await tx.userProfile.findUnique({ where: { id: input.userProfileId }, select: { googlePlayPurchaseTokenHash: true } });
    if (!profile || (input.existingOnly && profile.googlePlayPurchaseTokenHash !== tokenHash)) return null;
    const verified = await verify(input);
    if (verified.productId !== input.productId) throw new GooglePlaySyncError("product_mismatch");
    await tx.userProfile.update({ where: { id: input.userProfileId }, data: {
      googlePlayPurchaseTokenHash: tokenHash,
      googlePlayOrderId: verified.orderId,
      googlePlayProductId: input.productId,
      googlePlayBasePlanId: verified.basePlanId,
      googlePlayPackageName: input.packageName,
      subscriptionStatus: verified.status,
      subscriptionPriceId: input.productId,
      subscriptionCurrentPeriodEnd: verified.currentPeriodEnd,
      subscriptionCancelAtPeriodEnd: verified.cancelAtPeriodEnd,
    } });
    return verified;
  }, { timeout: 25000 });
}
