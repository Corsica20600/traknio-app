import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import {
  hashGooglePlayPurchaseToken,
  isGooglePlayBillingConfigured,
  verifyGooglePlaySubscription,
} from "@/src/server/google-play-billing";
import { getAuthenticatedUserProfile } from "@/src/server/fitness-queries";

type VerifyRequest = {
  packageName?: string;
  productId?: string;
  purchaseToken?: string;
};

function expectedPackageName() {
  return process.env.GOOGLE_PLAY_PACKAGE_NAME?.trim() || "com.traknio.app";
}

function expectedProductId() {
  return process.env.GOOGLE_PLAY_SUBSCRIPTION_PRODUCT_ID?.trim() || "traknio_premium";
}

export async function POST(request: Request) {
  const profile = await getAuthenticatedUserProfile().catch((error: unknown) => {
    if (error instanceof Error && error.message === "AUTH_REQUIRED") return null;
    throw error;
  });

  if (!profile) {
    return NextResponse.json({ ok: false, error: "auth_required" }, { status: 401 });
  }

  let body: VerifyRequest;
  try {
    body = (await request.json()) as VerifyRequest;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const packageName = String(body.packageName ?? "").trim();
  const productId = String(body.productId ?? "").trim();
  const purchaseToken = String(body.purchaseToken ?? "").trim();

  if (!packageName || packageName !== expectedPackageName()) {
    return NextResponse.json({ ok: false, error: "invalid_package" }, { status: 400 });
  }

  if (!productId || productId !== expectedProductId()) {
    return NextResponse.json({ ok: false, error: "invalid_product" }, { status: 400 });
  }

  if (!purchaseToken) {
    return NextResponse.json({ ok: false, error: "missing_purchase_token" }, { status: 400 });
  }

  if (!isGooglePlayBillingConfigured()) {
    return NextResponse.json({ ok: false, error: "google_play_billing_not_configured" }, { status: 503 });
  }

  try {
    const verified = await verifyGooglePlaySubscription({ packageName, purchaseToken });

    if (verified.productId && verified.productId !== productId) {
      return NextResponse.json({ ok: false, error: "product_mismatch" }, { status: 400 });
    }

    await prisma.userProfile.update({
      where: { id: profile.id },
      data: {
        googlePlayPurchaseTokenHash: hashGooglePlayPurchaseToken(purchaseToken),
        googlePlayOrderId: verified.orderId,
        googlePlayProductId: productId,
        googlePlayBasePlanId: verified.basePlanId,
        googlePlayPackageName: packageName,
        subscriptionStatus: verified.status,
        subscriptionPriceId: productId,
        subscriptionCurrentPeriodEnd: verified.currentPeriodEnd,
        subscriptionCancelAtPeriodEnd: verified.status === "CANCELED",
      },
    });

    return NextResponse.json({
      ok: true,
      active: verified.active,
      status: verified.status,
      currentPeriodEnd: verified.currentPeriodEnd,
      productId,
      basePlanId: verified.basePlanId,
      offerId: verified.offerId,
      rawState: verified.rawState,
    });
  } catch (error) {
    console.error("[GOOGLE_PLAY_VERIFY]", error);
    return NextResponse.json({ ok: false, error: "google_play_verify_failed" }, { status: 502 });
  }
}
