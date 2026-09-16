import { NextResponse } from "next/server";
import { hasFullAccess } from "@/src/lib/premium-access-rules";
import { deleteBodyMeasurement } from "@/src/server/body-evolution";
import { getAuthenticatedUserProfile } from "@/src/server/fitness-queries";

export const dynamic = "force-dynamic";

export async function DELETE(_request: Request, context: { params: Promise<{ measurementId: string }> }) {
  const profile = await getAuthenticatedUserProfile().catch(() => null);
  if (!profile) return NextResponse.json({ error: "auth_required" }, { status: 401 });
  if (!hasFullAccess(profile)) return NextResponse.json({ error: "premium_required" }, { status: 402 });

  const { measurementId } = await context.params;
  if (!measurementId) return NextResponse.json({ ok: false, error: "invalid_measurement" }, { status: 400 });

  const deleted = await deleteBodyMeasurement(profile.id, measurementId);
  if (!deleted) return NextResponse.json({ ok: false, error: "measurement_not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
