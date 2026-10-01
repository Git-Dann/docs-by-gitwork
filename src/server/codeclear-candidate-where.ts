import {
  type CodeClearTier as PrismaCodeClearTier,
  type IdentityConfidence as PrismaIdentityConfidence,
  type PipelineStatus as PrismaPipelineStatus,
  type Prisma,
} from "@prisma/client";
import { activeDeveloperWhere, archivedDeveloperWhere } from "@/server/codeclear-archived";

/**
 * ⚠️ Every filter that needs alternatives goes in `and`, never as a top-level `OR`.
 * Four of them used to set `OR` directly — stack, search, confidence and score
 * range — and an object literal keeps only the LAST key, so combining any two
 * silently dropped all but one: searching a name with a confidence filter on
 * ignored the name. `and` keeps each group as its own clause.
 */
export function buildCandidateWhere(
  workspaceId: string,
  searchParams: URLSearchParams,
  archivedEmails: string[] = [],
): Prisma.CandidateWhereInput {
  const q = searchParams.get("q")?.trim();
  const status = searchParams.get("status")?.trim() || undefined;
  const tier = searchParams.get("tier")?.trim() || undefined;
  const identityConfidence = searchParams.get("identityConfidence")?.trim() || undefined;
  const recheckDue = searchParams.get("recheckDue")?.trim() || undefined;
  const stack = searchParams.get("stack")?.trim() || undefined;
  const scoreMin = searchParams.get("scoreMin");
  const scoreMax = searchParams.get("scoreMax");
  // `archived=1` → only developers whose person has left (the Archived tab).
  // Default → the active roster, which excludes them everywhere this list is used.
  const archivedOnly = searchParams.get("archived") === "1";

  const overallScoreRange: Prisma.IntFilter = {};
  if (scoreMin !== null) {
    const parsedMin = Number(scoreMin);
    if (Number.isFinite(parsedMin)) overallScoreRange.gte = parsedMin;
  }
  if (scoreMax !== null) {
    const parsedMax = Number(scoreMax);
    if (Number.isFinite(parsedMax)) overallScoreRange.lte = parsedMax;
  }

  const and: Prisma.CandidateWhereInput[] = [
    // DevSignal isolation: in-vetting EXTERNAL candidates never appear in Code.
    { NOT: { origin: "EXTERNAL", published: false } },
    archivedOnly ? archivedDeveloperWhere(archivedEmails) : activeDeveloperWhere(archivedEmails),
  ];

  if (stack) {
    and.push({
      OR: [
        { primaryStack: { contains: stack, mode: "insensitive" } },
        { techStacks: { has: stack } },
      ],
    });
  }
  if (q) {
    and.push({
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { githubHandle: { contains: q, mode: "insensitive" } },
        { primaryStack: { contains: q, mode: "insensitive" } },
        { techStacks: { hasSome: [q] } },
        { email: { contains: q, mode: "insensitive" } },
      ],
    });
  }
  if (identityConfidence) {
    const level = identityConfidence as PrismaIdentityConfidence;
    and.push({
      OR: [{ score: { identityConfidence: level } }, { scoreDraft: { identityConfidence: level } }],
    });
  }
  if (Object.keys(overallScoreRange).length) {
    and.push({
      OR: [{ score: { overallScore: overallScoreRange } }, { scoreDraft: { overallScore: overallScoreRange } }],
    });
  }

  return {
    workspaceId,
    AND: and,
    ...(status ? { status: status as PrismaPipelineStatus } : {}),
    ...(tier ? { tier: tier as PrismaCodeClearTier } : {}),
    ...(recheckDue === "ANY"
      ? { recheckDueAt: { not: null } }
      : recheckDue === "SOON"
        ? { recheckDueAt: { gte: new Date(), lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) } }
        : recheckDue === "OVERDUE"
          ? { recheckDueAt: { lt: new Date() } }
          : {}),
  };
}

