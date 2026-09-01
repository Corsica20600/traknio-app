import { Prisma } from "@prisma/client";
import { prisma } from "@/src/lib/prisma";
import type { CoachRecoverySnapshot, CoachStructuredResponse, CoachWeeklyMetrics } from "./coach-types";
import { validateCoachStructuredResponse } from "./coach-response";
import { getLastFourCompletedCalendarWeeks } from "./coach-period";
import { calculateCoachWeeklyMetrics } from "./weekly-metrics";

const COACH_MODEL = "gpt-4.1-mini";

type CoachProfile = {
  id: string;
  sessionsPerWeek: number | null;
};

type OpenAiResponsePayload = {
  output_text?: string;
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
};

export type CoachWeeklyReportResult = {
  id: string;
  periodKey: string;
  periodStart: string;
  periodEnd: string;
  status: "PENDING" | "COMPLETED" | "FAILED";
  metrics: CoachWeeklyMetrics | null;
  response: CoachStructuredResponse | null;
  model: string | null;
  errorCode: string | null;
  feedback: "USEFUL" | "NOT_USEFUL" | null;
  generatedAt: string | null;
  nextAvailableAt: string;
};

function normalizeMuscleGroup(value: string | undefined) {
  const lower = value?.toLowerCase() ?? "";
  if (["chest", "pectoraux", "poitrine"].some((token) => lower.includes(token))) return "Pectoraux";
  if (["back", "dos", "lats", "trapezes", "trapezes"].some((token) => lower.includes(token))) return "Dos";
  if (["leg", "jamb", "quad", "hamstring", "ischio", "glute", "fessier", "calf", "mollet"].some((token) => lower.includes(token))) return "Jambes";
  if (["shoulder", "epaule", "delto"].some((token) => lower.includes(token))) return "Epaules";
  if (["biceps", "triceps", "forearm", "avant-bras", "bras"].some((token) => lower.includes(token))) return "Bras";
  if (["ab", "abdomin", "core", "oblique"].some((token) => lower.includes(token))) return "Abdominaux";
  return "Autres";
}

function parseHealthMetricName(notes: string | null) {
  if (!notes) return null;
  try {
    const parsed = JSON.parse(notes) as { metric?: unknown };
    return typeof parsed.metric === "string" ? parsed.metric : null;
  } catch {
    return null;
  }
}

function getRecoverySnapshot(metrics: Array<{ value: number; measuredAt: Date; notes: string | null }>): CoachRecoverySnapshot | null {
  const latest = new Map<string, number>();
  for (const metric of metrics) {
    const name = parseHealthMetricName(metric.notes);
    if (!name || latest.has(name)) continue;
    if (name === "sleep_minutes" && (metric.value < 60 || metric.value > 12 * 60)) continue;
    latest.set(name, Math.round(metric.value));
  }

  const recovery: CoachRecoverySnapshot = {
    ...(latest.has("sleep_minutes") ? { sleepMinutes: latest.get("sleep_minutes") } : {}),
    ...(latest.has("heart_rate") ? { restingHeartRate: latest.get("heart_rate") } : {}),
    ...(latest.has("calories") ? { calories: latest.get("calories") } : {}),
  };
  return Object.keys(recovery).length > 0 ? recovery : null;
}

function asJsonValue(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function parseStoredMetrics(value: Prisma.JsonValue): CoachWeeklyMetrics | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as unknown as CoachWeeklyMetrics;
}

function parseStoredResponse(value: Prisma.JsonValue | null): CoachStructuredResponse | null {
  if (!value) return null;
  const metrics = new Set<string>();
  const result = validateCoachStructuredResponse(value, metrics);
  if (result.ok) return result.value;

  if (typeof value !== "object" || Array.isArray(value)) return null;
  return value as unknown as CoachStructuredResponse;
}

function toResult(
  report: {
    id: string;
    periodKey: string;
    periodStart: Date;
    periodEnd: Date;
    status: "PENDING" | "COMPLETED" | "FAILED";
    metrics: Prisma.JsonValue;
    response: Prisma.JsonValue | null;
    model: string | null;
    errorCode: string | null;
    feedback: "USEFUL" | "NOT_USEFUL" | null;
    generatedAt: Date | null;
  },
) : CoachWeeklyReportResult {
  const nextAvailableAt = new Date(report.periodEnd);
  nextAvailableAt.setUTCDate(nextAvailableAt.getUTCDate() + 7);
  return {
    id: report.id,
    periodKey: report.periodKey,
    periodStart: report.periodStart.toISOString(),
    periodEnd: report.periodEnd.toISOString(),
    status: report.status,
    metrics: parseStoredMetrics(report.metrics),
    response: parseStoredResponse(report.response),
    model: report.model,
    errorCode: report.errorCode,
    feedback: report.feedback,
    generatedAt: report.generatedAt?.toISOString() ?? null,
    nextAvailableAt: nextAvailableAt.toISOString(),
  };
}

function getOpenAiResponseText(payload: OpenAiResponsePayload) {
  const direct = payload.output_text?.trim();
  if (direct) return direct;
  return payload.output
    ?.flatMap((item) => item.content ?? [])
    .map((content) => content.text ?? "")
    .join("\n")
    .trim() ?? "";
}

function getEvidenceKeys(metrics: CoachWeeklyMetrics) {
  const keys = new Set<string>([
    "sessions.completed",
    "sessions.skipped",
    "totals.volumeKg",
    "totals.repetitions",
    "totals.completedSets",
    "totals.durationSeconds",
  ]);
  if (metrics.sessions.planned !== null) keys.add("sessions.planned");
  if (metrics.sessions.missed !== null) keys.add("sessions.missed");
  for (const exercise of metrics.exerciseProgress) {
    if (exercise.loadDeltaKg !== null) keys.add(`exercise.${exercise.exerciseId}.loadDeltaKg`);
    if (exercise.repsDelta !== null) keys.add(`exercise.${exercise.exerciseId}.repsDelta`);
    keys.add(`exercise.${exercise.exerciseId}.trend`);
  }
  if (metrics.recovery?.sleepMinutes !== undefined) keys.add("recovery.sleepMinutes");
  if (metrics.recovery?.restingHeartRate !== undefined) keys.add("recovery.restingHeartRate");
  if (metrics.recovery?.calories !== undefined) keys.add("recovery.calories");
  if (metrics.limitations.length > 0) keys.add("limitations.declared");
  return keys;
}

const coachResponseSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
    positives: { type: "array", items: { type: "string" }, maxItems: 5 },
    watchouts: { type: "array", items: { type: "string" }, maxItems: 5 },
    recommendations: {
      type: "array",
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          rationale: { type: "string" },
          dataUsed: { type: "array", minItems: 1, items: { type: "string" } },
        },
        required: ["title", "rationale", "dataUsed"],
      },
    },
    confidence: { type: "string", enum: ["LOW", "MEDIUM", "HIGH"] },
  },
  required: ["summary", "positives", "watchouts", "recommendations", "confidence"],
} as const;

async function requestCoachAnalysis(metrics: CoachWeeklyMetrics, evidenceKeys: Set<string>) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { ok: false as const, errorCode: "missing_api_key" };

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: COACH_MODEL,
      input: [
        "Tu es Traknio Coach. Interprete uniquement les metriques JSON fournies.",
        "Ne cite aucune donnee absente. Ne pose aucun diagnostic medical et ne presente jamais une recommandation comme une certitude medicale.",
        "Ne recommande jamais une augmentation chiffree de charge ou une progression brutale.",
        "Chaque recommandation doit contenir au moins une cle exacte dans dataUsed, choisie uniquement dans la liste autorisee.",
        "Si les donnees sont insuffisantes, dis-le avec prudence et retourne zero recommandation plutot que d'inventer.",
        `Cles de donnees autorisees: ${JSON.stringify([...evidenceKeys].sort())}`,
        `Metriques calculees: ${JSON.stringify(metrics)}`,
      ].join("\n"),
      text: {
        format: {
          type: "json_schema",
          name: "traknio_weekly_coach_report",
          strict: true,
          schema: coachResponseSchema,
        },
      },
    }),
  }).catch(() => null);

  if (!response || !response.ok) return { ok: false as const, errorCode: "openai_error" };
  const payload = await response.json().catch(() => null) as OpenAiResponsePayload | null;
  const raw = payload ? getOpenAiResponseText(payload) : "";
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false as const, errorCode: "invalid_json" };
  }

  const valid = validateCoachStructuredResponse(parsed, evidenceKeys);
  if (!valid.ok) return { ok: false as const, errorCode: `invalid_response_${valid.error}` };
  return { ok: true as const, response: valid.value };
}

async function calculateMetricsForProfile(profile: CoachProfile) {
  const period = getLastFourCompletedCalendarWeeks();
  const [activeProgram, sessions, healthMetrics] = await Promise.all([
    prisma.program.findFirst({
      where: { userProfileId: profile.id, status: "ACTIVE" },
      orderBy: { updatedAt: "desc" },
      select: { sessionsPerWeek: true },
    }),
    prisma.workoutSession.findMany({
      where: {
        userProfileId: profile.id,
        status: { in: ["COMPLETED", "SKIPPED"] },
        OR: [
          { endedAt: { gte: period.start, lt: period.end } },
          { endedAt: null, startedAt: { gte: period.start, lt: period.end } },
          { endedAt: null, startedAt: null, createdAt: { gte: period.start, lt: period.end } },
        ],
      },
      orderBy: [{ endedAt: "asc" }, { startedAt: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        status: true,
        startedAt: true,
        endedAt: true,
        createdAt: true,
        durationSeconds: true,
        sets: {
          orderBy: [{ completedAt: "asc" }, { createdAt: "asc" }],
          select: {
            exerciseId: true,
            actualReps: true,
            actualWeightKg: true,
            isCompleted: true,
            exercise: {
              select: { name: true, nameFr: true, primaryMuscles: true, primaryMusclesFr: true },
            },
          },
        },
      },
    }),
    prisma.progressMetric.findMany({
      where: {
        userProfileId: profile.id,
        metricType: "PERFORMANCE",
        measuredAt: { gte: period.start, lt: period.end },
      },
      orderBy: { measuredAt: "desc" },
      select: { value: true, measuredAt: true, notes: true },
    }),
  ]);

  const plannedPerWeek = activeProgram?.sessionsPerWeek ?? profile.sessionsPerWeek;
  const plannedSessions = plannedPerWeek === null ? null : Math.max(0, plannedPerWeek) * 4;
  return calculateCoachWeeklyMetrics({
    period,
    plannedSessions,
    sessions: sessions.map((session) => ({
      id: session.id,
      status: session.status,
      occurredAt: session.endedAt ?? session.startedAt ?? session.createdAt,
      durationSeconds: session.durationSeconds,
      sets: session.sets.map((set) => ({
        exerciseId: set.exerciseId,
        exerciseName: set.exercise.nameFr || set.exercise.name,
        muscleGroup: normalizeMuscleGroup(set.exercise.primaryMusclesFr[0] ?? set.exercise.primaryMuscles[0]),
        actualReps: set.actualReps,
        actualWeightKg: set.actualWeightKg,
        isCompleted: set.isCompleted,
      })),
    })),
    recovery: getRecoverySnapshot(healthMetrics),
    limitations: [],
  });
}

export async function getCurrentCoachWeeklyReport(profile: CoachProfile) {
  const period = getLastFourCompletedCalendarWeeks();
  const report = await prisma.coachWeeklyReport.findUnique({
    where: { userProfileId_periodKey: { userProfileId: profile.id, periodKey: period.key } },
  });
  return { report: report ? toResult(report) : null, period };
}

export async function generateCurrentCoachWeeklyReport(profile: CoachProfile) {
  const period = getLastFourCompletedCalendarWeeks();
  const current = await prisma.coachWeeklyReport.findUnique({
    where: { userProfileId_periodKey: { userProfileId: profile.id, periodKey: period.key } },
  });
  if (current && current.status !== "FAILED") return { created: false, report: toResult(current) };

  const metrics = parseStoredMetrics(current?.metrics ?? null) ?? await calculateMetricsForProfile(profile);
  let pending;
  if (current) {
    // A failed attempt may be retried without creating another report for the period.
    const retry = await prisma.coachWeeklyReport.updateMany({
      where: { id: current.id, status: "FAILED" },
      data: { status: "PENDING", response: Prisma.JsonNull, model: null, errorCode: null, generatedAt: null },
    });
    if (retry.count === 0) {
      const existing = await prisma.coachWeeklyReport.findUniqueOrThrow({ where: { id: current.id } });
      return { created: false, report: toResult(existing) };
    }
    pending = await prisma.coachWeeklyReport.findUniqueOrThrow({ where: { id: current.id } });
  } else {
    try {
      pending = await prisma.coachWeeklyReport.create({
        data: {
          userProfileId: profile.id,
          periodKey: period.key,
          periodStart: period.start,
          periodEnd: period.end,
          metrics: asJsonValue(metrics),
          status: "PENDING",
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const existing = await prisma.coachWeeklyReport.findUniqueOrThrow({
          where: { userProfileId_periodKey: { userProfileId: profile.id, periodKey: period.key } },
        });
        return { created: false, report: toResult(existing) };
      }
      throw error;
    }
  }

  console.info("[TRAKNIO_COACH] generation_started", { reportId: pending.id, periodKey: period.key });
  try {
    const generated = await requestCoachAnalysis(metrics, getEvidenceKeys(metrics));
    if (!generated.ok) {
      const failed = await prisma.coachWeeklyReport.update({
        where: { id: pending.id },
        data: { status: "FAILED", errorCode: generated.errorCode },
      });
      console.warn("[TRAKNIO_COACH] generation_failed", { reportId: pending.id, errorCode: generated.errorCode });
      return { created: true, report: toResult(failed) };
    }

    const completed = await prisma.coachWeeklyReport.update({
      where: { id: pending.id },
      data: {
        status: "COMPLETED",
        response: asJsonValue(generated.response),
        model: COACH_MODEL,
        generatedAt: new Date(),
        errorCode: null,
      },
    });
    console.info("[TRAKNIO_COACH] generation_completed", { reportId: pending.id, periodKey: period.key });
    return { created: true, report: toResult(completed) };
  } catch {
    const failed = await prisma.coachWeeklyReport.update({
      where: { id: pending.id },
      data: { status: "FAILED", errorCode: "generation_exception" },
    });
    console.error("[TRAKNIO_COACH] generation_exception", { reportId: pending.id });
    return { created: true, report: toResult(failed) };
  }
}

export async function saveCoachWeeklyFeedback(profile: CoachProfile, feedback: "USEFUL" | "NOT_USEFUL", reportId?: string) {
  const period = getLastFourCompletedCalendarWeeks();
  const report = await prisma.coachWeeklyReport.findFirst({
    where: {
      userProfileId: profile.id,
      ...(reportId ? { id: reportId } : { periodKey: period.key }),
      status: "COMPLETED",
    },
  });
  if (!report) return null;

  const updated = await prisma.coachWeeklyReport.update({
    where: { id: report.id },
    data: { feedback },
  });
  return toResult(updated);
}
