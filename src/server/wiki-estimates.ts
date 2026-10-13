/**
 * Estimates — load and edit a client's timeline estimates.
 *
 * The arithmetic lives in `src/lib/wiki-estimates.ts` (pure, unit-tested). This file only
 * fetches and writes; nothing here decides a duration or a date.
 *
 * ⚠️ Writes are staff-only, by client slug. There is deliberately **no**
 * `/api/wiki/[token]/estimates` route: the client's view is read-only and rides down inside
 * the wiki DTO, exactly as Running costs and Charts do. A token write route would be dead
 * surface with a live attack surface on a page that states delivery dates.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normaliseTeamSizes, parseIsoDate, toIsoDate } from "@/lib/wiki-estimates";
import type { EstimateInput } from "@/server/validators";
import type {
  Estimate,
  EstimateCoordination,
  EstimatePhase,
  WikiEstimatesSection,
} from "@/types/wiki-estimates";

const ESTIMATE_ORDER = [
  { orderKey: "asc" },
  { createdAt: "asc" },
] as const satisfies Prisma.WikiEstimateOrderByWithRelationInput[];

type EstimateRow = Prisma.WikiEstimateGetPayload<Record<string, never>>;

/**
 * Phases are JSON, so anything can be in there — a hand-edited row, a shape from before a
 * field existed. Malformed entries are dropped rather than drawn: a bar with no name or a
 * NaN width is worse than a missing one, and the editor shows exactly what survived.
 */
export function parsePhases(value: unknown): EstimatePhase[] {
  if (!Array.isArray(value)) return [];
  const out: EstimatePhase[] = [];
  value.forEach((raw, i) => {
    if (!raw || typeof raw !== "object") return;
    const r = raw as Record<string, unknown>;
    const name = typeof r.name === "string" ? r.name.trim() : "";
    const effort = typeof r.effortDays === "number" ? r.effortDays : Number.NaN;
    if (!name || !Number.isFinite(effort) || effort <= 0) return;
    const cap =
      typeof r.maxDevs === "number" && Number.isInteger(r.maxDevs) && r.maxDevs >= 1
        ? r.maxDevs
        : null;
    out.push({
      id: typeof r.id === "string" && r.id ? r.id : `phase-${i}`,
      name,
      effortDays: effort,
      maxDevs: cap,
    });
  });
  return out;
}

function serialize(row: EstimateRow): Estimate {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    startDate: row.startDate ? toIsoDate(row.startDate) : null,
    teamSizes: normaliseTeamSizes(row.teamSizes),
    recommendedTeam: row.recommendedTeam,
    coordination: row.coordination as EstimateCoordination,
    contingencyPct: row.contingencyPct,
    phases: parsePhases(row.phases),
    orderKey: row.orderKey,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export const EMPTY_ESTIMATES: WikiEstimatesSection = { enabled: false, estimates: [] };

export async function loadWikiEstimates(clientId: string): Promise<WikiEstimatesSection> {
  const wiki = await prisma.clientWiki.findUnique({
    where: { clientId },
    select: {
      estimatesEnabled: true,
      estimates: { orderBy: ESTIMATE_ORDER },
    },
  });
  if (!wiki) return EMPTY_ESTIMATES;
  return { enabled: wiki.estimatesEnabled, estimates: wiki.estimates.map(serialize) };
}

export async function setWikiEstimatesEnabled(clientId: string, enabled: boolean): Promise<void> {
  await prisma.clientWiki.upsert({
    where: { clientId },
    create: { clientId, estimatesEnabled: enabled },
    update: { estimatesEnabled: enabled },
    select: { id: true },
  });
}

function data(input: EstimateInput) {
  const teamSizes = normaliseTeamSizes(input.teamSizes);
  // A recommendation outside the compared sizes would open the page on nothing.
  const recommended =
    input.recommendedTeam != null && teamSizes.includes(input.recommendedTeam)
      ? input.recommendedTeam
      : null;
  const start = parseIsoDate(input.startDate ?? null);
  return {
    title: input.title.trim(),
    summary: input.summary?.trim() || null,
    startDate: start,
    teamSizes,
    recommendedTeam: recommended,
    coordination: input.coordination,
    contingencyPct: input.contingencyPct,
    phases: input.phases.map((p) => ({
      id: p.id,
      name: p.name.trim(),
      effortDays: p.effortDays,
      maxDevs: p.maxDevs,
    })) as Prisma.InputJsonValue,
  };
}

export async function createWikiEstimate(
  clientId: string,
  input: EstimateInput,
): Promise<WikiEstimatesSection> {
  const wiki = await prisma.clientWiki.upsert({
    where: { clientId },
    create: { clientId },
    update: {},
    select: { id: true },
  });
  const last = await prisma.wikiEstimate.findFirst({
    where: { wikiId: wiki.id },
    orderBy: { orderKey: "desc" },
    select: { orderKey: true },
  });
  await prisma.wikiEstimate.create({
    data: { wikiId: wiki.id, ...data(input), orderKey: (last?.orderKey ?? -1) + 1 },
    select: { id: true },
  });
  return loadWikiEstimates(clientId);
}

export class EstimateNotFoundError extends Error {
  status = 404;
  constructor() {
    super("Estimate not found");
  }
}

/** Scoped through the wiki, so an id from another client's wiki cannot be written. */
async function assertOwned(clientId: string, estimateId: string): Promise<void> {
  const owned = await prisma.wikiEstimate.findFirst({
    where: { id: estimateId, wiki: { clientId } },
    select: { id: true },
  });
  if (!owned) throw new EstimateNotFoundError();
}

export async function updateWikiEstimate(
  clientId: string,
  estimateId: string,
  input: EstimateInput,
): Promise<WikiEstimatesSection> {
  await assertOwned(clientId, estimateId);
  await prisma.wikiEstimate.update({
    where: { id: estimateId },
    data: data(input),
    select: { id: true },
  });
  return loadWikiEstimates(clientId);
}

export async function deleteWikiEstimate(
  clientId: string,
  estimateId: string,
): Promise<WikiEstimatesSection> {
  await assertOwned(clientId, estimateId);
  await prisma.wikiEstimate.delete({ where: { id: estimateId }, select: { id: true } });
  return loadWikiEstimates(clientId);
}
