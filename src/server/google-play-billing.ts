import { createHash, createSign } from "crypto";

type GooglePlayServiceAccount = {
  client_email?: string;
  private_key?: string;
  token_uri?: string;
};

type GooglePlaySubscriptionLineItem = {
  productId?: string;
  expiryTime?: string;
  offerDetails?: {
    basePlanId?: string;
    offerId?: string;
  };
};

type GooglePlaySubscriptionPurchase = {
  subscriptionState?: string;
  latestOrderId?: string;
  lineItems?: GooglePlaySubscriptionLineItem[];
};

export type VerifiedGooglePlaySubscription = {
  active: boolean;
  status:
    | "ACTIVE"
    | "TRIALING"
    | "PAST_DUE"
    | "CANCELED"
    | "INCOMPLETE"
    | "INCOMPLETE_EXPIRED"
    | "UNPAID"
    | "PAUSED"
    | "FREE";
  productId: string | null;
  basePlanId: string | null;
  orderId: string | null;
  currentPeriodEnd: Date | null;
  rawState: string | null;
};

function base64Url(input: Buffer | string) {
  return Buffer.from(input).toString("base64url");
}

function getServiceAccount() {
  const rawJson = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON?.trim();
  if (rawJson) {
    return JSON.parse(rawJson) as GooglePlayServiceAccount;
  }

  const clientEmail = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL?.trim();
  const privateKey = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();

  if (!clientEmail || !privateKey) return null;

  return {
    client_email: clientEmail,
    private_key: privateKey,
    token_uri: "https://oauth2.googleapis.com/token",
  };
}

export function isGooglePlayBillingConfigured() {
  const account = getServiceAccount();
  return Boolean(
    account?.client_email
      && account.private_key
      && process.env.GOOGLE_PLAY_PACKAGE_NAME?.trim()
      && process.env.GOOGLE_PLAY_SUBSCRIPTION_PRODUCT_ID?.trim(),
  );
}

async function getAndroidPublisherAccessToken() {
  const account = getServiceAccount();
  if (!account?.client_email || !account.private_key) {
    throw new Error("GOOGLE_PLAY_SERVICE_ACCOUNT_MISSING");
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64Url(JSON.stringify({
    iss: account.client_email,
    scope: "https://www.googleapis.com/auth/androidpublisher",
    aud: account.token_uri || "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));

  const unsignedJwt = `${header}.${payload}`;
  const signature = createSign("RSA-SHA256")
    .update(unsignedJwt)
    .sign(account.private_key, "base64url");

  const response = await fetch(account.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsignedJwt}.${signature}`,
    }),
  });

  if (!response.ok) {
    throw new Error(`GOOGLE_PLAY_TOKEN_ERROR_${response.status}`);
  }

  const body = (await response.json()) as { access_token?: string };
  if (!body.access_token) {
    throw new Error("GOOGLE_PLAY_TOKEN_MISSING");
  }

  return body.access_token;
}

function mapSubscriptionState(state: string | undefined): VerifiedGooglePlaySubscription["status"] {
  if (state === "SUBSCRIPTION_STATE_ACTIVE") return "ACTIVE";
  if (state === "SUBSCRIPTION_STATE_IN_GRACE_PERIOD") return "PAST_DUE";
  if (state === "SUBSCRIPTION_STATE_ON_HOLD") return "UNPAID";
  if (state === "SUBSCRIPTION_STATE_PAUSED") return "PAUSED";
  if (state === "SUBSCRIPTION_STATE_CANCELED") return "CANCELED";
  if (state === "SUBSCRIPTION_STATE_PENDING") return "INCOMPLETE";
  if (state === "SUBSCRIPTION_STATE_EXPIRED") return "FREE";
  return "FREE";
}

export function hashGooglePlayPurchaseToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function verifyGooglePlaySubscription(input: {
  packageName: string;
  purchaseToken: string;
}): Promise<VerifiedGooglePlaySubscription> {
  const accessToken = await getAndroidPublisherAccessToken();
  const url = new URL(
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(input.packageName)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(input.purchaseToken)}`,
  );

  const response = await fetch(url, {
    headers: { authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    let errorStatus: string | null = null;
    let errorMessage: string | null = null;
    let reasons: string[] = [];

    try {
      const body = (await response.json()) as {
        error?: {
          status?: unknown;
          message?: unknown;
          errors?: Array<{ reason?: unknown }>;
        };
      };
      const error = body.error;
      errorStatus = typeof error?.status === "string" ? error.status : null;
      errorMessage = typeof error?.message === "string" ? error.message : null;
      reasons = Array.isArray(error?.errors)
        ? error.errors
          .map((entry) => entry.reason)
          .filter((reason): reason is string => typeof reason === "string")
        : [];
    } catch {
      // The status code remains useful even if Google returns a non-JSON body.
    }

    console.error("[GOOGLE_PLAY_SUBSCRIPTION_ERROR]", {
      httpStatus: response.status,
      errorStatus,
      errorMessage,
      reasons,
    });
    throw new Error(`GOOGLE_PLAY_SUBSCRIPTION_ERROR_${response.status}`);
  }

  const purchase = (await response.json()) as GooglePlaySubscriptionPurchase;
  const lineItem = purchase.lineItems?.[0] ?? null;
  const status = mapSubscriptionState(purchase.subscriptionState);
  const expiryTime = lineItem?.expiryTime ? new Date(lineItem.expiryTime) : null;
  const hasRemainingEntitlement = expiryTime ? expiryTime.getTime() > Date.now() : true;
  const active =
    (purchase.subscriptionState === "SUBSCRIPTION_STATE_ACTIVE" && hasRemainingEntitlement)
    || (purchase.subscriptionState === "SUBSCRIPTION_STATE_IN_GRACE_PERIOD" && hasRemainingEntitlement)
    || (purchase.subscriptionState === "SUBSCRIPTION_STATE_CANCELED" && hasRemainingEntitlement);

  return {
    active,
    status,
    productId: lineItem?.productId ?? null,
    basePlanId: lineItem?.offerDetails?.basePlanId ?? null,
    orderId: purchase.latestOrderId ?? null,
    currentPeriodEnd: expiryTime && !Number.isNaN(expiryTime.getTime()) ? expiryTime : null,
    rawState: purchase.subscriptionState ?? null,
  };
}
