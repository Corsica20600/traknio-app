import { NextResponse } from "next/server";
import { completeWatchPairing } from "@/src/server/watch-pairing";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  const result = await completeWatchPairing(
    String(body.pairingToken ?? ""),
    body.label,
  );

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }

  return NextResponse.json(
    {
      ok: true,
      deviceToken: result.deviceToken,
      label: result.label,
      accountPairingId: result.accountPairingId,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
