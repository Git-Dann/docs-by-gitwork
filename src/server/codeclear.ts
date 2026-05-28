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

export function computeOverallScore(values: {
  technicalDepth?: number | null;
  codeQuality?: number | null;
  aiFluency?: number | null;
  deliveryReadiness?: number | null;
}) {
  const metrics = [
    values.technicalDepth,
    values.codeQuality,
    values.aiFluency,
    values.deliveryReadiness,
  ].filter((entry): entry is number => typeof entry === "number");

  if (!metrics.length) {
    return 0;
  }

  return Math.round(metrics.reduce((sum, value) => sum + clampScore(value), 0) / metrics.length);
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
  // The "current client" = the candidate's only open-ended (endDate null)
  // placement. Fetched here so the Code roster can show a per-dev dropdown
  // without an N+1 round trip.
  placements: {
    where: { endDate: null },
    include: { client: { select: { id: true, name: true, slug: true } } },
    orderBy: { startDate: "desc" },
    take: 1,
  },
} satisfies Prisma.CandidateInclude;

export const codeClearDetailInclude = {
  score: true,
  scoreDraft: true,
  placements: {
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
} satisfies Prisma.CandidateInclude;

export type CodeClearListCandidateRecord = Prisma.CandidateGetPayload<{
  include: typeof codeClearListInclude;
}>;

export type CodeClearDetailCandidateRecord = Prisma.CandidateGetPayload<{
  include: typeof codeClearDetailInclude;
}>;

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

  const openPlacement = candidate.placements?.[0];
  const currentClient = openPlacement?.client
    ? {
        id: openPlacement.client.id,
        name: openPlacement.client.name,
        slug: openPlacement.client.slug,
      }
    : openPlacement
      ? { id: null, name: openPlacement.clientName, slug: null }
      : null;

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
      : ["GITHUB"],
    location: candidate.location ?? null,
    bio: candidate.bio ?? null,
    status: candidate.status,
    tier: candidate.tier,
    avatarUrl: candidate.avatarUrl ?? null,
    recheckDueAt: toIsoString(candidate.recheckDueAt),
    createdAt: candidate.createdAt.toISOString(),
    updatedAt: candidate.updatedAt.toISOString(),
    score,
    scoreDraft,
    latestGitHubAnalysis,
    analysisState: deriveCandidateAnalysisState(latestGitHubAnalysis, scoreDraft, score),
    currentClient,
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
      : ["GITHUB"],
    location: candidate.location ?? null,
    bio: candidate.bio ?? null,
    status: candidate.status,
    tier: candidate.tier,
    avatarUrl: candidate.avatarUrl ?? null,
    recheckDueAt: toIsoString(candidate.recheckDueAt),
    createdAt: candidate.createdAt.toISOString(),
    updatedAt: candidate.updatedAt.toISOString(),
    score,
    scoreDraft,
    latestGitHubAnalysis,
    githubAnalysisRuns,
    placements: candidate.placements.map((placement) => ({
      id: placement.id,
      candidateId: placement.candidateId,
      clientId: placement.clientId ?? null,
      clientName: placement.clientName,
      projectName: placement.projectName,
      startDate: placement.startDate.toISOString(),
      endDate: toIsoString(placement.endDate),
      createdAt: placement.createdAt.toISOString(),
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
