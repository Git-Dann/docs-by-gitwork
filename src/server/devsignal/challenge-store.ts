import { prisma } from "@/lib/prisma";
import type { DevSignalChallenge as DbChallenge } from "@prisma/client";
import {
  CHALLENGES,
  defaultChallenge as inCodeDefault,
  type ChallengeDifficulty,
  type ChallengeLanguage,
  type ChallengeTest,
  type DevSignalChallenge,
} from "./challenges";

/**
 * DB-backed access to the coding-challenge bank. The in-code CHALLENGES array
 * seeds the DevSignalChallenge table on boot; from then on the bank is grown and
 * edited in the admin UI. Every accessor reads the DB and falls back to the
 * in-code catalog when the table is empty (fresh workspace / pre-seed), so the
 * candidate flow never breaks.
 *
 * The matcher (`pickChallengeFor`) is what turns DevSignal from "one default
 * task for everyone" into a role/stack/seniority-appropriate assessment.
 */

const DIFFICULTY_RANK: Record<ChallengeDifficulty, number> = {
  junior: 1,
  mid: 2,
  senior: 3,
  staff: 4,
};

/** Map a DB row onto the in-code challenge shape (id = slug, tests parsed). */
function rowToChallenge(row: DbChallenge): DevSignalChallenge {
  return {
    id: row.slug,
    title: row.title,
    language: (row.language as ChallengeLanguage) ?? "javascript",
    difficulty: (row.difficulty as ChallengeDifficulty) ?? "mid",
    roles: row.roles ?? [],
    stacks: row.stacks ?? [],
    competencies: row.competencies ?? [],
    promptMarkdown: row.promptMarkdown,
    functionName: row.functionName,
    starterCode: row.starterCode,
    timeLimitSec: row.timeLimitSec,
    tests: (row.tests as unknown as ChallengeTest[]) ?? [],
  };
}

/**
 * Seed the in-code catalog into the workspace bank. Upsert on (workspaceId, slug)
 * with `update: {}` so once a seed row is edited in the UI, later boots don't
 * clobber it (same pattern as the pipeline-config seed).
 */
export async function seedChallenges(workspaceId: string): Promise<void> {
  for (let i = 0; i < CHALLENGES.length; i++) {
    const c = CHALLENGES[i];
    await prisma.devSignalChallenge.upsert({
      where: { workspaceId_slug: { workspaceId, slug: c.id } },
      update: {},
      create: {
        workspaceId,
        slug: c.id,
        title: c.title,
        language: c.language,
        difficulty: c.difficulty,
        roles: c.roles,
        stacks: c.stacks,
        competencies: c.competencies,
        promptMarkdown: c.promptMarkdown,
        functionName: c.functionName,
        starterCode: c.starterCode,
        timeLimitSec: c.timeLimitSec,
        tests: c.tests as object,
        isActive: true,
        version: "v1",
        source: "seed",
        orderKey: i,
      },
    });
  }
}

/** All active challenges for a workspace (DB, or the in-code set as a fallback). */
export async function listActiveChallenges(workspaceId: string): Promise<DevSignalChallenge[]> {
  const rows = await prisma.devSignalChallenge.findMany({
    where: { workspaceId, isActive: true },
    orderBy: [{ orderKey: "asc" }, { createdAt: "asc" }],
  });
  if (rows.length === 0) return CHALLENGES;
  return rows.map(rowToChallenge);
}

/** Every challenge for the admin bank (active + inactive). */
export async function listAllChallenges(workspaceId: string): Promise<DevSignalChallenge[]> {
  const rows = await prisma.devSignalChallenge.findMany({
    where: { workspaceId },
    orderBy: [{ orderKey: "asc" }, { createdAt: "asc" }],
  });
  if (rows.length === 0) return CHALLENGES;
  return rows.map(rowToChallenge);
}

/** A challenge by slug (DB, then in-code fallback). */
export async function getChallengeBySlug(
  workspaceId: string,
  slug: string,
): Promise<DevSignalChallenge | null> {
  const row = await prisma.devSignalChallenge.findUnique({
    where: { workspaceId_slug: { workspaceId, slug } },
  });
  if (row) return rowToChallenge(row);
  return CHALLENGES.find((c) => c.id === slug) ?? null;
}

export interface MatchCriteria {
  primaryStack?: string | null;
  targetRole?: string | null;
  yearsExperience?: number | null;
}

/** Turn declared years of experience into a target seniority band. */
export function seniorityFromYears(years?: number | null): ChallengeDifficulty {
  if (typeof years !== "number" || !Number.isFinite(years)) return "mid";
  if (years < 2) return "junior";
  if (years < 5) return "mid";
  if (years < 9) return "senior";
  return "staff";
}

function tokenize(value?: string | null): string[] {
  if (!value) return [];
  return value
    .toLowerCase()
    .split(/[\s,/&|+]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Pick the best-matching active challenge for a candidate. Deterministic scoring:
 * stack overlap (weighted highest), role overlap, then closeness of the
 * challenge's difficulty to the candidate's target seniority. Ties fall back to
 * `orderKey` (list order). No match at all → the first active challenge.
 *
 * Pure-ish: takes the candidate criteria + the resolved list, so it is unit
 * testable without a DB.
 */
export function pickBestChallenge(
  challenges: DevSignalChallenge[],
  criteria: MatchCriteria,
): DevSignalChallenge | null {
  if (challenges.length === 0) return null;

  const stackTokens = new Set(tokenize(criteria.primaryStack));
  const roleTokens = new Set(tokenize(criteria.targetRole));
  const targetRank = DIFFICULTY_RANK[seniorityFromYears(criteria.yearsExperience)];

  let best: DevSignalChallenge | null = null;
  let bestScore = -Infinity;

  challenges.forEach((c, index) => {
    const stackHits = c.stacks.filter((s) => stackTokens.has(s.toLowerCase())).length;
    const roleHits = c.roles.filter((r) => roleTokens.has(r.toLowerCase())).length;
    const rank = DIFFICULTY_RANK[c.difficulty] ?? 2;
    // Closer difficulty scores higher (0 diff → +3, each step away −1.5).
    const difficultyScore = 3 - Math.abs(rank - targetRank) * 1.5;
    // A tiny position tie-breaker keeps ordering stable and deterministic.
    const positionBias = -index * 0.001;
    const score = stackHits * 5 + roleHits * 3 + difficultyScore + positionBias;
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  });

  return best;
}

/** DB-backed convenience: resolve the list then pick. */
export async function pickChallengeFor(
  workspaceId: string,
  criteria: MatchCriteria,
): Promise<DevSignalChallenge> {
  const challenges = await listActiveChallenges(workspaceId);
  return pickBestChallenge(challenges, criteria) ?? challenges[0] ?? inCodeDefault();
}

export interface ChallengeWriteInput {
  slug: string;
  title: string;
  language: ChallengeLanguage;
  difficulty: ChallengeDifficulty;
  roles: string[];
  stacks: string[];
  competencies: string[];
  promptMarkdown: string;
  functionName: string;
  starterCode: string;
  timeLimitSec: number;
  tests: ChallengeTest[];
  isActive: boolean;
}

export async function createChallenge(
  workspaceId: string,
  input: ChallengeWriteInput,
  createdBy?: string | null,
): Promise<DevSignalChallenge> {
  const count = await prisma.devSignalChallenge.count({ where: { workspaceId } });
  const row = await prisma.devSignalChallenge.create({
    data: {
      workspaceId,
      slug: input.slug,
      title: input.title,
      language: input.language,
      difficulty: input.difficulty,
      roles: input.roles,
      stacks: input.stacks,
      competencies: input.competencies,
      promptMarkdown: input.promptMarkdown,
      functionName: input.functionName,
      starterCode: input.starterCode,
      timeLimitSec: input.timeLimitSec,
      tests: input.tests as object,
      isActive: input.isActive,
      version: "v1",
      source: "authored",
      orderKey: count,
      createdBy: createdBy ?? null,
    },
  });
  return rowToChallenge(row);
}

export async function updateChallenge(
  workspaceId: string,
  id: string,
  input: Partial<ChallengeWriteInput>,
): Promise<DevSignalChallenge | null> {
  // `id` from the DTO is the slug; resolve to the row within this workspace.
  const existing = await prisma.devSignalChallenge.findUnique({
    where: { workspaceId_slug: { workspaceId, slug: id } },
  });
  if (!existing) return null;

  // Any change to the prompt or tests bumps the version so historical attempts
  // stay interpretable.
  const contentChanged =
    (input.promptMarkdown !== undefined && input.promptMarkdown !== existing.promptMarkdown) ||
    (input.tests !== undefined && JSON.stringify(input.tests) !== JSON.stringify(existing.tests)) ||
    (input.functionName !== undefined && input.functionName !== existing.functionName);
  const nextVersion = contentChanged ? bumpVersion(existing.version) : existing.version;

  const row = await prisma.devSignalChallenge.update({
    where: { id: existing.id },
    data: {
      title: input.title ?? undefined,
      language: input.language ?? undefined,
      difficulty: input.difficulty ?? undefined,
      roles: input.roles ?? undefined,
      stacks: input.stacks ?? undefined,
      competencies: input.competencies ?? undefined,
      promptMarkdown: input.promptMarkdown ?? undefined,
      functionName: input.functionName ?? undefined,
      starterCode: input.starterCode ?? undefined,
      timeLimitSec: input.timeLimitSec ?? undefined,
      tests: input.tests !== undefined ? (input.tests as object) : undefined,
      isActive: input.isActive ?? undefined,
      version: nextVersion,
    },
  });
  return rowToChallenge(row);
}

export async function setChallengeActive(
  workspaceId: string,
  id: string,
  isActive: boolean,
): Promise<DevSignalChallenge | null> {
  return updateChallenge(workspaceId, id, { isActive });
}

function bumpVersion(version: string): string {
  const m = /^v(\d+)$/.exec(version);
  if (m) return `v${Number(m[1]) + 1}`;
  return `${version}-2`;
}
