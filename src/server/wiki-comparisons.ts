/**
 * Comparisons — load and edit a client's comparison tables.
 *
 * The rules (limits, cell vocabulary, parsing) live in `src/lib/wiki-comparisons.ts`; this
 * file only reads and writes. Columns and rows are replaced wholesale on every write — the
 * same contract `replaceBoardContent` uses for Charts — and re-parsed on the way in, so a
 * cell keyed on a column that is not in the table can never be stored.
 *
 * ⚠️ Writes are staff-only, by client slug (and over MCP, with the same permission). There
 * is deliberately **no** `/api/wiki/[token]/comparisons` route: the client's view is
 * read-only and rides down inside the wiki DTO, exactly as Charts and Estimates do.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  COMPARISON_LIMITS,
  comparisonLimitError,
  parseComparisonContent,
  type ComparisonContent,
} from "@/lib/wiki-comparisons";
import type { ComparisonInput } from "@/server/validators";
import type { WikiComparison, WikiComparisonsSection } from "@/types/wiki-comparisons";

const COMPARISON_ORDER = [
  { orderKey: "asc" },
  { createdAt: "asc" },
] as const satisfies Prisma.WikiComparisonOrderByWithRelationInput[];

const COMPARISON_SELECT = {
  id: true,
  title: true,
  description: true,
  columns: true,
  rows: true,
  orderKey: true,
  updatedAt: true,
} as const satisfies Prisma.WikiComparisonSelect;

type ComparisonRow = Prisma.WikiComparisonGetPayload<{ select: typeof COMPARISON_SELECT }>;

export function serializeComparison(row: ComparisonRow): WikiComparison {
  const content = parseComparisonContent(row.columns, row.rows);
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    columns: content.columns,
    rows: content.rows,
    orderKey: row.orderKey,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export const EMPTY_COMPARISONS: WikiComparisonsSection = { enabled: false, comparisons: [] };

export async function loadWikiComparisons(clientId: string): Promise<WikiComparisonsSection> {
  const wiki = await prisma.clientWiki.findUnique({
    where: { clientId },
    select: {
      comparisonsEnabled: true,
      comparisons: { orderBy: COMPARISON_ORDER, select: COMPARISON_SELECT },
    },
  });
  if (!wiki) return EMPTY_COMPARISONS;
  return { enabled: wiki.comparisonsEnabled, comparisons: wiki.comparisons.map(serializeComparison) };
}

export async function setWikiComparisonsEnabled(clientId: string, enabled: boolean): Promise<void> {
  await prisma.clientWiki.upsert({
    where: { clientId },
    create: { clientId, comparisonsEnabled: enabled },
    update: { comparisonsEnabled: enabled },
    select: { id: true },
  });
}

export class ComparisonNotFoundError extends Error {
  status = 404;
  constructor() {
    super("Comparison not found");
  }
}

export class ComparisonLimitError extends Error {
  status = 400;
}

/** Re-parse what is about to be stored, and refuse a write that breaks a limit. */
function content(input: Pick<ComparisonInput, "columns" | "rows">): ComparisonContent {
  const limit = comparisonLimitError(input);
  if (limit) throw new ComparisonLimitError(limit);
  return parseComparisonContent(input.columns, input.rows);
}

function data(input: ComparisonInput) {
  const c = content(input);
  return {
    title: input.title.trim(),
    description: input.description?.trim() || null,
    columns: c.columns as unknown as Prisma.InputJsonValue,
    rows: c.rows as unknown as Prisma.InputJsonValue,
  };
}

/** Creates the table and returns it (the MCP tools need its id and parsed shape). */
export async function createWikiComparison(
  clientId: string,
  input: ComparisonInput,
): Promise<WikiComparison> {
  const values = data(input);
  const wiki = await prisma.clientWiki.upsert({
    where: { clientId },
    create: { clientId },
    update: {},
    select: { id: true, _count: { select: { comparisons: true } } },
  });
  if (wiki._count.comparisons >= COMPARISON_LIMITS.maxTables) {
    throw new ComparisonLimitError(
      `A wiki can hold at most ${COMPARISON_LIMITS.maxTables} comparison tables.`,
    );
  }
  const last = await prisma.wikiComparison.findFirst({
    where: { wikiId: wiki.id },
    orderBy: { orderKey: "desc" },
    select: { orderKey: true },
  });
  const row = await prisma.wikiComparison.create({
    data: { wikiId: wiki.id, ...values, orderKey: (last?.orderKey ?? -1) + 1 },
    select: COMPARISON_SELECT,
  });
  return serializeComparison(row);
}

/** Scoped through the wiki, so an id from another client's wiki cannot be read or written. */
export async function getWikiComparison(
  clientId: string,
  comparisonId: string,
): Promise<WikiComparison> {
  const row = await prisma.wikiComparison.findFirst({
    where: { id: comparisonId, wiki: { clientId } },
    select: COMPARISON_SELECT,
  });
  if (!row) throw new ComparisonNotFoundError();
  return serializeComparison(row);
}

export async function updateWikiComparison(
  clientId: string,
  comparisonId: string,
  input: ComparisonInput,
): Promise<WikiComparison> {
  await getWikiComparison(clientId, comparisonId);
  const row = await prisma.wikiComparison.update({
    where: { id: comparisonId },
    data: data(input),
    select: COMPARISON_SELECT,
  });
  return serializeComparison(row);
}

export async function deleteWikiComparison(clientId: string, comparisonId: string): Promise<void> {
  await getWikiComparison(clientId, comparisonId);
  await prisma.wikiComparison.delete({ where: { id: comparisonId }, select: { id: true } });
}

/**
 * Reorder: the ids in `order` take positions 0…n-1. Ids not in this client's wiki are
 * ignored (never written), and tables missing from `order` keep their relative order
 * after the ones named.
 */
export async function reorderWikiComparisons(clientId: string, order: string[]): Promise<void> {
  const rows = await prisma.wikiComparison.findMany({
    where: { wiki: { clientId } },
    orderBy: COMPARISON_ORDER,
    select: { id: true },
  });
  const owned = new Set(rows.map((r) => r.id));
  const named = [...new Set(order)].filter((id) => owned.has(id));
  const rest = rows.map((r) => r.id).filter((id) => !named.includes(id));
  const final = [...named, ...rest];
  await prisma.$transaction(
    final.map((id, i) =>
      prisma.wikiComparison.update({ where: { id }, data: { orderKey: i }, select: { id: true } }),
    ),
  );
}
