import { NextResponse } from "next/server";
import { hasFullAccess } from "@/src/lib/premium-access-rules";
import { createBodyMeasurement, getEvolutionOverview } from "@/src/server/body-evolution";
import { getAuthenticatedUserProfile } from "@/src/server/fitness-queries";
import { BODY_MEASUREMENT_FIELDS, type BodyMeasurementInput } from "@/src/types/body-evolution";

export const dynamic = "force-dynamic";

const LIMITS = {
  weightKg: [20, 400],
  waistCm: [20, 250],
  chestCm: [20, 250],
  leftArmCm: [10, 100],
  rightArmCm: [10, 100],
  leftThighCm: [15, 150],
  rightThighCm: [15, 150],
  hipsCm: [20, 250],
  leftCalfCm: [10, 100],
  rightCalfCm: [10, 100],
  fatMassKg: [1, 250],
  bodyFatPercentage: [1, 75],
  heightCm: [80, 250],
} as const;

async function getAccess() {
  const profile = await getAuthenticatedUserProfile().catch(() => null);
  if (!profile) return { ok: false as const, response: NextResponse.json({ error: "auth_required" }, { status: 401 }) };
  if (!hasFullAccess(profile)) {
    return { ok: false as const, response: NextResponse.json({ error: "premium_required" }, { status: 402 }) };
  }
  return { ok: true as const, profile };
}

function numberOrNull(value: unknown, limits: readonly [number, number]) {
  if (value == null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  if (!Number.isFinite(parsed) || parsed < limits[0] || parsed > limits[1]) return undefined;
  return Number(parsed.toFixed(1));
}

function parseInput(value: unknown): BodyMeasurementInput | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const recordedAt = typeof record.recordedAt === "string" ? record.recordedAt : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(recordedAt)) return null;

  const parsed: BodyMeasurementInput = { recordedAt };
  let hasMeasurement = false;
  for (const field of BODY_MEASUREMENT_FIELDS) {
    const parsedValue = numberOrNull(record[field], LIMITS[field]);
    if (parsedValue === undefined) return null;
    parsed[field] = parsedValue;
    hasMeasurement ||= parsedValue != null;
  }
  const heightCm = numberOrNull(record.heightCm, LIMITS.heightCm);
  if (heightCm === undefined || !hasMeasurement) return null;
  parsed.heightCm = heightCm;
  return parsed;
}

export async function GET() {
  const access = await getAccess();
  if (!access.ok) return access.response;

  const overview = await getEvolutionOverview(access.profile);
  return NextResponse.json({ ok: true, overview }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}

export async function POST(request: Request) {
  const access = await getAccess();
  if (!access.ok) return access.response;

  const body = await request.json().catch(() => null);
  const input = parseInput(body);
  if (!input) return NextResponse.json({ ok: false, error: "invalid_measurement" }, { status: 400 });

  try {
    const measurement = await createBodyMeasurement(access.profile, input);
    return NextResponse.json({ ok: true, measurement }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_RECORDED_AT") {
      return NextResponse.json({ ok: false, error: "invalid_measurement_date" }, { status: 400 });
    }
    console.error("EVOLUTION_MEASUREMENT_CREATE_FAILED", { userProfileId: access.profile.id });
    return NextResponse.json({ ok: false, error: "measurement_save_failed" }, { status: 500 });
  }
}
