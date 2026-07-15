import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { dispatchNotification } from "@/server/notifications";
import { ensureBaseRecords } from "@/server/bootstrap";
import {
  getDefaultSectionPayload,
  getDefaultCostsPayload,
  getDefaultTimelinePayload,
  getDefaultLinkPayload,
  getDefaultCtaPayload,
  getDefaultAssetPayload,
  DEFAULT_WORKSPACE_SLUG,
} from "@/server/proposals";
import { calculateHealthScore, SCAN_VERSION, skipAllChecks } from "@/server/pulse-scan";
import { resolveTargetMarkets, isJurisdictionCode, type JurisdictionCode } from "@/server/pulse-checks/jurisdictions";
import { computeComplianceScorecard } from "@/server/pulse-checks/compliance-scorecard";
import { computeScoreBreakdown } from "@/server/pulse-checks/score-breakdown";
import { computePricingBandsForWorkspace } from "@/server/pulse-pricing";
import { analyseWithClaude, generateDiscoveryKit, generateCompetitorComparison } from "@/server/pulse-ai";
import { runLiteScan } from "@/server/pulse-lite/run-lite-scan";
import { runAuthAgent } from "@/server/pulse-agents/auth-agent";
import { runUrlChecks } from "@/server/pulse-scan";
import { reconcilePulseTasksAfterScan } from "@/server/tasks";
import {
  sendPulseScanCompletedPush,
  sendPulseScanFailedPush,
} from "@/server/push/notifications";
import type {
  PulseScanRecord,
  PulseScanCheckRecord,
  PulseScanListItem,
  PulseScanCheckInput,
  PulseAnalysisOutput,
  DiscoveryKit,
  CodeAgentInsights,
  DeployAgentInsights,
  BrowserAgentInsights,
  VisualAgentInsights,
  CompetitorData,
  CompetitorScanSummary,
  IndustryBenchmark,
  JurisdictionScorecardEntry,
  ScoreBreakdown,
  PricingBand,
  PulseScanDiff,
  ScanDiffItem,
  CheckCategory,
} from "@/types/pulse";
import { runVisualAgent } from "@/server/pulse-agents/visual-agent";

export const pulseInclude = {
  client: {
    select: { id: true, name: true },
  },
  checks: {
    orderBy: { sortOrder: "asc" as const },
  },
} satisfies Prisma.PulseScanInclude;

export type PulseScanDbRecord = Prisma.PulseScanGetPayload<{
  include: typeof pulseInclude;
}>;

function asJson<T>(value: Prisma.JsonValue | null | undefined, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  return value as T;
}

export function serializePulseScan(record: PulseScanDbRecord): PulseScanRecord {
  return {
    id: record.id,
    workspaceId: record.workspaceId,
    clientId: record.clientId,
    clientName: record.client?.name ?? null,
    projectName: record.projectName,
    inputType: record.inputType,
    inputUrl: record.inputUrl,
    inputGithubRepo: record.inputGithubRepo,
    inputDescription: record.inputDescription,
    platform: record.platform ?? null,
    status: record.status,
    scanVersion: record.scanVersion,
    startedAt: record.startedAt.toISOString(),
    completedAt: record.completedAt?.toISOString() ?? null,
    checksCompletedAt: record.checksCompletedAt?.toISOString() ?? null,
    healthScore: record.healthScore,
    previousHealthScore: record.previousHealthScore ?? null,
    techStack: asJson<string[] | null>(record.techStack, null),
    llmAnalysis: asJson<PulseAnalysisOutput | null>(record.llmAnalysis, null),
    discoveryKit: (record.discoveryData as DiscoveryKit | null) ?? null,
    codeInsights: ((record.agentData as { codeInsights?: CodeAgentInsights | null } | null)?.codeInsights) ?? null,
    deployInsights: ((record.agentData as { deployInsights?: DeployAgentInsights | null } | null)?.deployInsights) ?? null,
    browserInsights: ((record.agentData as { browserInsights?: BrowserAgentInsights | null } | null)?.browserInsights) ?? null,
    visualInsights: ((record.agentData as { visualInsights?: VisualAgentInsights | null } | null)?.visualInsights) ?? null,
    aiError: ((record.agentData as { aiError?: string | null } | null)?.aiError) ?? null,
    competitorUrls: asJson<string[] | null>(record.competitorUrls, null),
    competitorData: asJson<CompetitorData | null>(record.competitorData, null),
    targetMarkets: asJson<string[] | null>(record.targetMarkets, null),
    detectedMarkets: asJson<string[] | null>(record.detectedMarkets, null),
    complianceScorecard: asJson<JurisdictionScorecardEntry[] | null>(record.complianceScorecard, null),
    scoreBreakdown: asJson<ScoreBreakdown | null>(record.scoreBreakdown, null),
    pricingBands: asJson<PricingBand[] | null>(record.pricingBands, null),
    shareToken: record.shareToken,
    isShared: record.isShared,
    errorCode: record.errorCode,
    errorMessage: record.errorMessage,
    generatedProposalId: record.generatedProposalId,
    linkedStudyId: record.linkedStudyId,
    linkedStarterId: record.linkedStarterId,
    checks: record.checks.map((check: typeof record.checks[number]) => ({
      id: check.id,
      scanId: check.scanId,
      category: check.category,
      checkKey: check.checkKey,
      label: check.label,
      status: check.status,
      detail: check.detail,
      evidence: check.evidence,
      sortOrder: check.sortOrder,
      createdAt: check.createdAt.toISOString(),
      confidence: (check.confidence as PulseScanCheckRecord["confidence"]) ?? null,
      confidenceReason: check.confidenceReason ?? null,
      trustBucket: (check.trustBucket as PulseScanCheckRecord["trustBucket"]) ?? null,
    })),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function serializePulseScanListItem(
  record: Prisma.PulseScanGetPayload<{
    include: { client: { select: { name: true } } };
  }>,
): PulseScanListItem {
  return {
    id: record.id,
    workspaceId: record.workspaceId,
    clientId: record.clientId,
    clientName: record.client?.name ?? null,
    projectName: record.projectName,
    inputType: record.inputType,
    inputUrl: record.inputUrl,
    inputGithubRepo: record.inputGithubRepo,
    status: record.status,
    healthScore: record.healthScore,
    generatedProposalId: record.generatedProposalId,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

/** `clientIds: null/undefined` → unscoped (admins / trusted API_KEY callers).
 *  `clientIds: string[]` → restrict to those clients (an empty array sees nothing,
 *  the same impossible-filter convention used by the task client scope). */
export async function listPulseScans(params?: {
  clientId?: string;
  clientIds?: string[] | null;
}): Promise<PulseScanListItem[]> {
  const workspace = await prisma.workspace.findFirst({
    where: { slug: DEFAULT_WORKSPACE_SLUG },
    select: { id: true },
  });
  if (!workspace) return [];

  const scans = await prisma.pulseScan.findMany({
    where: {
      workspaceId: workspace.id,
      ...(params?.clientId ? { clientId: params.clientId } : {}),
      ...(params?.clientIds ? { clientId: { in: params.clientIds.length ? params.clientIds : ["__none__"] } } : {}),
    },
    include: {
      client: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return scans.map(serializePulseScanListItem);
}

/** Lower-cased target key for a scan — the unit a trend / monitor is keyed on. */
function scanTargetKey(scan: { inputUrl: string | null; inputGithubRepo: string | null; projectName: string }): string {
  return (scan.inputUrl ?? scan.inputGithubRepo ?? scan.projectName).toLowerCase().trim();
}

/**
 * Client-grouped portfolio for the Pulse dashboard. One pass over the (scoped)
 * workspace scans + one monitors read — no per-target history fetch — so it holds
 * up at 100s of clients. Standalone scans with no client are grouped by target.
 * Pre-sorted by attention: alerting first, then lowest current score, then recency.
 */
export async function getPulsePortfolio(params?: { clientIds?: string[] | null }): Promise<import("@/types/pulse").PulsePortfolioEntry[]> {
  const workspace = await prisma.workspace.findFirst({
    where: { slug: DEFAULT_WORKSPACE_SLUG },
    select: { id: true },
  });
  if (!workspace) return [];

  const [scans, monitors] = await Promise.all([
    prisma.pulseScan.findMany({
      where: {
        workspaceId: workspace.id,
        ...(params?.clientIds ? { clientId: { in: params.clientIds.length ? params.clientIds : ["__none__"] } } : {}),
      },
      include: { client: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.pulseMonitor.findMany({
      where: { workspaceId: workspace.id },
      select: { inputUrl: true, inputGithubRepo: true, isActive: true, lastHealthScore: true, alertThreshold: true },
    }),
  ]);

  // Monitor status indexed by target key (OR-combined when several watch one target).
  const monitorByTarget = new Map<string, { active: boolean; alerting: boolean }>();
  for (const m of monitors) {
    const key = (m.inputUrl ?? m.inputGithubRepo ?? "").toLowerCase().trim();
    if (!key) continue;
    const prev = monitorByTarget.get(key) ?? { active: false, alerting: false };
    prev.active = prev.active || m.isActive;
    // alertThreshold is a drop-tolerance: a low last score means the watched target is unhealthy.
    prev.alerting = prev.alerting || (m.isActive && m.lastHealthScore !== null && m.lastHealthScore < 50);
    monitorByTarget.set(key, prev);
  }

  // Group scans (already newest-first) by client, or by target when unassigned.
  const groups = new Map<string, typeof scans>();
  for (const scan of scans) {
    const key = scan.clientId ? `client:${scan.clientId}` : `target:${scanTargetKey(scan)}`;
    const list = groups.get(key) ?? [];
    list.push(scan);
    groups.set(key, list);
  }

  const entries: import("@/types/pulse").PulsePortfolioEntry[] = [];
  for (const [key, groupScans] of groups) {
    const latest = groupScans[0]; // newest-first
    const completed = [...groupScans]
      .filter((s) => s.status === "COMPLETED" && s.healthScore !== null)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const scores = completed.map((s) => s.healthScore as number);
    const delta = scores.length >= 2 ? scores[scores.length - 1] - scores[scores.length - 2] : null;

    // Lowest *current* score across the group's distinct targets (attention signal).
    const latestByTarget = new Map<string, number>();
    for (const s of completed) {
      latestByTarget.set(scanTargetKey(s), s.healthScore as number); // completed asc → last write is newest
    }
    const currentScores = [...latestByTarget.values()];
    const worstScore = currentScores.length ? Math.min(...currentScores) : null;

    // Monitor across the group's distinct targets (OR-combined).
    const targetKeys = new Set(groupScans.map(scanTargetKey));
    let hasMonitor = false;
    let monitorActive = false;
    let monitorAlerting = false;
    for (const t of targetKeys) {
      const m = monitorByTarget.get(t);
      if (!m) continue;
      hasMonitor = true;
      monitorActive = monitorActive || m.active;
      monitorAlerting = monitorAlerting || m.alerting;
    }
    const monitor = hasMonitor ? { active: monitorActive, alerting: monitorAlerting } : null;

    entries.push({
      key,
      clientId: latest.clientId,
      label: latest.clientId ? (latest.client?.name ?? "Client") : latest.projectName,
      scanCount: groupScans.length,
      latestScanId: latest.id,
      latestScore: latest.healthScore,
      latestStatus: latest.status,
      lastScannedAt: latest.createdAt.toISOString(),
      delta,
      sparkline: scores.slice(-8),
      worstScore,
      monitor,
      running: groupScans.some((s) => s.status === "RUNNING"),
    });
  }

  // Attention sort: alerting first → lowest current score → most recent.
  entries.sort((a, b) => {
    const alert = Number(b.monitor?.alerting ?? false) - Number(a.monitor?.alerting ?? false);
    if (alert !== 0) return alert;
    const aw = a.worstScore ?? 999;
    const bw = b.worstScore ?? 999;
    if (aw !== bw) return aw - bw;
    return new Date(b.lastScannedAt ?? 0).getTime() - new Date(a.lastScannedAt ?? 0).getTime();
  });

  return entries;
}

export async function getPulseScan(id: string): Promise<PulseScanRecord | null> {
  const record = await prisma.pulseScan.findUnique({
    where: { id },
    include: pulseInclude,
  });
  if (!record) return null;
  return serializePulseScan(record);
}

export async function deletePulseScan(id: string): Promise<void> {
  await prisma.pulseScan.delete({ where: { id } });
}

/** Health-score history for the same target (URL / repo) in the workspace — powers
 *  the score-over-time trend. Read-only over existing scans; chronological. */
export async function getScanHistory(scanId: string): Promise<{ id: string; completedAt: string | null; healthScore: number | null }[]> {
  const scan = await prisma.pulseScan.findUnique({
    where: { id: scanId },
    select: { workspaceId: true, inputType: true, inputUrl: true, inputGithubRepo: true },
  });
  if (!scan) return [];
  const target =
    scan.inputType === "URL" && scan.inputUrl ? { inputUrl: scan.inputUrl } :
    scan.inputType === "GITHUB_REPO" && scan.inputGithubRepo ? { inputGithubRepo: scan.inputGithubRepo } :
    null;
  if (!target) return [];

  const rows = await prisma.pulseScan.findMany({
    where: { workspaceId: scan.workspaceId, status: "COMPLETED", healthScore: { not: null }, ...target },
    orderBy: { completedAt: "asc" },
    take: 20,
    select: { id: true, completedAt: true, healthScore: true },
  });
  return rows.slice(-12).map((r) => ({ id: r.id, completedAt: r.completedAt?.toISOString() ?? null, healthScore: r.healthScore }));
}

/** Diff this scan against the previous COMPLETED scan of the same target — what got
 *  fixed, what regressed, what's new. Null when there's no prior scan. */
export async function getScanDiff(scanId: string): Promise<PulseScanDiff | null> {
  const current = await prisma.pulseScan.findUnique({
    where: { id: scanId },
    select: {
      workspaceId: true, inputType: true, inputUrl: true, inputGithubRepo: true, completedAt: true, healthScore: true,
      checks: { select: { checkKey: true, label: true, category: true, status: true } },
    },
  });
  if (!current || !current.completedAt) return null;
  const target =
    current.inputType === "URL" && current.inputUrl ? { inputUrl: current.inputUrl } :
    current.inputType === "GITHUB_REPO" && current.inputGithubRepo ? { inputGithubRepo: current.inputGithubRepo } :
    null;
  if (!target) return null;

  const prev = await prisma.pulseScan.findFirst({
    where: { workspaceId: current.workspaceId, status: "COMPLETED", completedAt: { lt: current.completedAt }, ...target },
    orderBy: { completedAt: "desc" },
    select: {
      id: true, completedAt: true, healthScore: true,
      checks: { select: { checkKey: true, label: true, category: true, status: true } },
    },
  });
  if (!prev) return null;

  const prevByKey = new Map(prev.checks.map((c) => [c.checkKey, c]));
  const isIssue = (s: string) => s === "FAIL" || s === "WARN";
  const fixed: ScanDiffItem[] = [];
  const regressed: ScanDiffItem[] = [];
  const newIssues: ScanDiffItem[] = [];

  for (const c of current.checks) {
    const before = prevByKey.get(c.checkKey);
    const item: ScanDiffItem = { checkKey: c.checkKey, label: c.label, category: c.category, status: c.status, prevStatus: before?.status };
    if (!before) {
      if (isIssue(c.status)) newIssues.push(item);
    } else if (isIssue(before.status) && c.status === "PASS") {
      fixed.push(item);
    } else if (before.status === "PASS" && isIssue(c.status)) {
      regressed.push(item);
    }
  }

  return {
    previousScanId: prev.id,
    previousCompletedAt: prev.completedAt?.toISOString() ?? null,
    scoreChange: (current.healthScore ?? 0) - (prev.healthScore ?? 0),
    fixed,
    regressed,
    newIssues,
  };
}

export interface PulseStatsResponse {
  totalScans: number;
  completedScans: number;
  avgHealthScore: number | null;
  awaitingFollowUp: number;
  totalCriticalGaps: number;
  healthTiers: {
    green: number;   // 75-100
    amber: number;   // 50-74
    red: number;     // 0-49
  };
  recentScans: PulseScanListItem[];
}

export async function getPulseStats(): Promise<PulseStatsResponse> {
  const workspace = await prisma.workspace.findFirst({
    where: { slug: DEFAULT_WORKSPACE_SLUG },
    select: { id: true },
  });
  if (!workspace) {
    return {
      totalScans: 0,
      completedScans: 0,
      avgHealthScore: null,
      awaitingFollowUp: 0,
      totalCriticalGaps: 0,
      healthTiers: { green: 0, amber: 0, red: 0 },
      recentScans: [],
    };
  }

  type ScanSummary = {
    id: string;
    status: string;
    healthScore: number | null;
    generatedProposalId: string | null;
    llmAnalysis: Prisma.JsonValue;
  };

  const [allScans, recentScansRaw] = await Promise.all([
    prisma.pulseScan.findMany({
      where: { workspaceId: workspace.id },
      select: {
        id: true,
        status: true,
        healthScore: true,
        generatedProposalId: true,
        llmAnalysis: true,
      },
    }) as Promise<ScanSummary[]>,
    prisma.pulseScan.findMany({
      where: { workspaceId: workspace.id },
      include: { client: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);

  const completed = (allScans as ScanSummary[]).filter((s: ScanSummary) => s.status === "COMPLETED");
  const withScore = completed.filter((s: ScanSummary) => s.healthScore !== null);

  const avgHealthScore = withScore.length
    ? Math.round(withScore.reduce((sum: number, s: ScanSummary) => sum + (s.healthScore ?? 0), 0) / withScore.length)
    : null;

  const healthTiers = { green: 0, amber: 0, red: 0 };
  for (const scan of withScore) {
    const score = scan.healthScore!;
    if (score >= 75) healthTiers.green++;
    else if (score >= 50) healthTiers.amber++;
    else healthTiers.red++;
  }

  let totalCriticalGaps = 0;
  for (const scan of completed) {
    const analysis = asJson<PulseAnalysisOutput | null>(scan.llmAnalysis, null);
    totalCriticalGaps += analysis?.criticalGaps?.filter((g) => g.urgency === "CRITICAL").length ?? 0;
  }

  return {
    totalScans: allScans.length,
    completedScans: completed.length,
    avgHealthScore,
    awaitingFollowUp: completed.filter((s: ScanSummary) => !s.generatedProposalId).length,
    totalCriticalGaps,
    healthTiers,
    recentScans: recentScansRaw.map(serializePulseScanListItem),
  };
}

/**
 * Wave E3 — Industry benchmarks. Ranks this scan's health score against other
 * COMPLETED scans of the SAME project classification type in the workspace.
 * Returns null until there are enough peers to be meaningful (≥4 others).
 */
const BENCHMARK_MIN_PEERS = 4;

export async function getIndustryBenchmarks(scanId: string): Promise<IndustryBenchmark | null> {
  const { workspace } = await ensureBaseRecords();
  const scan = await prisma.pulseScan.findFirst({
    where: { id: scanId, workspaceId: workspace.id },
    select: { id: true, status: true, healthScore: true, llmAnalysis: true },
  });
  if (!scan || scan.status !== "COMPLETED" || scan.healthScore === null) return null;

  const myType = asJson<PulseAnalysisOutput | null>(scan.llmAnalysis, null)
    ?.projectClassification?.type?.trim();
  if (!myType) return null;

  const others = await prisma.pulseScan.findMany({
    where: {
      workspaceId: workspace.id,
      status: "COMPLETED",
      healthScore: { not: null },
      id: { not: scanId },
    },
    select: { healthScore: true, llmAnalysis: true },
  });

  const peerScores: number[] = [];
  for (const o of others) {
    const t = asJson<PulseAnalysisOutput | null>(o.llmAnalysis, null)
      ?.projectClassification?.type?.trim();
    if (t && t.toLowerCase() === myType.toLowerCase() && o.healthScore !== null) {
      peerScores.push(o.healthScore);
    }
  }
  if (peerScores.length < BENCHMARK_MIN_PEERS) return null;

  peerScores.sort((a, b) => a - b);
  const your = scan.healthScore;
  const atOrAbove = peerScores.filter((s) => your >= s).length;
  return {
    projectType: myType,
    peerCount: peerScores.length,
    yourScore: your,
    percentile: Math.round((atOrAbove / peerScores.length) * 100),
    median: peerScores[Math.floor(peerScores.length / 2)],
    best: peerScores[peerScores.length - 1],
  };
}

export async function createPulseScanRecord(input: {
  projectName: string;
  inputType: "URL" | "GITHUB_REPO" | "FREE_TEXT";
  inputUrl?: string;
  inputGithubRepo?: string;
  inputDescription?: string;
  platform?: string;
  clientId?: string;
  aiProvider?: "ANTHROPIC" | "OPENAI" | "GEMINI" | "LOCAL";
  competitorUrls?: string[];
  /** Jurisdiction codes the product serves (e.g. "EU", "US-CA"). Drives the
   *  per-jurisdiction compliance scorecard + which compliance checks apply. */
  targetMarkets?: string[];
  /** User who initiated this scan — null for monitor/webhook triggers. Used by
   *  push to route the completion notification to a single user vs. the whole
   *  workspace. */
  triggeredByUserId?: string | null;
}): Promise<{ scan: PulseScanRecord; aiConfig: { provider: "ANTHROPIC" | "OPENAI" | "GEMINI" | "LOCAL"; apiKey: string | null; model: string; baseUrl: string | null } }> {
  const { workspace } = await ensureBaseRecords();
  // Use only what the workspace has explicitly configured — no silent fallbacks.
  const p = (input.aiProvider ?? workspace.aiProvider ?? "ANTHROPIC") as "ANTHROPIC" | "OPENAI" | "GEMINI" | "LOCAL";
  const aiConfig = {
    provider: p,
    apiKey: (() => {
      if (p === "OPENAI") return process.env.OPENAI_API_KEY ?? workspace.openaiApiKey ?? null;
      if (p === "GEMINI") return process.env.GEMINI_API_KEY ?? workspace.geminiApiKey ?? null;
      if (p === "LOCAL") return workspace.openaiApiKey ?? "local";
      return process.env.ANTHROPIC_API_KEY ?? workspace.anthropicApiKey ?? null;
    })(),
    model: p === "OPENAI" ? (workspace.openaiModel ?? "gpt-4o") :
           p === "GEMINI" ? (workspace.geminiModel ?? "gemini-2.0-flash") :
           p === "LOCAL" ? (workspace.localLlmModel ?? "llama3.1") :
           (workspace.anthropicModel ?? "claude-sonnet-5"),
    baseUrl: p === "GEMINI" ? "https://generativelanguage.googleapis.com/v1beta/openai/" :
             p === "LOCAL" ? (workspace.localLlmUrl ?? "http://localhost:11434/v1") :
             null,
  };

  const previousScan = input.inputType !== "FREE_TEXT"
    ? await prisma.pulseScan.findFirst({
        where: {
          workspaceId: workspace.id,
          status: "COMPLETED",
          ...(input.inputType === "URL" && input.inputUrl ? { inputUrl: input.inputUrl } : {}),
          ...(input.inputType === "GITHUB_REPO" && input.inputGithubRepo ? { inputGithubRepo: input.inputGithubRepo } : {}),
        },
        orderBy: { createdAt: "desc" },
        select: { healthScore: true },
      })
    : null;

  const scan = await prisma.pulseScan.create({
    data: {
      workspaceId: workspace.id,
      clientId: input.clientId ?? null,
      triggeredByUserId: input.triggeredByUserId ?? null,
      projectName: input.projectName,
      inputType: input.inputType,
      inputUrl: input.inputUrl ?? null,
      inputGithubRepo: input.inputGithubRepo ?? null,
      inputDescription: input.inputDescription ?? null,
      platform: input.platform ?? null,
      status: "RUNNING",
      scanVersion: SCAN_VERSION,
      previousHealthScore: previousScan?.healthScore ?? null,
      competitorUrls: input.competitorUrls && input.competitorUrls.length > 0
        ? (input.competitorUrls as unknown as Prisma.InputJsonValue)
        : Prisma.JsonNull,
      targetMarkets: input.targetMarkets && input.targetMarkets.length > 0
        ? (input.targetMarkets as unknown as Prisma.InputJsonValue)
        : Prisma.JsonNull,
    },
    include: pulseInclude,
  });

  return { scan: serializePulseScan(scan), aiConfig };
}

export async function cancelPulseScan(scanId: string): Promise<void> {
  await prisma.pulseScan.update({
    where: { id: scanId },
    data: {
      status: "FAILED",
      completedAt: new Date(),
      errorCode: "USER_CANCELLED",
      errorMessage: "Scan was cancelled.",
    },
  });
}

export async function retryPulseScan(scanId: string): Promise<{
  scan: PulseScanRecord;
  aiConfig: { provider: "ANTHROPIC" | "OPENAI" | "GEMINI" | "LOCAL"; apiKey: string | null; model: string; baseUrl: string | null };
}> {
  const existing = await prisma.pulseScan.findUnique({ where: { id: scanId } });
  if (!existing || existing.status !== "FAILED") {
    throw new Error("Only failed scans can be retried.");
  }

  const { workspace } = await ensureBaseRecords();
  const p = (workspace.aiProvider ?? "ANTHROPIC") as "ANTHROPIC" | "OPENAI" | "GEMINI" | "LOCAL";
  const aiConfig = {
    provider: p,
    apiKey: (() => {
      if (p === "OPENAI") return process.env.OPENAI_API_KEY ?? workspace.openaiApiKey ?? null;
      if (p === "GEMINI") return process.env.GEMINI_API_KEY ?? workspace.geminiApiKey ?? null;
      if (p === "LOCAL") return workspace.openaiApiKey ?? "local";
      return process.env.ANTHROPIC_API_KEY ?? workspace.anthropicApiKey ?? null;
    })(),
    model: p === "OPENAI" ? (workspace.openaiModel ?? "gpt-4o") :
           p === "GEMINI" ? (workspace.geminiModel ?? "gemini-2.0-flash") :
           p === "LOCAL" ? (workspace.localLlmModel ?? "llama3.1") :
           (workspace.anthropicModel ?? "claude-sonnet-5"),
    baseUrl: p === "GEMINI" ? "https://generativelanguage.googleapis.com/v1beta/openai/" :
             p === "LOCAL" ? (workspace.localLlmUrl ?? "http://localhost:11434/v1") :
             null,
  };

  // Delete old checks so they get recreated cleanly
  await prisma.pulseScanCheck.deleteMany({ where: { scanId } });

  const scan = await prisma.pulseScan.update({
    where: { id: scanId },
    data: {
      status: "RUNNING",
      startedAt: new Date(),
      completedAt: null,
      checksCompletedAt: null,
      healthScore: null,
      techStack: Prisma.JsonNull,
      llmAnalysis: Prisma.JsonNull,
      detectedMarkets: Prisma.JsonNull,
      complianceScorecard: Prisma.JsonNull,
      scoreBreakdown: Prisma.JsonNull,
      pricingBands: Prisma.JsonNull,
      errorCode: null,
      errorMessage: null,
    },
    include: pulseInclude,
  });

  return { scan: serializePulseScan(scan), aiConfig };
}

/**
 * Re-run just the AI analysis phase for a completed scan without re-running
 * the checks. Used by the "Regenerate AI Analysis" button in the UI.
 * Accepts an optional additionalContext string the user can provide to help
 * the AI produce better results (e.g. "This is a B2B SaaS for dental practices").
 */
export async function reanalysePulseScan(
  scanId: string,
  additionalContext?: string,
): Promise<PulseScanRecord> {
  const existing = await prisma.pulseScan.findUnique({
    where: { id: scanId },
    include: pulseInclude,
  });
  if (!existing) throw new Error("Scan not found.");
  if (existing.status !== "COMPLETED") throw new Error("Only completed scans can be re-analysed.");

  const { workspace } = await ensureBaseRecords();
  const p = (workspace.aiProvider ?? "ANTHROPIC") as "ANTHROPIC" | "OPENAI" | "GEMINI" | "LOCAL";
  const aiConfig = {
    provider: p,
    apiKey: (() => {
      if (p === "OPENAI") return process.env.OPENAI_API_KEY ?? workspace.openaiApiKey ?? null;
      if (p === "GEMINI") return process.env.GEMINI_API_KEY ?? workspace.geminiApiKey ?? null;
      if (p === "LOCAL") return workspace.openaiApiKey ?? "local";
      return process.env.ANTHROPIC_API_KEY ?? workspace.anthropicApiKey ?? null;
    })(),
    model: p === "OPENAI" ? (workspace.openaiModel ?? "gpt-4o")
         : p === "GEMINI" ? (workspace.geminiModel ?? "gemini-2.0-flash")
         : p === "LOCAL"  ? (workspace.localLlmModel ?? "llama3.1")
         : (workspace.anthropicModel ?? "claude-sonnet-5"),
    baseUrl: p === "GEMINI" ? "https://generativelanguage.googleapis.com/v1beta/openai/"
           : p === "LOCAL"  ? (workspace.localLlmUrl ?? "http://localhost:11434/v1")
           : null,
  };

  const healthScore = existing.healthScore ?? 0;
  const techStack = asJson<string[]>(existing.techStack, []);
  const checks: PulseScanCheckInput[] = existing.checks.map((c) => ({
    // Persisted rows carry historical category strings — cast to the current union.
    category: c.category as CheckCategory,
    checkKey: c.checkKey,
    label: c.label,
    status: c.status as PulseScanCheckInput["status"],
    detail: c.detail ?? undefined,
    evidence: c.evidence ?? undefined,
  }));

  // Inject additional context (if provided) by appending to inputDescription
  const inputDescription = [
    existing.inputDescription,
    additionalContext ? `\n\nAdditional context provided by user: ${additionalContext}` : null,
  ].filter(Boolean).join("") || null;

  let llmAnalysis: PulseAnalysisOutput | null = null;
  let aiError: string | null = null;

  try {
    llmAnalysis = await withTimeout(
      analyseWithClaude(
        {
          projectName: existing.projectName,
          inputType: existing.inputType as "URL" | "GITHUB_REPO" | "FREE_TEXT",
          inputUrl: existing.inputUrl,
          inputGithubRepo: existing.inputGithubRepo,
          inputDescription,
          platform: existing.platform,
          healthScore,
          techStack,
          checks,
        },
        aiConfig,
        existing.workspaceId,
      ),
      200_000,
      "AI re-analysis",
    );
  } catch (err) {
    const httpStatus = (err as { status?: number })?.status;
    const code = (err as { code?: string })?.code;
    const message = err instanceof Error ? err.message : "";
    if (message.includes("timed out")) {
      aiError = "AI analysis timed out — try again or switch to a faster model in Settings → Integrations.";
    } else if (code === "NO_API_KEY") {
      aiError = err instanceof Error ? err.message : "No API key configured.";
    } else if (httpStatus === 401 || httpStatus === 403) {
      aiError = "AI authentication failed — check your API key in Settings → Integrations.";
    } else {
      aiError = err instanceof Error ? err.message : "AI re-analysis failed.";
    }
  }

  // Regenerate discovery kit if analysis succeeded and this isn't a FREE_TEXT scan
  let discoveryKit: DiscoveryKit | null = null;
  if (llmAnalysis && existing.inputType !== "FREE_TEXT") {
    try {
      discoveryKit = await withTimeout(
        generateDiscoveryKit(
          {
            projectName: existing.projectName,
            projectType: llmAnalysis.projectClassification.type,
            healthScore,
            proposalHook: llmAnalysis.proposalHook,
            executiveSummary: llmAnalysis.executiveSummary,
            criticalGaps: llmAnalysis.criticalGaps,
            buildOpportunities: llmAnalysis.buildOpportunities,
            checks,
          },
          aiConfig,
          existing.workspaceId,
        ),
        60_000,
        "discovery kit",
      );
    } catch {
      // Discovery kit failure is non-fatal — AI analysis still shows
    }
  }

  const updated = await prisma.pulseScan.update({
    where: { id: scanId },
    data: {
      llmAnalysis: llmAnalysis ? (llmAnalysis as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
      discoveryData: discoveryKit ? (discoveryKit as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
      agentData: {
        ...((existing.agentData as object) ?? {}),
        aiError: aiError ?? undefined,
      } as unknown as Prisma.InputJsonValue,
    },
    include: pulseInclude,
  });

  return serializePulseScan(updated);
}

/** Race a promise against a hard timeout. Rejects with a clear error message if the timeout fires first. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms),
    ),
  ]);
}

export async function runAnalysis(
  scanId: string,
  input: {
    inputType: "URL" | "GITHUB_REPO" | "FREE_TEXT";
    inputUrl?: string;
    inputGithubRepo?: string;
    inputDescription?: string;
    projectName: string;
    platform?: string;
    clientId?: string;
    competitorUrls?: string[];
    testEmail?: string;
    testPassword?: string;
  },
  aiConfig: { provider: "ANTHROPIC" | "OPENAI" | "GEMINI" | "LOCAL"; apiKey: string | null; model: string; baseUrl: string | null },
) {
  try {
    // Guard: if a previous runAnalysis for this scan is somehow still running,
    // bail out early rather than corrupting results with double-writes.
    const staleScan = await prisma.pulseScan.findUnique({
      where: { id: scanId },
      select: { status: true, startedAt: true, targetMarkets: true, workspaceId: true },
    });
    if (staleScan && staleScan.status !== "RUNNING") return;
    const workspaceId = staleScan?.workspaceId;
    // User-declared markets the product serves (drives compliance filtering + scorecard).
    const declaredMarkets = (Array.isArray(staleScan?.targetMarkets) ? staleScan!.targetMarkets : [])
      .filter((m): m is string => typeof m === "string")
      .filter(isJurisdictionCode) as JurisdictionCode[];
    // If it's been RUNNING for more than 4 minutes before we even start the
    // heavy work, something went very wrong — mark it failed immediately.
    // (maxDuration = 300s, so at 4 min we've used 80% of the budget already.)
    const staleLimitMs = 4 * 60 * 1000;
    if (staleScan && Date.now() - staleScan.startedAt.getTime() > staleLimitMs) {
      await prisma.pulseScan.update({
        where: { id: scanId },
        data: {
          status: "FAILED",
          completedAt: new Date(),
          errorCode: "TIMEOUT",
          errorMessage: "Scan exceeded the 5-minute time limit and was automatically cancelled.",
        },
      });
      return;
    }

    // ─── CHECKS phase ─────────────────────────────────────────────────────────
    // Run the AI-FREE deterministic core, persisting each wave of checks as it
    // lands so SSE clients fill in live. AI is fully decoupled and runs AFTER.
    const persistChecks = async (batch: PulseScanCheckInput[]) => {
      await prisma.pulseScanCheck.createMany({
        data: batch.map((check) => ({
          scanId,
          category: check.category,
          checkKey: check.checkKey,
          label: check.label,
          status: check.status,
          detail: check.detail ?? null,
          evidence: check.evidence ?? null,
          sortOrder: check.sortOrder ?? 0,
          confidence: check.confidence ?? null,
          confidenceReason: check.confidenceReason ?? null,
          trustBucket: check.trustBucket ?? null,
        })),
      });
    };

    let allChecks: PulseScanCheckInput[];
    let techStack: string[] = [];
    let detectedMarkets: JurisdictionCode[] = [];
    let codeInsights: CodeAgentInsights | null = null;
    let deployInsights: DeployAgentInsights | null = null;
    let browserInsights: BrowserAgentInsights | null = null;
    let visualInsights: VisualAgentInsights | null = null;

    if (input.inputType === "FREE_TEXT") {
      allChecks = skipAllChecks("FREE_TEXT");
      if (allChecks.length > 0) await persistChecks(allChecks);
    } else {
      const lite = await runLiteScan({
        inputType: input.inputType,
        url: input.inputUrl,
        githubRepo: input.inputGithubRepo,
        platform: input.platform,
        includePageSpeed: true,
        skipUrlGuard: true, // internal team scans (may target platform subdomains)
        targetMarkets: declaredMarkets.length > 0 ? declaredMarkets : undefined,
        onChecks: persistChecks,
      });
      allChecks = lite.checks;
      techStack = lite.techStack;
      codeInsights = lite.codeInsights;
      deployInsights = lite.deployInsights;
      browserInsights = lite.browserInsights;
      detectedMarkets = lite.detectedMarkets;
    }

    const healthScore = calculateHealthScore(allChecks);
    // Jurisdiction compliance: effective markets = declared (authoritative) else
    // auto-detected. Scorecard + score breakdown are deterministic (no AI).
    const effectiveMarkets = resolveTargetMarkets(declaredMarkets, detectedMarkets).effective;
    const complianceScorecard = computeComplianceScorecard(allChecks, effectiveMarkets);
    const scoreBreakdown = computeScoreBreakdown(allChecks);

    // Compute AI Maturity Score (0–4) from AI Readiness check pass rate.
    // Only set when AI Readiness checks actually ran (not all SKIPPED).
    const aiReadinessChecks = allChecks.filter(
      (c) => c.category === "AI Readiness" && c.status !== "SKIPPED",
    );
    const aiMaturityScore: number | null =
      aiReadinessChecks.length > 0
        ? (() => {
            const passes = aiReadinessChecks.filter((c) => c.status === "PASS").length;
            if (passes <= 2) return 0;
            if (passes <= 4) return 1;
            if (passes <= 6) return 2;
            if (passes <= 8) return 3;
            return 4;
          })()
        : null;

    // Mark the deterministic phase done. status stays RUNNING — the UI now shows
    // the full checks view + a "checks complete, AI analysis running" state,
    // instead of waiting for the LLM. Browser/PSI checks are already persisted.
    const beforeAnalyse = await prisma.pulseScan.findUnique({ where: { id: scanId }, select: { status: true } });
    if (beforeAnalyse?.status !== "RUNNING") return;
    await prisma.pulseScan.update({
      where: { id: scanId },
      data: {
        healthScore,
        checksCompletedAt: new Date(),
        techStack: techStack as unknown as Prisma.InputJsonValue,
        agentData: { codeInsights, deployInsights, browserInsights } as unknown as Prisma.InputJsonValue,
        detectedMarkets: detectedMarkets.length > 0 ? (detectedMarkets as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
        complianceScorecard: complianceScorecard.length > 0 ? (complianceScorecard as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
        scoreBreakdown: scoreBreakdown as unknown as Prisma.InputJsonValue,
      },
    });

    // Wave D1 — Visual Quality scan (best-effort). Kick off now so its screenshot +
    // vision call run concurrently with the AI synthesis below; awaited before the
    // final persist. URL scans only; gated to the Anthropic provider inside the agent.
    const visualPromise: Promise<VisualAgentInsights | null> =
      input.inputType === "URL" && input.inputUrl
        ? runVisualAgent(input.inputUrl, aiConfig, workspaceId).catch(() => null)
        : Promise.resolve(null);

    // ─── ANALYSING phase ──────────────────────────────────────────────────────
    // Competitor scans (deterministic) run in parallel with AI synthesis below.
    const competitorScanPromise: Promise<CompetitorScanSummary[]> =
      input.competitorUrls && input.competitorUrls.length > 0
        ? Promise.all(
            input.competitorUrls.map(async (url) => {
              try {
                let resolvedUrl = url.trim();
                if (!/^https?:\/\//i.test(resolvedUrl)) resolvedUrl = `https://${resolvedUrl}`;
                const result = await withTimeout(runUrlChecks(resolvedUrl), 90_000, `competitor scan for ${resolvedUrl}`);
                const score = calculateHealthScore(result.checks);
                const pass = result.checks.filter((c) => c.status === "PASS").length;
                const warn = result.checks.filter((c) => c.status === "WARN").length;
                const fail = result.checks.filter((c) => c.status === "FAIL").length;
                return { url: resolvedUrl, healthScore: score, checksPass: pass, checksWarn: warn, checksFail: fail, techStack: result.techStack };
              } catch {
                return { url, healthScore: 0, checksPass: 0, checksWarn: 0, checksFail: 0, techStack: [] };
              }
            }),
          )
        : Promise.resolve([]);

    // Auth scan — if test credentials provided, log in and capture authenticated content.
    // This runs in parallel with competitor work via Promise.all below.
    // Credentials are NEVER stored — only the extracted page content is passed to the AI.
    let authContent: string | null = null;
    if (input.testEmail && input.testPassword && input.inputType === "URL" && input.inputUrl) {
      try {
        const authResult = await withTimeout(
          runAuthAgent(input.inputUrl, input.testEmail, input.testPassword),
          28_000,
          "Auth scan",
        );
        if (authResult) {
          authContent = [
            authResult.pageTitle ? `Authenticated page title: "${authResult.pageTitle}"` : null,
            authResult.h1 ? `Main heading (h1): "${authResult.h1}"` : null,
            authResult.navItems.length > 0 ? `Navigation: ${authResult.navItems.slice(0, 10).join(" · ")}` : null,
            authResult.mainText ? `Page content: ${authResult.mainText}` : null,
            `Authenticated URL: ${authResult.authenticatedUrl}`,
          ].filter(Boolean).join("\n");
        }
      } catch {
        // Auth scan is best-effort — never let it block the main scan
      }
    }

    // Wrap the LLM call so a bad key / wrong model / no key / timeout never
    // wipes out the Phase 1 checks. On failure analysis is null (no mock shown).
    // Hard limit: 200s — covers Opus on a slow API day (typically 90-160s for full response).
    async function safeAnalyse(): Promise<{ analysis: PulseAnalysisOutput | null; aiError: string | null }> {
      try {
        const analysis = await withTimeout(
          analyseWithClaude(
            {
              projectName: input.projectName,
              inputType: input.inputType,
              inputUrl: input.inputUrl ?? null,
              inputGithubRepo: input.inputGithubRepo ?? null,
              inputDescription: input.inputDescription ?? null,
              platform: input.platform ?? null,
              healthScore,
              techStack,
              checks: allChecks,
              authContent,
            },
            aiConfig,
            workspaceId,
          ),
          200_000,
          "AI analysis",
        );
        return { analysis, aiError: null };
      } catch (err) {
        const httpStatus = (err as { status?: number })?.status;
        const code = (err as { code?: string })?.code;
        const message = err instanceof Error ? err.message : "";
        let aiError: string;
        if (message.includes("timed out")) {
          aiError = "AI analysis timed out — the API took too long to respond. Technical checks and scores are accurate. Try re-running or switching to a faster model (claude-sonnet) in Settings → Integrations.";
        } else if (code === "NO_API_KEY") {
          aiError = err instanceof Error ? err.message : "No API key configured.";
        } else if (httpStatus === 401 || httpStatus === 403) {
          aiError = "AI authentication failed — check your API key in Settings → Integrations.";
        } else if (httpStatus === 404) {
          aiError = `AI model not found — '${aiConfig.model}' is not a valid model ID for ${aiConfig.provider}. Update the model name in Settings → Integrations.`;
        } else if (httpStatus === 429) {
          aiError = "AI rate limit hit — quota exhausted. Wait a minute or switch to a different provider in Settings.";
        } else {
          aiError = err instanceof Error ? err.message : "AI analysis unavailable.";
        }
        return { analysis: null, aiError };
      }
    }

    const [{ analysis: llmAnalysis, aiError }, competitorScans] = await Promise.all([
      safeAnalyse(),
      withTimeout(competitorScanPromise, 120_000, "competitor scans").catch(() => [] as CompetitorScanSummary[]),
    ]);

    // Discovery kit and competitor comparison require a successful LLM analysis.
    const runDiscovery = input.inputType !== "FREE_TEXT" && llmAnalysis !== null;

    const [discoveryKit, competitorComparison] = await Promise.all([
      runDiscovery
        ? withTimeout(
            generateDiscoveryKit(
              {
                projectName: input.projectName,
                projectType: llmAnalysis!.projectClassification.type,
                healthScore,
                proposalHook: llmAnalysis!.proposalHook,
                executiveSummary: llmAnalysis!.executiveSummary,
                criticalGaps: llmAnalysis!.criticalGaps,
                buildOpportunities: llmAnalysis!.buildOpportunities,
                checks: allChecks,
              },
              aiConfig,
              workspaceId,
            ),
            60_000,
            "discovery kit",
          ).catch(() => null)
        : Promise.resolve(null),
      competitorScans.length > 0 && llmAnalysis !== null
        ? withTimeout(
            generateCompetitorComparison(
              { projectName: input.projectName, mainScore: healthScore, mainTechStack: techStack, competitors: competitorScans },
              aiConfig,
              workspaceId,
            ),
            45_000,
            "competitor comparison",
          ).catch(() => null)
        : Promise.resolve(null),
    ]);

    const competitorData: CompetitorData | null =
      competitorScans.length > 0
        ? { scans: competitorScans, comparison: competitorComparison }
        : null;

    // Visual scan resolves alongside the AI synthesis — collect it (best-effort).
    visualInsights = await visualPromise;

    // Phase 2: persist AI analysis and mark COMPLETED. Deterministic checks +
    // browser/PSI checks were already persisted incrementally in the CHECKS phase.
    const current = await prisma.pulseScan.findUnique({
      where: { id: scanId },
      select: { status: true, workspaceId: true, workspace: { select: { pulsePricingConfig: true } } },
    });
    if (current?.status !== "RUNNING") return;

    // Deterministic dev-tier pricing bands from the AI effort estimate (GBP, rate-card-grounded).
    let pricingBands: PricingBand[] = [];
    if (llmAnalysis?.engagementEstimate && current.workspaceId) {
      pricingBands = await computePricingBandsForWorkspace(
        current.workspaceId,
        current.workspace?.pulsePricingConfig ?? null,
        llmAnalysis.engagementEstimate,
      ).catch(() => []);
    }

    await prisma.pulseScan.update({
      where: { id: scanId },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        llmAnalysis: llmAnalysis
          ? ({ ...llmAnalysis, ...(aiMaturityScore !== null ? { aiMaturityScore } : {}) } as unknown as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        discoveryData: discoveryKit ? (discoveryKit as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
        competitorData: competitorData ? (competitorData as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
        pricingBands: pricingBands.length > 0 ? (pricingBands as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
        agentData: { codeInsights, deployInsights, browserInsights, visualInsights, aiError: aiError ?? undefined, ...(authContent ? { authContent } : {}) } as unknown as Prisma.InputJsonValue,
      },
    });

    // Scan → Action reconciliation: if this scan is linked to a client, any
    // open task created from a check that now PASSes is auto-closed. Best-effort
    // — never let it fail the scan write. Matched by metadata.pulseCheckKey.
    if (input.clientId) {
      try {
        const scanMeta = await prisma.pulseScan.findUnique({
          where: { id: scanId },
          select: { workspaceId: true },
        });
        if (scanMeta) {
          const passingKeys = allChecks.filter((c) => c.status === "PASS").map((c) => c.checkKey);
          await reconcilePulseTasksAfterScan(scanMeta.workspaceId, input.clientId, passingKeys);
        }
      } catch {
        // best-effort
      }
    }

    // Push notification — best-effort, must not throw or the scan write looks
    // failed to the caller. Audience is the triggering user (manual scan) or
    // the whole workspace (monitor/webhook scan).
    try {
      const finalScan = await prisma.pulseScan.findUnique({
        where: { id: scanId },
        select: {
          id: true,
          workspaceId: true,
          triggeredByUserId: true,
          projectName: true,
          healthScore: true,
          previousHealthScore: true,
          checks: { where: { status: "FAIL" }, select: { id: true } },
        },
      });
      if (finalScan) {
        await sendPulseScanCompletedPush({
          scanId: finalScan.id,
          workspaceId: finalScan.workspaceId,
          triggeredByUserId: finalScan.triggeredByUserId,
          projectName: finalScan.projectName,
          healthScore: finalScan.healthScore,
          previousHealthScore: finalScan.previousHealthScore,
          failedCheckCount: finalScan.checks.length,
        });
      }
    } catch (pushError) {
      console.warn("[pulse] scan-completed push failed", pushError);
    }
  } catch (error) {
    const current = await prisma.pulseScan.findUnique({ where: { id: scanId }, select: { status: true } });
    if (current?.status !== "RUNNING") return;

    const httpStatus = (error as { status?: number })?.status;
    let errorCode = "ANALYSIS_FAILED";
    let message: string;

    if (httpStatus === 429) {
      errorCode = "RATE_LIMITED";
      message = "AI rate limit hit — your API quota is exhausted. Wait a minute and try again, or switch to a different AI provider in Settings.";
    } else if (httpStatus === 401 || httpStatus === 403) {
      errorCode = "AUTH_FAILED";
      message = "AI authentication failed — check your API key in Settings → Integrations.";
    } else {
      message = error instanceof Error ? error.message : "Unknown error";
    }

    await prisma.pulseScan.update({
      where: { id: scanId },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        errorCode,
        errorMessage: message,
      },
    });

    // Push notification for scan failure — best-effort, same audience logic.
    try {
      const failedScan = await prisma.pulseScan.findUnique({
        where: { id: scanId },
        select: {
          id: true,
          workspaceId: true,
          triggeredByUserId: true,
          projectName: true,
          errorMessage: true,
        },
      });
      if (failedScan) {
        await sendPulseScanFailedPush({
          scanId: failedScan.id,
          workspaceId: failedScan.workspaceId,
          triggeredByUserId: failedScan.triggeredByUserId,
          projectName: failedScan.projectName,
          errorMessage: failedScan.errorMessage,
        });
        dispatchNotification({
          event: "pulse.scan_failed",
          workspaceId: failedScan.workspaceId,
          target: failedScan.triggeredByUserId
            ? { kind: "users", userIds: [failedScan.triggeredByUserId] }
            : { kind: "permission", permission: "pulse.manage" },
          title: `${failedScan.projectName} — scan failed`,
          body: failedScan.errorMessage?.slice(0, 140) ?? null,
          actionUrl: `/app/pulse/${failedScan.id}/report`,
          groupKey: `pulse.scan_failed:${failedScan.id}`,
        });
      }
    } catch (pushError) {
      console.warn("[pulse] scan-failed push failed", pushError);
    }
  }
}


export async function generateProposalFromScan(scanId: string): Promise<string> {
  const scan = await prisma.pulseScan.findUnique({
    where: { id: scanId },
    include: { client: { select: { name: true } } },
  });

  if (!scan || scan.status !== "COMPLETED") {
    throw new Error("Scan not found or not yet completed.");
  }

  if (scan.generatedProposalId) {
    return scan.generatedProposalId;
  }

  const { workspace, user, template } = await ensureBaseRecords();

  const llm = asJson<PulseAnalysisOutput | null>(scan.llmAnalysis, null);

  const pricingBands = asJson<PricingBand[] | null>(scan.pricingBands, null);
  const sectionPayload = buildSectionPayload(scan, llm);
  const costPayload = buildCostPayload(llm, pricingBands);
  const timelinePayload = buildTimelinePayload(llm);

  const document = await prisma.document.create({
    data: {
      workspaceId: workspace.id,
      ownerId: user.id,
      templateId: template.id,
      documentType: "PROPOSAL",
      status: "DRAFT",
      title: `${scan.projectName} — Pulse Proposal`,
      productName: scan.projectName,
      clientName: scan.client?.name ?? null,
      summary: llm?.executiveSummary ?? "",
      version: "v1.0",
      metadata: {
        client: scan.client?.name ?? "",
        owner: user.name ?? "",
        version: "v1.0",
        notes: "",
        internalComments: `Auto-generated from Pulse scan ${scanId}`,
        productSignOff: false,
        techSignOff: false,
        approvalChecked: false,
      } as unknown as Prisma.InputJsonValue,
      sections: { create: sectionPayload },
      costLineItems: costPayload.length > 0 ? { create: costPayload } : { create: getDefaultCostsPayload() },
      timelinePhases: timelinePayload.length > 0 ? { create: timelinePayload } : { create: getDefaultTimelinePayload() },
      links: { create: getDefaultLinkPayload() },
      ctas: { create: getDefaultCtaPayload() },
      assets: { create: getDefaultAssetPayload() },
    },
  });

  await prisma.pulseScan.update({
    where: { id: scanId },
    data: { generatedProposalId: document.id },
  });

  return document.id;
}

function buildSectionPayload(
  scan: { projectName: string; inputUrl: string | null; inputGithubRepo: string | null; healthScore: number | null; techStack: Prisma.JsonValue },
  llm: PulseAnalysisOutput | null,
): Prisma.DocumentSectionCreateWithoutDocumentInput[] {
  const techStack = asJson<string[]>(scan.techStack, []);

  const defaultSections = getDefaultSectionPayload();

  const overrides: Record<string, Record<string, unknown>> = {
    cover: {
      proposalTitle: `${scan.projectName} — Development Proposal`,
      productName: scan.projectName,
      subtitle: "Prepared by Gitwork",
    },
    introduction: {
      statement: llm?.proposalHook ?? `We've completed a technical audit of ${scan.projectName} and identified clear opportunities to strengthen and scale the product.`,
      summary: llm?.executiveSummary ?? "",
    },
    product_overview: {
      platformDescription: llm?.healthNarrative ?? `${scan.projectName} is a product that has been audited using Gitwork Pulse.`,
      audience: "",
      valueProposition: llm?.buildOpportunities?.[0]?.description ?? "",
    },
  };

  const sections: Prisma.DocumentSectionCreateWithoutDocumentInput[] = defaultSections.map((s) => {
    const data = overrides[s.key] ? { ...(s.data as Record<string, unknown>), ...overrides[s.key] } : s.data;
    return { ...s, data: data as unknown as Prisma.InputJsonValue };
  });

  // Add a Pulse Audit Results section after product_overview
  const insertAfter = sections.findIndex((s) => (s.data as Record<string, unknown>)?.platformDescription !== undefined);
  const auditSection: Prisma.DocumentSectionCreateWithoutDocumentInput = {
    key: "audit_results" as string,
    title: "Audit Results",
    description: "Health check findings from Gitwork Pulse.",
    sortOrder: insertAfter >= 0 ? insertAfter + 1 : 3,
    isVisible: true,
    data: {
      healthScore: scan.healthScore ?? 0,
      techStack,
      projectUrl: scan.inputUrl ?? scan.inputGithubRepo ?? "",
      criticalGaps: llm?.criticalGaps?.slice(0, 6) ?? [],
      strengths: llm?.strengths?.slice(0, 4) ?? [],
      techDebt: llm?.techDebt?.slice(0, 4) ?? [],
    } as unknown as Prisma.InputJsonValue,
  };

  // Re-sort
  sections.splice(insertAfter >= 0 ? insertAfter + 1 : 3, 0, auditSection);
  return sections.map((s, i) => ({ ...s, sortOrder: i }));
}

function buildCostPayload(
  llm: PulseAnalysisOutput | null,
  pricingBands?: PricingBand[] | null,
): Prisma.CostLineItemCreateWithoutDocumentInput[] {
  const items: Prisma.CostLineItemCreateWithoutDocumentInput[] = [];

  // Seed a real engagement line from the deterministic pricing band (default 2 devs)
  // — days @ blended day rate — so the proposal opens with a defensible number
  // instead of £0. The opportunity lines below become £0 scope/inclusions.
  const band = pricingBands?.find((b) => b.devs === 2) ?? pricingBands?.[0];
  if (band && band.blendedDayRateGbp > 0) {
    const midPrice = Math.round((band.priceLowGbp + band.priceHighGbp) / 2);
    const days = Math.max(1, Math.round(midPrice / band.blendedDayRateGbp));
    items.push({
      category: "Engagement",
      itemName: `Pulse engagement — ${band.devs} dev${band.devs > 1 ? "s" : ""} · ~${band.weeksLow}–${band.weeksHigh} wks`,
      description: `Indicative from the Pulse scan: ${band.devs}-developer team to take this product to production. ${days} dev-days @ £${band.blendedDayRateGbp}/day (blended). Refine scope before sending.`,
      quantity: new Prisma.Decimal(days),
      unitCost: new Prisma.Decimal(band.blendedDayRateGbp),
      subtotal: new Prisma.Decimal(days * band.blendedDayRateGbp),
      costKind: "ONE_OFF" as const,
      sortOrder: 0,
    });
  }

  if (llm?.buildOpportunities?.length) {
    const sorted = [...llm.buildOpportunities].sort((a, b) => {
      const bv = { HIGH: 3, MEDIUM: 2, LOW: 1 };
      return (bv[b.businessValue] ?? 0) - (bv[a.businessValue] ?? 0);
    });
    sorted.slice(0, 8).forEach((opp, i) => {
      items.push({
        category: opp.category,
        itemName: opp.title,
        description: opp.description,
        quantity: new Prisma.Decimal(1),
        unitCost: new Prisma.Decimal(0),
        subtotal: new Prisma.Decimal(0),
        costKind: "ONE_OFF" as const,
        sortOrder: items.length + i,
      });
    });
  }

  return items;
}

function buildTimelinePayload(llm: PulseAnalysisOutput | null): Prisma.TimelinePhaseCreateWithoutDocumentInput[] {
  if (!llm?.scalingRoadmap?.length) return [];

  return llm.scalingRoadmap.map((phase, i) => ({
    name: phase.title,
    duration: phase.duration,
    summary: `Phase ${phase.phase}: ${phase.title}`,
    deliverables: phase.goals as unknown as Prisma.InputJsonValue,
    sortOrder: i,
    viewMode: "LIST" as const,
  }));
}
