import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
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
import { calculateHealthScore, SCAN_VERSION } from "@/server/pulse-scan";
import { analyseWithClaude, generateDiscoveryKit, generateCompetitorComparison, getMockAnalysis } from "@/server/pulse-ai";
import { runOrchestratedScan } from "@/server/pulse-agents/orchestrator";
import { runBrowserAgent } from "@/server/pulse-agents/browser-agent";
import { runUrlChecks } from "@/server/pulse-scan";
import type {
  PulseScanRecord,
  PulseScanListItem,
  PulseScanCheckInput,
  PulseAnalysisOutput,
  DiscoveryKit,
  CodeAgentInsights,
  DeployAgentInsights,
  BrowserAgentInsights,
  CompetitorData,
  CompetitorScanSummary,
} from "@/types/pulse";

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
    status: record.status,
    scanVersion: record.scanVersion,
    startedAt: record.startedAt.toISOString(),
    completedAt: record.completedAt?.toISOString() ?? null,
    healthScore: record.healthScore,
    previousHealthScore: record.previousHealthScore ?? null,
    techStack: asJson<string[] | null>(record.techStack, null),
    llmAnalysis: asJson<PulseAnalysisOutput | null>(record.llmAnalysis, null),
    discoveryKit: (record.discoveryData as DiscoveryKit | null) ?? null,
    codeInsights: ((record.agentData as { codeInsights?: CodeAgentInsights | null } | null)?.codeInsights) ?? null,
    deployInsights: ((record.agentData as { deployInsights?: DeployAgentInsights | null } | null)?.deployInsights) ?? null,
    browserInsights: ((record.agentData as { browserInsights?: BrowserAgentInsights | null } | null)?.browserInsights) ?? null,
    aiError: ((record.agentData as { aiError?: string | null } | null)?.aiError) ?? null,
    competitorUrls: asJson<string[] | null>(record.competitorUrls, null),
    competitorData: asJson<CompetitorData | null>(record.competitorData, null),
    shareToken: record.shareToken,
    isShared: record.isShared,
    errorCode: record.errorCode,
    errorMessage: record.errorMessage,
    generatedProposalId: record.generatedProposalId,
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

export async function listPulseScans(params?: { clientId?: string }): Promise<PulseScanListItem[]> {
  const workspace = await prisma.workspace.findFirst({
    where: { slug: DEFAULT_WORKSPACE_SLUG },
    select: { id: true },
  });
  if (!workspace) return [];

  const scans = await prisma.pulseScan.findMany({
    where: {
      workspaceId: workspace.id,
      ...(params?.clientId ? { clientId: params.clientId } : {}),
    },
    include: {
      client: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return scans.map(serializePulseScanListItem);
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
}): Promise<{ scan: PulseScanRecord; aiConfig: { provider: "ANTHROPIC" | "OPENAI" | "GEMINI" | "LOCAL"; apiKey: string | null; model: string; baseUrl: string | null } }> {
  const { workspace } = await ensureBaseRecords();
  // Use the per-scan override if provided, otherwise fall back to the workspace default
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
           p === "GEMINI" ? (workspace.geminiModel ?? "gemini-1.5-flash") :
           p === "LOCAL" ? (workspace.localLlmModel ?? "llama3.1") :
           (workspace.anthropicModel ?? "claude-sonnet-4-6"),
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
           p === "GEMINI" ? (workspace.geminiModel ?? "gemini-1.5-flash") :
           p === "LOCAL" ? (workspace.localLlmModel ?? "llama3.1") :
           (workspace.anthropicModel ?? "claude-sonnet-4-6"),
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
      healthScore: null,
      techStack: Prisma.JsonNull,
      llmAnalysis: Prisma.JsonNull,
      errorCode: null,
      errorMessage: null,
    },
    include: pulseInclude,
  });

  return { scan: serializePulseScan(scan), aiConfig };
}

export async function runAnalysis(
  scanId: string,
  input: {
    inputType: "URL" | "GITHUB_REPO" | "FREE_TEXT";
    inputUrl?: string;
    inputGithubRepo?: string;
    inputDescription?: string;
    projectName: string;
    clientId?: string;
    competitorUrls?: string[];
  },
  aiConfig: { provider: "ANTHROPIC" | "OPENAI" | "GEMINI" | "LOCAL"; apiKey: string | null; model: string; baseUrl: string | null },
) {
  try {
    // Multi-agent orchestrated scan (parallel where possible)
    const scanResult = await runOrchestratedScan({
      inputType: input.inputType,
      inputUrl: input.inputUrl,
      inputGithubRepo: input.inputGithubRepo,
      inputDescription: input.inputDescription,
    });

    const { checks: allChecks, techStack, codeInsights, deployInsights } = scanResult;
    const healthScore = calculateHealthScore(allChecks);

    // Phase 1: persist checks + lightweight fields immediately so SSE clients
    // can show check results while the AI synthesis is still running.
    const currentBefore = await prisma.pulseScan.findUnique({ where: { id: scanId }, select: { status: true } });
    if (currentBefore?.status !== "RUNNING") return;

    await prisma.pulseScanCheck.createMany({
      data: allChecks.map((check, i) => ({
        scanId,
        category: check.category,
        checkKey: check.checkKey,
        label: check.label,
        status: check.status,
        detail: check.detail ?? null,
        evidence: check.evidence ?? null,
        sortOrder: check.sortOrder ?? i,
      })),
    });
    await prisma.pulseScan.update({
      where: { id: scanId },
      data: {
        healthScore,
        techStack: techStack as unknown as Prisma.InputJsonValue,
        agentData: { codeInsights, deployInsights } as unknown as Prisma.InputJsonValue,
      },
    });

    // Run competitor URL checks in parallel with AI synthesis (both start now)
    const competitorScanPromise: Promise<CompetitorScanSummary[]> =
      input.competitorUrls && input.competitorUrls.length > 0
        ? Promise.all(
            input.competitorUrls.map(async (url) => {
              try {
                let resolvedUrl = url.trim();
                if (!/^https?:\/\//i.test(resolvedUrl)) resolvedUrl = `https://${resolvedUrl}`;
                const result = await runUrlChecks(resolvedUrl);
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

    // Browser agent (PageSpeed Insights — slow, ~30s) runs in parallel with AI
    // so fast checks still stream to the client within 8-10s of scan start.
    const browserAgentPromise =
      input.inputType === "URL" && input.inputUrl
        ? runBrowserAgent(input.inputUrl)
        : Promise.resolve({ checks: [] as PulseScanCheckInput[], insights: null });

    // Wrap the LLM call so a bad API key / wrong model name doesn't wipe out
    // the Phase 1 checks we already saved.  On failure we fall back to mock
    // analysis (clearly labelled) and store the error so it shows in the UI.
    async function safeAnalyse() {
      try {
        return { analysis: await analyseWithClaude(
          {
            projectName: input.projectName,
            inputType: input.inputType,
            inputUrl: input.inputUrl ?? null,
            inputGithubRepo: input.inputGithubRepo ?? null,
            inputDescription: input.inputDescription ?? null,
            healthScore,
            techStack,
            checks: allChecks,
          },
          aiConfig,
        ), aiError: null };
      } catch (err) {
        const httpStatus = (err as { status?: number })?.status;
        let aiError: string;
        if (httpStatus === 401 || httpStatus === 403) {
          aiError = "AI authentication failed — check your API key in Settings → Integrations.";
        } else if (httpStatus === 404) {
          aiError = `AI model not found — '${aiConfig.model}' is not a valid model ID for ${aiConfig.provider}. Update the model name in Settings → Integrations.`;
        } else if (httpStatus === 429) {
          aiError = "AI rate limit hit — quota exhausted. Wait a minute or switch to a different provider in Settings.";
        } else {
          aiError = err instanceof Error ? err.message : "AI analysis unavailable.";
        }
        return { analysis: getMockAnalysis({ projectName: input.projectName, healthScore }), aiError };
      }
    }

    const [{ analysis: llmAnalysis, aiError }, competitorScans, browserResult] = await Promise.all([
      safeAnalyse(),
      competitorScanPromise,
      browserAgentPromise,
    ]);

    // Discovery kit: skip for FREE_TEXT scans — no URL/repo data to act on
    const runDiscovery = input.inputType !== "FREE_TEXT";

    const [discoveryKit, competitorComparison] = await Promise.all([
      runDiscovery
        ? generateDiscoveryKit(
            {
              projectName: input.projectName,
              projectType: llmAnalysis.projectClassification.type,
              healthScore,
              proposalHook: llmAnalysis.proposalHook,
              executiveSummary: llmAnalysis.executiveSummary,
              criticalGaps: llmAnalysis.criticalGaps,
              buildOpportunities: llmAnalysis.buildOpportunities,
              checks: allChecks,
            },
            aiConfig,
          )
        : Promise.resolve(null),
      competitorScans.length > 0
        ? generateCompetitorComparison(
            { projectName: input.projectName, mainScore: healthScore, mainTechStack: techStack, competitors: competitorScans },
            aiConfig,
          )
        : Promise.resolve(null),
    ]);

    const competitorData: CompetitorData | null =
      competitorScans.length > 0
        ? { scans: competitorScans, comparison: competitorComparison }
        : null;

    // Phase 2: persist AI analysis + browser insights and mark COMPLETED
    const current = await prisma.pulseScan.findUnique({ where: { id: scanId }, select: { status: true } });
    if (current?.status !== "RUNNING") return;

    // Add browser checks to DB (they arrive after Phase 1 fast checks)
    if (browserResult.checks.length > 0) {
      const existingKeys = new Set(allChecks.map((c) => c.checkKey));
      const newBrowserChecks = browserResult.checks.filter((c) => !existingKeys.has(c.checkKey));
      if (newBrowserChecks.length > 0) {
        await prisma.pulseScanCheck.createMany({
          data: newBrowserChecks.map((check, i) => ({
            scanId,
            category: check.category,
            checkKey: check.checkKey,
            label: check.label,
            status: check.status,
            detail: check.detail ?? null,
            evidence: check.evidence ?? null,
            sortOrder: (allChecks.length + i),
          })),
        });
      }
    }

    await prisma.pulseScan.update({
      where: { id: scanId },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        llmAnalysis: llmAnalysis as unknown as Prisma.InputJsonValue,
        discoveryData: discoveryKit ? (discoveryKit as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
        competitorData: competitorData ? (competitorData as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
        agentData: { codeInsights, deployInsights, browserInsights: browserResult.insights, aiError: aiError ?? undefined } as unknown as Prisma.InputJsonValue,
      },
    });
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

  const sectionPayload = buildSectionPayload(scan, llm);
  const costPayload = buildCostPayload(llm);
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

function buildCostPayload(llm: PulseAnalysisOutput | null): Prisma.CostLineItemCreateWithoutDocumentInput[] {
  if (!llm?.buildOpportunities?.length) return [];

  const sorted = [...llm.buildOpportunities].sort((a, b) => {
    const bv = { HIGH: 3, MEDIUM: 2, LOW: 1 };
    return (bv[b.businessValue] ?? 0) - (bv[a.businessValue] ?? 0);
  });

  return sorted.slice(0, 8).map((opp, i) => ({
    category: opp.category,
    itemName: opp.title,
    description: opp.description,
    quantity: new Prisma.Decimal(1),
    unitCost: new Prisma.Decimal(0),
    subtotal: new Prisma.Decimal(0),
    costKind: "ONE_OFF" as const,
    sortOrder: i,
  }));
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
