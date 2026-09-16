export function parseGooglePlayNotification(body: unknown, packageName: string): { purchaseToken?: string } | null {
  if (!body || typeof body !== "object" || !("message" in body)) return null;
  const message = body.message;
  if (!message || typeof message !== "object" || !("data" in message) || typeof message.data !== "string" || message.data.length > 64000) return null;
  try {
    const data = JSON.parse(Buffer.from(message.data, "base64").toString("utf8"));
    if (!data || data.packageName !== packageName) return null;
    if (data.testNotification) return {};
    const event = data.subscriptionNotification ?? (data.voidedPurchaseNotification?.productType === 1 ? data.voidedPurchaseNotification : null);
    if (!event) return {}; // Unrelated one-time products are acknowledged without changing access.
    return typeof event.purchaseToken === "string" && event.purchaseToken.length > 0 && event.purchaseToken.length <= 8192 ? { purchaseToken: event.purchaseToken } : null;
  } catch { return null; }
}
