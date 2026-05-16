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
import { runUrlChecks, runGithubChecks, skipAllChecks, calculateHealthScore, SCAN_VERSION } from "@/server/pulse-scan";
import { analyseWithClaude } from "@/server/pulse-ai";
import type {
  PulseScanRecord,
  PulseScanListItem,
  PulseScanCheckInput,
  PulseAnalysisOutput,
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
  proposalsGenerated: number;
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
      proposalsGenerated: 0,
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
    proposalsGenerated: (allScans as ScanSummary[]).filter((s: ScanSummary) => Boolean(s.generatedProposalId)).length,
    totalCriticalGaps,
    healthTiers,
    recentScans: recentScansRaw.map(serializePulseScanListItem),
  };
}

export async function createAndRunPulseScan(input: {
  projectName: string;
  inputType: "URL" | "GITHUB_REPO" | "FREE_TEXT";
  inputUrl?: string;
  inputGithubRepo?: string;
  inputDescription?: string;
  clientId?: string;
}): Promise<PulseScanRecord> {
  const { workspace } = await ensureBaseRecords();
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY ?? workspace.anthropicApiKey ?? null;

  // Look up the most recent completed scan for the same URL/repo to track score delta
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

  // Create the scan record in RUNNING state
  const scan = await prisma.pulseScan.create({
    data: {
      workspaceId: workspace.id,
      clientId: input.clientId ?? null,
      projectName: input.projectName,
      inputType: input.inputType,
      inputUrl: input.inputUrl ?? null,
      inputGithubRepo: input.inputGithubRepo ?? null,
      inputDescription: input.inputDescription ?? null,
      status: "RUNNING",
      scanVersion: SCAN_VERSION,
      previousHealthScore: previousScan?.healthScore ?? null,
    },
    include: pulseInclude,
  });

  // Run analysis — errors update the record to FAILED
  runAnalysis(scan.id, input, anthropicApiKey).catch(() => {
    // Error is handled inside runAnalysis
  });

  return serializePulseScan(scan);
}

async function runAnalysis(
  scanId: string,
  input: {
    inputType: "URL" | "GITHUB_REPO" | "FREE_TEXT";
    inputUrl?: string;
    inputGithubRepo?: string;
    inputDescription?: string;
    projectName: string;
    clientId?: string;
  },
  anthropicApiKey: string | null,
) {
  try {
    let urlChecks: PulseScanCheckInput[] = [];
    let githubChecks: PulseScanCheckInput[] = [];
    let techStack: string[] = [];

    if (input.inputType === "URL" && input.inputUrl) {
      const urlResult = await runUrlChecks(input.inputUrl);
      urlChecks = urlResult.checks;
      techStack = urlResult.techStack;
    } else if (input.inputType === "GITHUB_REPO" && input.inputGithubRepo) {
      const githubResult = await runGithubChecks(input.inputGithubRepo);
      githubChecks = githubResult.checks;
      techStack = githubResult.techStack;
    } else {
      urlChecks = skipAllChecks("FREE_TEXT");
    }

    const allChecks = [...urlChecks, ...githubChecks];
    const healthScore = calculateHealthScore(allChecks);

    const llmAnalysis = await analyseWithClaude(
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
      anthropicApiKey,
    );

    await prisma.pulseScan.update({
      where: { id: scanId },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        healthScore,
        techStack: techStack as unknown as Prisma.InputJsonValue,
        llmAnalysis: llmAnalysis as unknown as Prisma.InputJsonValue,
        checks: {
          create: allChecks.map((check) => ({
            category: check.category,
            checkKey: check.checkKey,
            label: check.label,
            status: check.status,
            detail: check.detail ?? null,
            evidence: check.evidence ?? null,
            sortOrder: check.sortOrder ?? 0,
          })),
        },
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await prisma.pulseScan.update({
      where: { id: scanId },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        errorCode: "ANALYSIS_FAILED",
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
