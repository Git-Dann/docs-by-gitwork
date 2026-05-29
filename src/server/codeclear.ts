import { Prisma, type PrismaClient, type RateCardPerson } from "@prisma/client";
import type {
  CandidateSignalSource,
  CodeClearActivityRecord,
  CodeClearCandidateDetail,
  CodeClearCandidateListItem,
  CodeClearScoreDraftRecord,
  CodeClearScoreRecord,
  CodeClearStatsResponse,
  GitHubAnalysisRunRecord,
  IdentityConfidence,
  PipelineStatus,
} from "@/types/codeclear";
import { deriveCandidateAnalysisState } from "@/types/codeclear";
import { computeOverallCalibre, effectiveTier } from "@/server/codeclear-scoring";

type SeedCodeClearCandidate = {
  name: string;
  githubHandle: string;
  email?: string;
  primaryStack: string;
  techStacks?: string[];
  signalSources?: CandidateSignalSource[];
  location?: string;
  bio?: string;
  status: PipelineStatus;
  tier: "TIER_1" | "TIER_2" | "TIER_3";
  avatarUrl?: string;
  recheckDueAtOffsetDays?: number;
  rateCardSeedIdentifier?: string;
  score?: {
    technicalDepth: number;
    codeQuality: number;
    aiFluency: number;
    deliveryReadiness: number;
    identityConfidence: IdentityConfidence;
    taskScore?: number;
    taskTimeSeconds?: number;
    taskAiReview?: string;
    verifiedAtOffsetDays?: number;
    validForDays?: number;
  };
  scoreDraft?: {
    technicalDepth: number;
    codeQuality: number;
    aiFluency: number;
    deliveryReadiness: number;
    identityConfidence: IdentityConfidence;
    taskScore?: number;
    taskTimeSeconds?: number;
    taskAiReview?: string;
  };
  placements?: Array<{
    clientName: string;
    projectName: string;
    startDateOffsetDays: number;
    endDateOffsetDays?: number;
  }>;
  notes?: Array<{
    body: string;
    createdBy: string;
    createdAtOffsetDays?: number;
  }>;
  activity?: Array<{
    eventType: string;
    metadata?: Record<string, unknown>;
    createdAtOffsetDays?: number;
  }>;
};

type CodeClearRateCardSeedPerson = Pick<RateCardPerson, "id" | "seedIdentifier" | "name" | "area">;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function toIsoString(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  return (value instanceof Date ? value : new Date(value)).toISOString();
}

function shiftDateByDays(offsetDays = 0) {
  const value = new Date();
  value.setDate(value.getDate() + offsetDays);
  return value;
}

export function clampScore(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 0;
  }

  return Math.min(100, Math.max(0, Math.round(value)));
}

/**
 * Compatibility shim. Old callsites (apply-run route, score route, seed
 * payloads) pass just the sub-scores; we forward to the new calibre module
 * which can take identity confidence + red flags optionally.
 *
 * For the canonical scoring logic see src/server/codeclear-scoring.ts.
 */
export function computeOverallScore(values: {
  technicalDepth?: number | null;
  codeQuality?: number | null;
  aiFluency?: number | null;
  deliveryReadiness?: number | null;
  identityConfidence?: IdentityConfidence | null;
  redFlagsCount?: number;
}) {
  return computeOverallCalibre({
    technicalDepth: values.technicalDepth,
    codeQuality: values.codeQuality,
    aiFluency: values.aiFluency,
    deliveryReadiness: values.deliveryReadiness,
    identityConfidence: values.identityConfidence ?? "PENDING",
    redFlagsCount: values.redFlagsCount,
  });
}

function serializeScore(
  score: {
    id: string;
    candidateId: string;
    technicalDepth: number;
    codeQuality: number;
    aiFluency: number;
    deliveryReadiness: number;
    identityConfidence: IdentityConfidence;
    overallScore: number;
    taskScore: number | null;
    taskTimeSeconds: number | null;
    taskAiReview: string | null;
    verifiedAt: Date | null;
    validUntil: Date | null;
    reminderSentAt: Date | null;
    expiredAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  },
): CodeClearScoreRecord {
  return {
    ...score,
    verifiedAt: toIsoString(score.verifiedAt),
    validUntil: toIsoString(score.validUntil),
    reminderSentAt: toIsoString(score.reminderSentAt),
    expiredAt: toIsoString(score.expiredAt),
    createdAt: score.createdAt.toISOString(),
    updatedAt: score.updatedAt.toISOString(),
  };
}

function serializeScoreDraft(
  draft: {
    id: string;
    candidateId: string;
    technicalDepth: number | null;
    codeQuality: number | null;
    aiFluency: number | null;
    deliveryReadiness: number | null;
    identityConfidence: IdentityConfidence | null;
    overallScore: number | null;
    taskScore: number | null;
    taskTimeSeconds: number | null;
    taskAiReview: string | null;
    sourceRunId: string | null;
    lastAppliedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  },
): CodeClearScoreDraftRecord {
  return {
    ...draft,
    lastAppliedAt: toIsoString(draft.lastAppliedAt),
    createdAt: draft.createdAt.toISOString(),
    updatedAt: draft.updatedAt.toISOString(),
  };
}

export function normalizeGitHubAnalysisRun(run: {
  id: string;
  candidateId: string;
  status: GitHubAnalysisRunRecord["status"];
  triggerSource: GitHubAnalysisRunRecord["triggerSource"];
  analysisVersion: string;
  startedAt: Date | string;
  completedAt: Date | string | null;
  profileSnapshot: unknown;
  repoSnapshot: unknown;
  metrics: unknown;
  redFlags: unknown;
  recommendedTechnicalDepth: number | null;
  recommendedCodeQuality: number | null;
  recommendedDeliveryReadiness: number | null;
  llmSummary: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}): GitHubAnalysisRunRecord {
  return {
    ...run,
    startedAt: toIsoString(run.startedAt)!,
    completedAt: toIsoString(run.completedAt),
    profileSnapshot: isRecord(run.profileSnapshot)
      ? (run.profileSnapshot as unknown as GitHubAnalysisRunRecord["profileSnapshot"])
      : null,
    repoSnapshot: Array.isArray(run.repoSnapshot)
      ? (run.repoSnapshot as unknown as GitHubAnalysisRunRecord["repoSnapshot"])
      : null,
    metrics: isRecord(run.metrics)
      ? (run.metrics as unknown as GitHubAnalysisRunRecord["metrics"])
      : null,
    redFlags: isStringArray(run.redFlags) ? run.redFlags : null,
    createdAt: toIsoString(run.createdAt)!,
    updatedAt: toIsoString(run.updatedAt)!,
  };
}

export const codeClearListInclude = {
  score: true,
  scoreDraft: true,
  githubAnalysisRuns: {
    orderBy: {
      createdAt: "desc",
    },
    take: 1,
  },
  // Every current Portal client (= every open-ended placement) so the
  // UI can render the full set of chips per dev without an N+1.
  placements: {
    where: { endDate: null },
    include: { client: { select: { id: true, name: true, slug: true } } },
    orderBy: { startDate: "desc" },
  },
} satisfies Prisma.CandidateInclude;

export const codeClearDetailInclude = {
  score: true,
  scoreDraft: true,
  placements: {
    include: { client: { select: { id: true, name: true, slug: true } } },
    orderBy: {
      startDate: "desc",
    },
  },
  notes: {
    orderBy: {
      createdAt: "desc",
    },
  },
  activityLog: {
    orderBy: {
      createdAt: "desc",
    },
  },
  githubAnalysisRuns: {
    orderBy: {
      createdAt: "desc",
    },
    take: 8,
  },
  checks: {
    orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
  },
} satisfies Prisma.CandidateInclude;

// Detail include still uses `placements` (already there) — but the serializer
// derives `currentClient` from the FIRST open placement found. The placements
// orderBy is `startDate desc` which puts the most recent open one first.

export type CodeClearListCandidateRecord = Prisma.CandidateGetPayload<{
  include: typeof codeClearListInclude;
}>;

export type CodeClearDetailCandidateRecord = Prisma.CandidateGetPayload<{
  include: typeof codeClearDetailInclude;
}>;

/** Shape shared by both list and detail serializers. Keeps the new validation
 *  fields in one place so we never miss one when adding to the other. */
function commonCandidateFields(candidate: {
  id: string;
  workspaceId: string;
  rateCardPersonId: string | null;
  name: string;
  githubHandle: string;
  email: string | null;
  primaryStack: string;
  techStacks: string[];
  signalSources: string[];
  location: string | null;
  bio: string | null;
  status: PipelineStatus;
  tier: "TIER_1" | "TIER_2" | "TIER_3";
  tierManualOverride: "TIER_1" | "TIER_2" | "TIER_3" | null;
  origin: "INTERNAL" | "EXTERNAL";
  published: boolean;
  avatarUrl: string | null;
  linkedinUrl: string | null;
  cvUrl: string | null;
  portfolioUrl: string | null;
  yearsExperience: number | null;
  hourlyRate: Prisma.Decimal | null;
  currency: string | null;
  timezone: string | null;
  availability: "AVAILABLE" | "ENGAGED" | "UNAVAILABLE" | null;
  recheckDueAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: candidate.id,
    workspaceId: candidate.workspaceId,
    rateCardPersonId: candidate.rateCardPersonId ?? null,
    name: candidate.name,
    githubHandle: candidate.githubHandle,
    email: candidate.email ?? null,
    primaryStack: candidate.primaryStack,
    techStacks: candidate.techStacks.length ? candidate.techStacks : [candidate.primaryStack],
    signalSources: candidate.signalSources.length
      ? (candidate.signalSources as CandidateSignalSource[])
      : ["GITHUB" as CandidateSignalSource],
    location: candidate.location ?? null,
    bio: candidate.bio ?? null,
    status: candidate.status,
    tier: candidate.tier,
    tierManualOverride: candidate.tierManualOverride ?? null,
    effectiveTier: effectiveTier(candidate.tier, candidate.tierManualOverride),
    origin: candidate.origin,
    published: candidate.published,
    avatarUrl: candidate.avatarUrl ?? null,
    linkedinUrl: candidate.linkedinUrl ?? null,
    cvUrl: candidate.cvUrl ?? null,
    portfolioUrl: candidate.portfolioUrl ?? null,
    yearsExperience: candidate.yearsExperience ?? null,
    hourlyRate: candidate.hourlyRate ? Number(candidate.hourlyRate.toString()) : null,
    currency: candidate.currency ?? null,
    timezone: candidate.timezone ?? null,
    availability: candidate.availability ?? null,
    recheckDueAt: toIsoString(candidate.recheckDueAt),
    createdAt: candidate.createdAt.toISOString(),
    updatedAt: candidate.updatedAt.toISOString(),
  };
}

export function serializeCandidateListItem(
  candidate: CodeClearListCandidateRecord,
): CodeClearCandidateListItem {
  const latestGitHubAnalysis = candidate.githubAnalysisRuns[0]
    ? normalizeGitHubAnalysisRun(candidate.githubAnalysisRuns[0])
    : null;
  const score = candidate.score ? serializeScore(candidate.score) : null;
  const scoreDraft = candidate.scoreDraft
    ? serializeScoreDraft(candidate.scoreDraft)
    : null;

  const currentClients = (candidate.placements ?? []).map((placement) =>
    placement.client
      ? {
          id: placement.client.id,
          name: placement.client.name,
          slug: placement.client.slug,
        }
      : { id: null, name: placement.clientName, slug: null },
  );
  // Stable alpha order so chips render the same on every re-render.
  currentClients.sort((a, b) => a.name.localeCompare(b.name));

  return {
    ...commonCandidateFields(candidate),
    score,
    scoreDraft,
    latestGitHubAnalysis,
    analysisState: deriveCandidateAnalysisState(latestGitHubAnalysis, scoreDraft, score),
    currentClients,
  };
}

export function serializeCandidateDetails(
  candidate: CodeClearDetailCandidateRecord,
): CodeClearCandidateDetail {
  const githubAnalysisRuns = candidate.githubAnalysisRuns.map((run) =>
    normalizeGitHubAnalysisRun(run),
  );
  const latestGitHubAnalysis = githubAnalysisRuns[0] ?? null;
  const score = candidate.score ? serializeScore(candidate.score) : null;
  const scoreDraft = candidate.scoreDraft
    ? serializeScoreDraft(candidate.scoreDraft)
    : null;

  // Mirror the list serializer — every open placement maps to a current
  // client. Closed placements (endDate set) live in `placements` history.
  const currentClients = candidate.placements
    .filter((placement) => placement.endDate === null)
    .map((placement) =>
      placement.client
        ? {
            id: placement.client.id,
            name: placement.client.name,
            slug: placement.client.slug,
          }
        : { id: null, name: placement.clientName, slug: null },
    );
  currentClients.sort((a, b) => a.name.localeCompare(b.name));

  return {
    ...commonCandidateFields(candidate),
    score,
    scoreDraft,
    latestGitHubAnalysis,
    githubAnalysisRuns,
    currentClients,
    placements: candidate.placements.map((placement) => ({
      id: placement.id,
      candidateId: placement.candidateId,
      clientId: placement.clientId ?? null,
      clientName: placement.clientName,
      projectName: placement.projectName,
      startDate: placement.startDate.toISOString(),
      endDate: toIsoString(placement.endDate),
      allocationPercent: placement.allocationPercent,
      notes: placement.notes ?? null,
      createdAt: placement.createdAt.toISOString(),
      updatedAt: placement.updatedAt.toISOString(),
    })),
    notes: candidate.notes.map((note) => ({
      ...note,
      createdAt: note.createdAt.toISOString(),
    })),
    activityLog: candidate.activityLog.map((entry) => ({
      ...entry,
      metadata: entry.metadata,
      createdAt: entry.createdAt.toISOString(),
    })),
    checks: candidate.checks.map((check) => ({
      id: check.id,
      candidateId: check.candidateId,
      runId: check.runId,
      category: check.category,
      checkKey: check.checkKey,
      label: check.label,
      status: check.status,
      detail: check.detail,
      evidence: check.evidence,
      weight: check.weight,
      sortOrder: check.sortOrder,
      createdAt: check.createdAt.toISOString(),
    })),
    analysisState: deriveCandidateAnalysisState(latestGitHubAnalysis, scoreDraft, score),
  };
}

export function serializeActivityRecord(
  entry: {
    id: string;
    candidateId: string;
    eventType: string;
    metadata: Prisma.JsonValue | null;
    createdAt: Date;
    candidate?: {
      name: string;
      githubHandle: string;
    };
  },
): CodeClearActivityRecord {
  return {
    id: entry.id,
    candidateId: entry.candidateId,
    eventType: entry.eventType,
    metadata: entry.metadata,
    createdAt: entry.createdAt.toISOString(),
    candidate: entry.candidate,
  };
}

// Demo candidates (Sindre, Dan Abramov, etc.) were removed: CodeClear is a
// Gitwork-only roster product, so the seed now derives candidates solely from
// the rate-card people in src/server/rate-card.ts via buildGitworkRosterCandidates().
const defaultCodeClearCandidates: SeedCodeClearCandidate[] = [];


function normalizeGitworkHandle(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseRateCardArea(area: string) {
  const [levelPart, stackPart = ""] = area.split("•").map((part) => part.trim());
  const stacks = stackPart
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  return {
    level: levelPart || "Mid Level",
    stacks,
  };
}

function getTierFromLevel(level: string): SeedCodeClearCandidate["tier"] {
  const normalized = level.toLowerCase();

  if (normalized.includes("senior")) {
    return "TIER_1";
  }

  if (normalized.includes("junior")) {
    return "TIER_3";
  }

  return "TIER_2";
}

function buildGitworkRosterCandidates(
  rateCardPeople: CodeClearRateCardSeedPerson[],
): SeedCodeClearCandidate[] {
  return rateCardPeople
    .filter((person) => person.seedIdentifier?.startsWith("gitwork."))
    .map((person) => {
      const { level, stacks } = parseRateCardArea(person.area);
      const primaryStack = stacks[0] ?? "Full Stack";
      const githubHandle = person.seedIdentifier
        ? normalizeGitworkHandle(person.seedIdentifier.replace(/^gitwork\./, ""))
        : normalizeGitworkHandle(person.name);
      const capabilityLabel = stacks.length ? stacks.join(", ") : "full-stack delivery";

      return {
        name: person.name,
        githubHandle,
        primaryStack,
        techStacks: stacks.length ? stacks : [primaryStack],
        signalSources: ["ASSESSMENT", "INTERVIEW"],
        location: "Gitwork",
        bio: `${level} Gitwork developer with experience across ${capabilityLabel}.`,
        status: "SOURCED",
        tier: getTierFromLevel(level),
        rateCardSeedIdentifier: person.seedIdentifier ?? undefined,
        activity: [
          {
            eventType: "SOURCED",
            metadata: { by: "rate-card-sync", source: "people-and-rates" },
            createdAtOffsetDays: -1,
          },
        ],
      } satisfies SeedCodeClearCandidate;
    });
}

export function getDefaultCodeClearCandidatePayloads(
  workspaceId: string,
  rateCardPeople: CodeClearRateCardSeedPerson[] = [],
): Prisma.CandidateCreateInput[] {
  const rateCardPeopleBySeed = new Map(
    rateCardPeople
      .filter((person) => Boolean(person.seedIdentifier))
      .map((person) => [person.seedIdentifier as string, person.id]),
  );
  const seededCandidates = [...defaultCodeClearCandidates, ...buildGitworkRosterCandidates(rateCardPeople)];
  const uniqueCandidates = [...new Map(seededCandidates.map((candidate) => [candidate.githubHandle, candidate])).values()];

  return uniqueCandidates.map((candidate) => {
    const scoreVerifiedAt = candidate.score?.verifiedAtOffsetDays
      ? shiftDateByDays(candidate.score.verifiedAtOffsetDays)
      : candidate.score
        ? new Date()
        : null;
    const scoreValidUntil =
      candidate.score && scoreVerifiedAt
        ? shiftDateByDays(
            (candidate.score.verifiedAtOffsetDays ?? 0) + (candidate.score.validForDays ?? 365),
          )
        : null;
    const scoreOverall = candidate.score
      ? computeOverallScore(candidate.score)
      : 0;
    const draftOverall = candidate.scoreDraft
      ? computeOverallScore(candidate.scoreDraft)
      : 0;
    const linkedRateCardPersonId = candidate.rateCardSeedIdentifier
      ? rateCardPeopleBySeed.get(candidate.rateCardSeedIdentifier) ?? null
      : null;

    return {
      workspace: {
        connect: {
          id: workspaceId,
        },
      },
      ...(linkedRateCardPersonId
        ? {
            rateCardPerson: {
              connect: {
                id: linkedRateCardPersonId,
              },
            },
          }
        : {}),
      name: candidate.name,
      githubHandle: candidate.githubHandle,
      email: candidate.email,
      primaryStack: candidate.primaryStack,
      techStacks: candidate.techStacks?.length ? candidate.techStacks : [candidate.primaryStack],
      signalSources: candidate.signalSources?.length ? candidate.signalSources : ["GITHUB"],
      location: candidate.location,
      bio: candidate.bio,
      status: candidate.status,
      tier: candidate.tier,
      avatarUrl: candidate.avatarUrl,
      recheckDueAt: candidate.recheckDueAtOffsetDays
        ? shiftDateByDays(candidate.recheckDueAtOffsetDays)
        : undefined,
      ...(candidate.score
        ? {
            score: {
              create: {
                technicalDepth: candidate.score.technicalDepth,
                codeQuality: candidate.score.codeQuality,
                aiFluency: candidate.score.aiFluency,
                deliveryReadiness: candidate.score.deliveryReadiness,
                identityConfidence: candidate.score.identityConfidence,
                overallScore: scoreOverall,
                taskScore: candidate.score.taskScore,
                taskTimeSeconds: candidate.score.taskTimeSeconds,
                taskAiReview: candidate.score.taskAiReview,
                verifiedAt: scoreVerifiedAt,
                validUntil: scoreValidUntil,
              },
            },
          }
        : {}),
      ...(candidate.scoreDraft
        ? {
            scoreDraft: {
              create: {
                technicalDepth: candidate.scoreDraft.technicalDepth,
                codeQuality: candidate.scoreDraft.codeQuality,
                aiFluency: candidate.scoreDraft.aiFluency,
                deliveryReadiness: candidate.scoreDraft.deliveryReadiness,
                identityConfidence: candidate.scoreDraft.identityConfidence,
                overallScore: draftOverall,
                taskScore: candidate.scoreDraft.taskScore,
                taskTimeSeconds: candidate.scoreDraft.taskTimeSeconds,
                taskAiReview: candidate.scoreDraft.taskAiReview,
                lastAppliedAt: shiftDateByDays(-2),
              },
            },
          }
        : {}),
      ...(candidate.placements?.length
        ? {
            placements: {
              create: candidate.placements.map((placement) => ({
                clientName: placement.clientName,
                projectName: placement.projectName,
                startDate: shiftDateByDays(placement.startDateOffsetDays),
                endDate: placement.endDateOffsetDays
                  ? shiftDateByDays(placement.endDateOffsetDays)
                  : undefined,
              })),
            },
          }
        : {}),
      ...(candidate.notes?.length
        ? {
            notes: {
              create: candidate.notes.map((note) => ({
                body: note.body,
                createdBy: note.createdBy,
                createdAt: shiftDateByDays(note.createdAtOffsetDays ?? 0),
              })),
            },
          }
        : {}),
      ...(candidate.activity?.length
        ? {
            activityLog: {
              create: candidate.activity.map((entry) => ({
                eventType: entry.eventType,
                metadata: (entry.metadata ?? {}) as Prisma.InputJsonValue,
                createdAt: shiftDateByDays(entry.createdAtOffsetDays ?? 0),
              })),
            },
          }
        : {}),
    } satisfies Prisma.CandidateCreateInput;
  });
}

type CodeClearDbClient = PrismaClient | Prisma.TransactionClient;

export async function getCodeClearStats(
  client: CodeClearDbClient,
  workspaceId: string,
): Promise<CodeClearStatsResponse> {
  const [total, byStatus, scores, recheckDue, recentActivity] = await Promise.all([
    client.candidate.count({
      where: {
        workspaceId,
      },
    }),
    client.candidate.groupBy({
      by: ["status"],
      where: {
        workspaceId,
      },
      _count: {
        id: true,
      },
    }),
    client.codeClearScore.findMany({
      where: {
        candidate: {
          workspaceId,
        },
        verifiedAt: {
          not: null,
        },
      },
      select: {
        overallScore: true,
        verifiedAt: true,
      },
    }),
    client.candidate.count({
      where: {
        workspaceId,
        recheckDueAt: {
          gte: new Date(),
          lte: shiftDateByDays(30),
        },
      },
    }),
    client.activityLog.findMany({
      where: {
        candidate: {
          workspaceId,
        },
      },
      take: 5,
      orderBy: {
        createdAt: "desc",
      },
      include: {
        candidate: {
          select: {
            name: true,
            githubHandle: true,
          },
        },
      },
    }),
  ]);

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const thisMonthScores = scores.filter(
    (score) => score.verifiedAt && score.verifiedAt >= startOfMonth,
  );
  const lastMonthScores = scores.filter(
    (score) =>
      score.verifiedAt &&
      score.verifiedAt >= startOfLastMonth &&
      score.verifiedAt < startOfMonth,
  );

  const avgThis = thisMonthScores.length
    ? Math.round(
        thisMonthScores.reduce((sum, score) => sum + score.overallScore, 0) /
          thisMonthScores.length,
      )
    : null;
  const avgLast = lastMonthScores.length
    ? Math.round(
        lastMonthScores.reduce((sum, score) => sum + score.overallScore, 0) /
          lastMonthScores.length,
      )
    : null;
  const passRateThis = thisMonthScores.length
    ? Math.round(
        (thisMonthScores.filter((score) => score.overallScore >= 65).length /
          thisMonthScores.length) *
          100,
      )
    : null;

  return {
    total,
    byStatus: byStatus.map((entry) => ({
      status: entry.status,
      count: entry._count.id,
    })),
    avgThis,
    avgLast,
    passRateThis,
    recheckDue,
    recentActivity: recentActivity.map((entry) => serializeActivityRecord(entry)),
  };
}
