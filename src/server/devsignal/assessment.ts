import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import type {
  DevSignalAssessmentDTO,
  DevSignalDataRequestStatus,
  DevSignalDataRequestType,
  DevSignalStageResultDTO,
} from "@/types/devsignal";
import {
  buildDefaultConfigSnapshot,
  configRowToSnapshot,
  PIPELINE_VERSION,
  type DevSignalConfigSnapshot,
} from "./config";
import { planStages, runStages, summarizeAssessment } from "./orchestrator";
import { buildClientFacingSummary } from "./best-match";
import { createDefaultRegistry } from "./stages/default-registry";
import type { DevSignalStageRegistry } from "./stages/registry";
import {
  isDevSignalStageId,
  DEV_SIGNAL_STAGE_NAMES,
  type DevSignalStageId,
  type DevSignalStageResultInput,
  type DevSignalFlag,
  type DevSignalSubScore,
  type DevSignalEvidence,
} from "./stages/types";
import { DEV_SIGNAL_AUDIT_EVENTS, recordAuditEvent } from "./audit";
import { getCalibrationReport } from "./calibration-report";

/** Days a minted /vet/[token] link stays valid. */
const TOKEN_TTL_DAYS = 30;

// ─── config resolution ───────────────────────────────────────────────────────

/** Pick the client-scoped default config, else the workspace default, else code default. */
export async function resolveConfigSnapshot(
  workspaceId: string,
  clientId?: string | null,
): Promise<DevSignalConfigSnapshot> {
  if (clientId) {
    const clientConfig = await prisma.devSignalPipelineConfig.findFirst({
      where: { workspaceId, clientId, isDefault: true },
      orderBy: { createdAt: "desc" },
    });
    if (clientConfig) return configRowToSnapshot(clientConfig);
  }
  const wsConfig = await prisma.devSignalPipelineConfig.findFirst({
    where: { workspaceId, clientId: null, isDefault: true },
    orderBy: { createdAt: "desc" },
  });
  return wsConfig ? configRowToSnapshot(wsConfig) : buildDefaultConfigSnapshot();
}

// ─── serialization ─────────────────────────────────────────────────────────

type AssessmentWithRelations = Prisma.DevSignalAssessmentGetPayload<{
  include: { candidate: { select: { name: true; githubHandle: true } } };
}>;

function serializeStageResult(r: {
  id: string;
  stageId: string;
  stageName: string;
  stageVersion: string;
  status: string;
  weight: number;
  subScores: Prisma.JsonValue | null;
  rawSignals: Prisma.JsonValue | null;
  evidence: Prisma.JsonValue | null;
  flags: Prisma.JsonValue | null;
  durationMs: number | null;
  humanOverride: boolean;
  overrideReason: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
}): DevSignalStageResultDTO {
  return {
    id: r.id,
    stageId: r.stageId,
    stageName: r.stageName,
    stageVersion: r.stageVersion,
    status: r.status as DevSignalStageResultDTO["status"],
    weight: r.weight,
    subScores: (r.subScores ?? []) as unknown as DevSignalSubScore[],
    rawSignals: r.rawSignals ?? null,
    evidence: (r.evidence ?? []) as unknown as DevSignalEvidence[],
    flags: (r.flags ?? []) as unknown as DevSignalFlag[],
    durationMs: r.durationMs,
    humanOverride: r.humanOverride,
    overrideReason: r.overrideReason,
    startedAt: r.startedAt?.toISOString() ?? null,
    finishedAt: r.finishedAt?.toISOString() ?? null,
  };
}

function serializeAssessment(
  a: AssessmentWithRelations,
  opts: {
    includeToken?: boolean;
    stageResults?: DevSignalStageResultDTO[];
    outcomeLinks?: DevSignalAssessmentDTO["outcomeLinks"];
    dataRequests?: DevSignalAssessmentDTO["dataRequests"];
  } = {},
): DevSignalAssessmentDTO {
  return {
    id: a.id,
    workspaceId: a.workspaceId,
    clientId: a.clientId,
    candidateId: a.candidateId,
    candidateName: a.candidate?.name ?? "Unknown",
    candidateGithubHandle: a.candidate?.githubHandle ?? null,
    pipelineVersion: a.pipelineVersion,
    configVersion: a.configVersion,
    status: a.status,
    decision: a.decision,
    decisionReason: a.decisionReason,
    finalScore: a.finalScore,
    scoreBreakdown: (a.scoreBreakdown ?? null) as DevSignalAssessmentDTO["scoreBreakdown"],
    bestMatchSummary: (a.bestMatchSummary ?? null) as DevSignalAssessmentDTO["bestMatchSummary"],
    flags: (a.flags ?? []) as unknown as DevSignalFlag[],
    ...(opts.includeToken
      ? { publicToken: a.publicToken, tokenExpiresAt: a.tokenExpiresAt?.toISOString() ?? null }
      : {}),
    promotedToCode: a.promotedToCode,
    promotedToCodeAt: a.promotedToCodeAt?.toISOString() ?? null,
    startedAt: a.startedAt?.toISOString() ?? null,
    finishedAt: a.finishedAt?.toISOString() ?? null,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
    ...(opts.stageResults ? { stageResults: opts.stageResults } : {}),
    ...(opts.outcomeLinks ? { outcomeLinks: opts.outcomeLinks } : {}),
    ...(opts.dataRequests ? { dataRequests: opts.dataRequests } : {}),
    consent: (a.consent ?? null) as DevSignalAssessmentDTO["consent"],
  };
}

const candidateSelect = { candidate: { select: { name: true, githubHandle: true } } } as const;

// ─── candidate resolution ────────────────────────────────────────────────────

export interface NewCandidateInput {
  name: string;
  githubHandle: string;
  email?: string | null;
  primaryStack?: string | null;
}

async function resolveOrCreateCandidate(
  workspaceId: string,
  args: { candidateId?: string; candidate?: NewCandidateInput },
): Promise<string> {
  if (args.candidateId) {
    const existing = await prisma.candidate.findFirst({
      where: { id: args.candidateId, workspaceId },
      select: { id: true },
    });
    if (!existing) throw new Error("Candidate not found in this workspace.");
    return existing.id;
  }
  if (!args.candidate) throw new Error("Provide candidateId or candidate details.");
  const { name, githubHandle, email, primaryStack } = args.candidate;
  // A vetting candidate: EXTERNAL + unpublished so it never leaks into Code.
  const candidate = await prisma.candidate.upsert({
    where: { workspaceId_githubHandle: { workspaceId, githubHandle } },
    update: {},
    create: {
      workspaceId,
      name,
      githubHandle,
      email: email ?? null,
      primaryStack: primaryStack ?? "Unknown",
      techStacks: primaryStack ? [primaryStack] : [],
      signalSources: ["GITHUB"],
      origin: "EXTERNAL",
      published: false,
      status: "SOURCED",
    },
    select: { id: true },
  });
  return candidate.id;
}

// ─── assessment lifecycle ──────────────────────────────────────────────────

export async function createAssessment(args: {
  workspaceId: string;
  actorId?: string | null;
  clientId?: string | null;
  candidateId?: string;
  candidate?: NewCandidateInput;
}): Promise<DevSignalAssessmentDTO> {
  const candidateId = await resolveOrCreateCandidate(args.workspaceId, {
    candidateId: args.candidateId,
    candidate: args.candidate,
  });
  const snapshot = await resolveConfigSnapshot(args.workspaceId, args.clientId);
  const token = randomBytes(24).toString("base64url");
  const tokenExpiresAt = new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

  const assessment = await prisma.devSignalAssessment.create({
    data: {
      workspaceId: args.workspaceId,
      clientId: args.clientId ?? null,
      candidateId,
      pipelineVersion: PIPELINE_VERSION,
      configVersion: snapshot.version,
      configSnapshot: snapshot as unknown as Prisma.InputJsonValue,
      status: "DRAFT",
      publicToken: token,
      tokenExpiresAt,
    },
    include: candidateSelect,
  });

  await recordAuditEvent({
    workspaceId: args.workspaceId,
    eventType: DEV_SIGNAL_AUDIT_EVENTS.ASSESSMENT_CREATED,
    assessmentId: assessment.id,
    candidateId,
    actorId: args.actorId,
  });
  await recordAuditEvent({
    workspaceId: args.workspaceId,
    eventType: DEV_SIGNAL_AUDIT_EVENTS.CONFIG_SNAPSHOTTED,
    assessmentId: assessment.id,
    candidateId,
    actorId: args.actorId,
    payload: { configVersion: snapshot.version, pipelineVersion: PIPELINE_VERSION },
  });

  return serializeAssessment(assessment, { includeToken: true });
}

export async function listAssessments(
  workspaceId: string,
  filters: { status?: string; decision?: string; candidateId?: string } = {},
): Promise<DevSignalAssessmentDTO[]> {
  const rows = await prisma.devSignalAssessment.findMany({
    where: {
      workspaceId,
      ...(filters.status ? { status: filters.status as never } : {}),
      ...(filters.decision ? { decision: filters.decision as never } : {}),
      ...(filters.candidateId ? { candidateId: filters.candidateId } : {}),
    },
    include: candidateSelect,
    orderBy: { createdAt: "desc" },
  });
  return rows.map((r) => serializeAssessment(r));
}

export async function getAssessment(
  workspaceId: string,
  id: string,
  opts: { includeToken?: boolean } = {},
): Promise<DevSignalAssessmentDTO | null> {
  const assessment = await prisma.devSignalAssessment.findFirst({
    where: { id, workspaceId },
    include: candidateSelect,
  });
  if (!assessment) return null;
  const [stageRows, outcomeRows, requestRows] = await Promise.all([
    prisma.devSignalStageResult.findMany({ where: { assessmentId: id } }),
    prisma.devSignalOutcomeLink.findMany({ where: { assessmentId: id }, orderBy: { createdAt: "desc" } }),
    prisma.devSignalDataRequest.findMany({ where: { assessmentId: id }, orderBy: { createdAt: "desc" } }),
  ]);
  const snapshot = assessment.configSnapshot as unknown as DevSignalConfigSnapshot;
  const ordered = [...stageRows].sort(
    (a, b) => stageOrder(snapshot, a.stageId) - stageOrder(snapshot, b.stageId),
  );
  return serializeAssessment(assessment, {
    includeToken: opts.includeToken,
    stageResults: ordered.map(serializeStageResult),
    outcomeLinks: outcomeRows.map((o) => ({
      id: o.id,
      placementId: o.placementId,
      source: o.source,
      notes: o.notes,
      linkedAt: o.linkedAt?.toISOString() ?? null,
      retained: o.retained,
      tenureDays: o.tenureDays,
      clientRating: o.clientRating,
      churned: o.churned,
    })),
    dataRequests: requestRows.map((r) => ({
      id: r.id,
      type: r.type as DevSignalDataRequestType,
      status: r.status as DevSignalDataRequestStatus,
      message: r.message,
      createdAt: r.createdAt.toISOString(),
      resolvedAt: r.resolvedAt?.toISOString() ?? null,
    })),
  });
}

/** Admin: move a candidate data-rights request through its lifecycle. */
export async function updateDataRequestStatus(
  workspaceId: string,
  id: string,
  status: "OPEN" | "ACKNOWLEDGED" | "RESOLVED",
  resolvedBy?: string | null,
): Promise<{ ok: boolean }> {
  const existing = await prisma.devSignalDataRequest.findFirst({ where: { id, workspaceId } });
  if (!existing) return { ok: false };
  await prisma.devSignalDataRequest.update({
    where: { id },
    data: {
      status,
      resolvedBy: status === "RESOLVED" ? resolvedBy ?? null : null,
      resolvedAt: status === "RESOLVED" ? new Date() : null,
    },
  });
  return { ok: true };
}

function stageOrder(snapshot: DevSignalConfigSnapshot, stageId: string): number {
  return isDevSignalStageId(stageId) ? snapshot.stages[stageId]?.order ?? 999 : 999;
}

// ─── stage execution ─────────────────────────────────────────────────────────

async function persistStageResult(
  workspaceId: string,
  assessmentId: string,
  candidateId: string,
  input: DevSignalStageResultInput,
  weight: number,
  actorId?: string | null,
): Promise<void> {
  const now = new Date();
  const data = {
    workspaceId,
    candidateId,
    stageName: input.stageName,
    stageVersion: input.stageVersion,
    status: input.status,
    weight,
    subScores: input.subScores as unknown as Prisma.InputJsonValue,
    rawSignals: (input.rawSignals ?? undefined) as Prisma.InputJsonValue | undefined,
    evidence: input.evidence as unknown as Prisma.InputJsonValue,
    flags: input.flags as unknown as Prisma.InputJsonValue,
    durationMs: input.durationMs ?? null,
    finishedAt: now,
  };
  // Idempotent: one row per (assessment, stage) — re-running overwrites.
  await prisma.devSignalStageResult.upsert({
    where: { assessmentId_stageId: { assessmentId, stageId: input.stageId } },
    update: data,
    create: { ...data, assessmentId, stageId: input.stageId, startedAt: now },
  });

  const failed = input.status === "FAIL" || input.status === "ERROR";
  await recordAuditEvent({
    workspaceId,
    eventType: failed
      ? DEV_SIGNAL_AUDIT_EVENTS.STAGE_FAILED
      : DEV_SIGNAL_AUDIT_EVENTS.STAGE_COMPLETED,
    assessmentId,
    candidateId,
    actorId,
    payload: { stageId: input.stageId, status: input.status },
  });
}

export async function runAssessment(
  workspaceId: string,
  id: string,
  opts: { actorId?: string | null; registry?: DevSignalStageRegistry } = {},
): Promise<DevSignalAssessmentDTO | null> {
  const assessment = await prisma.devSignalAssessment.findFirst({
    where: { id, workspaceId },
    select: { id: true, candidateId: true, clientId: true, configSnapshot: true },
  });
  if (!assessment) return null;

  const snapshot = assessment.configSnapshot as unknown as DevSignalConfigSnapshot;
  const registry = opts.registry ?? createDefaultRegistry();

  await prisma.devSignalAssessment.update({
    where: { id },
    data: { status: "RUNNING", startedAt: new Date() },
  });

  const plan = planStages(snapshot);
  const results = await runStages({
    registry,
    context: {
      workspaceId,
      clientId: assessment.clientId,
      candidateId: assessment.candidateId,
      assessmentId: id,
      configSnapshot: snapshot,
      actorId: opts.actorId,
    },
    stageIds: plan,
  });

  for (const result of results) {
    const weight = snapshot.stages[result.stageId]?.weight ?? 0;
    await persistStageResult(workspaceId, id, assessment.candidateId, result, weight, opts.actorId);
  }

  return recomputeAndPersistScore(workspaceId, id, opts.actorId);
}

/** Recompute the score from persisted stage results and update the assessment. */
export async function recomputeAndPersistScore(
  workspaceId: string,
  id: string,
  actorId?: string | null,
): Promise<DevSignalAssessmentDTO | null> {
  const assessment = await prisma.devSignalAssessment.findFirst({
    where: { id, workspaceId },
    select: { id: true, configSnapshot: true, promotedToCode: true },
  });
  if (!assessment) return null;
  const snapshot = assessment.configSnapshot as unknown as DevSignalConfigSnapshot;

  const stageRows = await prisma.devSignalStageResult.findMany({ where: { assessmentId: id } });
  const scoringInputs = stageRows
    .filter((r) => isDevSignalStageId(r.stageId))
    .map((r) => ({
      stageId: r.stageId as DevSignalStageId,
      status: r.status,
      subScores: (r.subScores ?? []) as unknown as DevSignalSubScore[],
      flags: (r.flags ?? []) as unknown as DevSignalFlag[],
    }));

  const { breakdown } = summarizeAssessment(snapshot, scoringInputs);

  // Collect the flags surfaced across stages for the assessment-level view.
  const allFlags: DevSignalFlag[] = stageRows.flatMap(
    (r) => (r.flags ?? []) as unknown as DevSignalFlag[],
  );
  const strengths = stageRows
    .filter((r) => r.status === "PASS")
    .map((r) => r.stageName);

  const summary = buildClientFacingSummary({
    breakdown,
    strengths,
    promotedToCode: assessment.promotedToCode,
  });

  const hasError = stageRows.some((r) => r.status === "ERROR");
  const status = breakdown.humanReviewRequired || hasError ? "PENDING_HUMAN" : "COMPLETED";

  await prisma.devSignalAssessment.update({
    where: { id },
    data: {
      finalScore: breakdown.finalScore,
      scoreBreakdown: breakdown as unknown as Prisma.InputJsonValue,
      bestMatchSummary: summary as unknown as Prisma.InputJsonValue,
      flags: allFlags as unknown as Prisma.InputJsonValue,
      status,
      finishedAt: new Date(),
    },
  });

  await recordAuditEvent({
    workspaceId,
    eventType: DEV_SIGNAL_AUDIT_EVENTS.SCORE_COMPUTED,
    assessmentId: id,
    actorId,
    payload: { finalScore: breakdown.finalScore, formulaVersion: breakdown.formulaVersion, status },
  });

  return getAssessment(workspaceId, id);
}

/**
 * Apply a candidate-supplied stage result (coding challenge, video) from the
 * public flow, then recompute. Weight comes from the config snapshot, so a
 * candidate can never influence their own weighting.
 */
export async function applyStageResult(
  workspaceId: string,
  assessmentId: string,
  input: DevSignalStageResultInput,
): Promise<DevSignalAssessmentDTO | null> {
  const assessment = await prisma.devSignalAssessment.findFirst({
    where: { id: assessmentId, workspaceId },
    select: { candidateId: true, configSnapshot: true },
  });
  if (!assessment) return null;
  const snapshot = assessment.configSnapshot as unknown as DevSignalConfigSnapshot;
  const weight = snapshot.stages[input.stageId]?.weight ?? 0;
  await persistStageResult(workspaceId, assessmentId, assessment.candidateId, input, weight, null);
  return recomputeAndPersistScore(workspaceId, assessmentId);
}

// ─── leadership interview (human scorecard, stage 7) ─────────────────────────

export type InterviewVerdict = "PASS" | "WARN" | "FAIL" | "NEEDS_SECOND_REVIEW";

export async function recordInterview(
  workspaceId: string,
  id: string,
  args: {
    dimensions: Array<{ key: string; label: string; score: number }>;
    verdict: InterviewVerdict;
    notes?: string;
    interviewerId?: string | null;
  },
): Promise<DevSignalAssessmentDTO | null> {
  const status =
    args.verdict === "PASS"
      ? "PASS"
      : args.verdict === "FAIL"
        ? "FAIL"
        : args.verdict === "WARN"
          ? "WARN"
          : "PENDING_HUMAN";

  const flags: DevSignalFlag[] =
    args.verdict === "NEEDS_SECOND_REVIEW"
      ? [{ severity: "warn", code: "second_review_requested", message: "Interviewer requested a second review." }]
      : [];

  return applyStageResult(workspaceId, id, {
    stageId: "leadership_interview",
    stageName: DEV_SIGNAL_STAGE_NAMES.leadership_interview,
    stageVersion: "interview-v1",
    status,
    weight: 0,
    subScores: args.dimensions.map((d) => ({
      key: d.key,
      label: d.label,
      score: Math.max(0, Math.min(100, Math.round(d.score))),
      maxScore: 100,
    })),
    rawSignals: { verdict: args.verdict, notes: args.notes ?? null, interviewerId: args.interviewerId ?? null },
    evidence: [],
    flags,
  });
}

// ─── decisions + promotion (the human gate) ──────────────────────────────────

export async function recordDecision(
  workspaceId: string,
  id: string,
  args: { decision: "APPROVED_FOR_STAGING" | "REJECTED" | "NEEDS_MORE_INFO" | "NONE"; reason?: string; actorId?: string | null },
): Promise<DevSignalAssessmentDTO | null> {
  const assessment = await prisma.devSignalAssessment.findFirst({
    where: { id, workspaceId },
    select: { id: true, candidateId: true },
  });
  if (!assessment) return null;

  const updated = await prisma.devSignalAssessment.update({
    where: { id },
    data: {
      decision: args.decision,
      decisionReason: args.reason ?? null,
      decisionBy: args.actorId ?? null,
      decisionAt: new Date(),
    },
    include: candidateSelect,
  });
  await recordAuditEvent({
    workspaceId,
    eventType: DEV_SIGNAL_AUDIT_EVENTS.DECISION_RECORDED,
    assessmentId: id,
    candidateId: assessment.candidateId,
    actorId: args.actorId,
    payload: { decision: args.decision },
  });
  return serializeAssessment(updated);
}

/**
 * THE human gate. Promoting is the only path that sets APPROVED_FOR_CODE and
 * flips the candidate into the Code roster (published = true). Nothing else may
 * do this — no stage, no auto-run.
 */
export async function promoteToCode(
  workspaceId: string,
  id: string,
  args: { actorId?: string | null; reason?: string },
): Promise<{ ok: true; assessment: DevSignalAssessmentDTO } | { ok: false; error: string }> {
  const assessment = await prisma.devSignalAssessment.findFirst({
    where: { id, workspaceId },
    select: { id: true, candidateId: true, status: true, decision: true, promotedToCode: true },
  });
  if (!assessment) return { ok: false, error: "Assessment not found." };

  await recordAuditEvent({
    workspaceId,
    eventType: DEV_SIGNAL_AUDIT_EVENTS.PROMOTION_ATTEMPTED,
    assessmentId: id,
    candidateId: assessment.candidateId,
    actorId: args.actorId,
  });

  if (assessment.promotedToCode) return { ok: false, error: "Already promoted to Code." };
  if (assessment.decision === "REJECTED") return { ok: false, error: "A rejected assessment cannot be promoted." };
  if (assessment.status === "DRAFT" || assessment.status === "RUNNING") {
    return { ok: false, error: "Run the assessment before promoting." };
  }

  const now = new Date();
  await prisma.$transaction([
    prisma.devSignalAssessment.update({
      where: { id },
      data: {
        promotedToCode: true,
        promotedToCodeBy: args.actorId ?? null,
        promotedToCodeAt: now,
        decision: "APPROVED_FOR_CODE",
        decisionReason: args.reason ?? "Promoted into Code",
        decisionBy: args.actorId ?? null,
        decisionAt: now,
      },
    }),
    // Flip the candidate into the Code roster.
    prisma.candidate.update({
      where: { id: assessment.candidateId },
      data: { published: true, status: "CODECLEAR_COMPLETE" },
    }),
  ]);

  await recordAuditEvent({
    workspaceId,
    eventType: DEV_SIGNAL_AUDIT_EVENTS.PROMOTION_COMPLETED,
    assessmentId: id,
    candidateId: assessment.candidateId,
    actorId: args.actorId,
  });

  const dto = await getAssessment(workspaceId, id);
  return dto ? { ok: true, assessment: dto } : { ok: false, error: "Promotion saved but reload failed." };
}

// ─── outcome linking (the future training label) ─────────────────────────────

export async function createOutcomeLink(
  workspaceId: string,
  args: {
    assessmentId: string;
    placementId?: string | null;
    deliveryMetrics?: unknown;
    source?: string | null;
    notes?: string | null;
    retained?: boolean | null;
    tenureDays?: number | null;
    clientRating?: number | null;
    churned?: boolean | null;
    actorId?: string | null;
  },
): Promise<{ id: string } | null> {
  const assessment = await prisma.devSignalAssessment.findFirst({
    where: { id: args.assessmentId, workspaceId },
    select: { id: true, candidateId: true },
  });
  if (!assessment) return null;

  const link = await prisma.devSignalOutcomeLink.create({
    data: {
      workspaceId,
      assessmentId: args.assessmentId,
      candidateId: assessment.candidateId,
      placementId: args.placementId ?? null,
      deliveryMetrics: (args.deliveryMetrics ?? undefined) as Prisma.InputJsonValue | undefined,
      source: args.source ?? "manual",
      notes: args.notes ?? null,
      retained: args.retained ?? null,
      tenureDays: args.tenureDays ?? null,
      clientRating: args.clientRating ?? null,
      churned: args.churned ?? null,
      outcomeRecordedAt:
        args.retained != null || args.tenureDays != null || args.clientRating != null || args.churned != null
          ? new Date()
          : null,
      linkedAt: new Date(),
    },
    select: { id: true },
  });
  await recordAuditEvent({
    workspaceId,
    eventType: DEV_SIGNAL_AUDIT_EVENTS.OUTCOME_LINKED,
    assessmentId: args.assessmentId,
    candidateId: assessment.candidateId,
    actorId: args.actorId,
    payload: { placementId: args.placementId ?? null },
  });
  return link;
}

// ─── analytics ────────────────────────────────────────────────────────────

export async function getAssessmentAnalytics(workspaceId: string) {
  const [rows, promoted, outcomeLinks, consented, stageCounts] = await Promise.all([
    prisma.devSignalAssessment.findMany({
      where: { workspaceId },
      select: { status: true, decision: true, finalScore: true },
    }),
    prisma.devSignalAssessment.count({ where: { workspaceId, promotedToCode: true } }),
    prisma.devSignalOutcomeLink.count({ where: { workspaceId } }),
    prisma.devSignalAssessment.count({ where: { workspaceId, consent: { not: Prisma.DbNull } } }),
    // One StageResult row per (assessment, stage) → count = assessments that reached each stage.
    prisma.devSignalStageResult.groupBy({
      by: ["stageId"],
      where: { workspaceId, stageId: { in: ["coding_challenge", "video_assessment", "identity_verification"] } },
      _count: { _all: true },
    }),
  ]);
  const stageReached = (id: string) => stageCounts.find((s) => s.stageId === id)?._count._all ?? 0;

  const byStatus: Record<string, number> = {};
  const byDecision: Record<string, number> = {};
  let scoreSum = 0;
  let scoreCount = 0;
  for (const r of rows) {
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    byDecision[r.decision] = (byDecision[r.decision] ?? 0) + 1;
    if (typeof r.finalScore === "number") {
      scoreSum += r.finalScore;
      scoreCount += 1;
    }
  }
  // Model calibration status (not the weights — just status/n/validity, safe for
  // any DevSignal admin) so score views can honestly flag "provisional".
  const calibration = await getCalibrationReport(workspaceId);

  // Completion funnel — where candidates drop off. "Submitted" = reached a
  // terminal state (a human is reviewing or it's done), not still in-flight.
  const submitted = rows.filter((r) => r.status !== "DRAFT" && r.status !== "RUNNING").length;
  const funnel = [
    { key: "invited", label: "Invited", n: rows.length },
    { key: "consented", label: "Consented", n: consented },
    { key: "challenge", label: "Challenge", n: stageReached("coding_challenge") },
    { key: "video", label: "Intro", n: stageReached("video_assessment") },
    { key: "identity", label: "Identity", n: stageReached("identity_verification") },
    { key: "submitted", label: "Submitted", n: submitted },
  ];

  return {
    total: rows.length,
    byStatus,
    byDecision,
    promotedToCode: promoted,
    averageFinalScore: scoreCount > 0 ? Math.round(scoreSum / scoreCount) : null,
    outcomeLinks,
    modelStatus: {
      status: calibration.status,
      n: calibration.n,
      overallValidity: calibration.overallValidity,
    },
    funnel,
  };
}
