/**
 * wiki-insights.ts — hand-authored charts and diagrams for a client's wiki.
 *
 * Structure mirrors `wiki-code.ts`: record interfaces → section DTO → an include → a
 * serializer that turns Dates into ISO strings → `loadWikiInsights(clientId)` → a private
 * `ensureWikiId` → an enable toggle → CRUD scoped by `wiki: { clientId }`.
 *
 * ## The DTO is a DISCRIMINATED UNION, and that is the point
 *
 * The database keeps one board table with five nullable config columns, because a board
 * header is inherently a union header and five columns is not a taxonomy problem. The
 * WIRE format is not: a bar board's DTO has no `sets` and no `branches`, so no component
 * ever receives a field that means nothing for the board it was handed. The tests assert
 * that shape directly, because the pressure to collapse it back into one flat record is
 * exactly what produces "why is `value` nullable" three months later.
 *
 * ## Writes replace the whole board's content
 *
 * There is no per-point API. `updateInsightBoard` takes the board and its complete point
 * list and replaces the content — the same contract `updateCodeVersion` uses for a
 * version's files, and for the same reason: the editor is a list you reorder and edit in
 * place, so `orderKey` is just the array index and a diff-based API would only let the
 * client and the server disagree about it.
 */

import { prisma } from "@/lib/prisma";
import type { WikiInsightBoardType, WikiInsightVennRegion } from "@prisma/client";
import { insightColorKey, type InsightColorKey } from "@/lib/insights/palette";

export interface InsightSeriesPoint {
  id: string;
  label: string;
  value: number;
  color: InsightColorKey;
  note: string | null;
}

export interface InsightVennSet {
  key: "A" | "B" | "C";
  label: string;
  color: InsightColorKey;
}

export interface InsightVennItem {
  id: string;
  label: string;
  region: WikiInsightVennRegion;
  note: string | null;
}

export interface InsightLeaf {
  id: string;
  label: string;
  note: string | null;
  link: string | null;
}

export interface InsightBranch {
  id: string;
  label: string;
  color: InsightColorKey;
  note: string | null;
  link: string | null;
  leaves: InsightLeaf[];
}

interface BoardBase {
  id: string;
  title: string;
  caption: string | null;
  createdAt: string;
  updatedAt: string;
}

export type WikiInsightBoardRecord =
  | (BoardBase & { kind: "bar"; unit: string | null; points: InsightSeriesPoint[] })
  | (BoardBase & { kind: "pie"; unit: string | null; points: InsightSeriesPoint[] })
  | (BoardBase & { kind: "venn"; sets: InsightVennSet[]; items: InsightVennItem[] })
  | (BoardBase & { kind: "node"; core: string; branches: InsightBranch[] });

export interface WikiInsightsSection {
  enabled: boolean;
  boards: WikiInsightBoardRecord[];
}

/**
 * ⚠️ These three child models have **no `createdAt`**, and an earlier version of this
 * ordered by one. That took down EVERY client's wiki with a 500 in production:
 * `loadWikiInsights` runs inside `buildDTO`'s `Promise.all`, so its rejection rejected
 * the whole DTO — *"Unknown argument `createdAt`"*.
 *
 * `tsc` could not see it, and the reason is worth remembering: TypeScript's
 * excess-property check fires only on an object literal assigned **directly** at the call
 * site. Extracting this include into a named const is exactly what disabled it. The
 * companion test (`wiki-insights-include.test.ts`) reads the schema and checks every
 * field named here actually exists, because the compiler structurally cannot.
 *
 * Not `as const` — Prisma's generated `orderBy` wants a MUTABLE array, and a readonly
 * tuple is rejected with an error that points at the include rather than at the cause.
 */
const CHILD_ORDER = [{ orderKey: "asc" as const }, { id: "asc" as const }];

const BOARD_INCLUDE = {
  seriesPoints: { orderBy: CHILD_ORDER },
  vennItems: { orderBy: CHILD_ORDER },
  nodes: { orderBy: CHILD_ORDER },
};

type BoardRow = {
  id: string;
  type: WikiInsightBoardType;
  title: string;
  caption: string | null;
  valueUnit: string | null;
  setALabel: string | null;
  setBLabel: string | null;
  setCLabel: string | null;
  coreLabel: string | null;
  createdAt: Date;
  updatedAt: Date;
  seriesPoints: {
    id: string;
    label: string;
    value: number;
    color: string | null;
    note: string | null;
  }[];
  vennItems: {
    id: string;
    label: string;
    region: WikiInsightVennRegion;
    note: string | null;
  }[];
  nodes: {
    id: string;
    parentId: string | null;
    label: string;
    color: string | null;
    note: string | null;
    link: string | null;
  }[];
};

/**
 * ⚠️ Exported so it can be tested from fixtures without a database. The two properties
 * worth pinning are that no `Date` survives, and that a board of one kind carries no
 * field belonging to another.
 */
export function serializeInsightBoard(board: BoardRow): WikiInsightBoardRecord {
  const base: BoardBase = {
    id: board.id,
    title: board.title,
    caption: board.caption,
    createdAt: board.createdAt.toISOString(),
    updatedAt: board.updatedAt.toISOString(),
  };

  if (board.type === "VENN") {
    // Set colours are DERIVED by position, never stored per set. Three fewer columns, and
    // palette compliance becomes structural rather than something an author can get wrong.
    const labels = [board.setALabel, board.setBLabel, board.setCLabel];
    const sets: InsightVennSet[] = (["A", "B", "C"] as const)
      .map((key, i) => ({ key, label: labels[i] ?? "", color: insightColorKey(null, i) }))
      .filter((s) => s.label.trim() !== "");
    const allowed = new Set(
      sets.length >= 3 ? ["A", "B", "C", "AB", "AC", "BC", "ABC"] : ["A", "B", "AB"],
    );
    return {
      ...base,
      kind: "venn",
      sets,
      // An item in a region the board's set count cannot express — because the third set
      // was cleared after the item was placed — is DROPPED rather than rendered somewhere
      // it does not belong. The editor still shows it; the figure does not invent a home.
      items: board.vennItems
        .filter((item) => allowed.has(item.region))
        .map((item) => ({
          id: item.id,
          label: item.label,
          region: item.region,
          note: item.note,
        })),
    };
  }

  if (board.type === "NODE") {
    const branchRows = board.nodes.filter((n) => n.parentId === null);
    const byParent = new Map<string, typeof board.nodes>();
    const branchIds = new Set(branchRows.map((b) => b.id));
    for (const node of board.nodes) {
      if (node.parentId === null) continue;
      // Two levels only. A row whose parent is itself a leaf (depth 3), or whose parent
      // is not on this board at all, is dropped — the layout is two-level by
      // construction, so rendering it would mean inventing a position for it.
      if (!branchIds.has(node.parentId)) continue;
      const list = byParent.get(node.parentId) ?? [];
      list.push(node);
      byParent.set(node.parentId, list);
    }
    return {
      ...base,
      kind: "node",
      core: board.coreLabel ?? board.title,
      branches: branchRows.map((branch, i) => ({
        id: branch.id,
        label: branch.label,
        color: insightColorKey(branch.color, i),
        note: branch.note,
        link: branch.link,
        leaves: (byParent.get(branch.id) ?? []).map((leaf) => ({
          id: leaf.id,
          label: leaf.label,
          note: leaf.note,
          link: leaf.link,
        })),
      })),
    };
  }

  const points: InsightSeriesPoint[] = board.seriesPoints.map((p, i) => ({
    id: p.id,
    label: p.label,
    value: p.value,
    color: insightColorKey(p.color, i),
    note: p.note,
  }));
  return {
    ...base,
    kind: board.type === "PIE" ? "pie" : "bar",
    unit: board.valueUnit,
    points,
  };
}

export async function loadWikiInsights(clientId: string): Promise<WikiInsightsSection> {
  const wiki = await prisma.clientWiki.findUnique({
    where: { clientId },
    select: {
      insightsEnabled: true,
      insightBoards: {
        include: BOARD_INCLUDE,
        orderBy: [{ orderKey: "asc" }, { createdAt: "asc" }],
      },
    },
  });
  if (!wiki) return { enabled: false, boards: [] };
  return {
    enabled: wiki.insightsEnabled,
    boards: wiki.insightBoards.map(serializeInsightBoard),
  };
}

async function ensureWikiId(clientId: string): Promise<string> {
  const wiki = await prisma.clientWiki.upsert({
    where: { clientId },
    create: { clientId },
    update: {},
    select: { id: true },
  });
  return wiki.id;
}

export async function setWikiInsightsEnabled(clientId: string, enabled: boolean): Promise<void> {
  await prisma.clientWiki.upsert({
    where: { clientId },
    create: { clientId, insightsEnabled: enabled },
    update: { insightsEnabled: enabled },
    select: { id: true },
  });
}

// ─── Writes ───────────────────────────────────────────────────────────────────

export interface SeriesPointInput {
  label: string;
  value: number;
  color?: string | null;
  note?: string | null;
}

export interface VennItemInput {
  label: string;
  region: WikiInsightVennRegion;
  note?: string | null;
}

export interface NodeBranchInput {
  label: string;
  color?: string | null;
  note?: string | null;
  link?: string | null;
  leaves?: { label: string; note?: string | null; link?: string | null }[];
}

export interface BoardInput {
  type: WikiInsightBoardType;
  title: string;
  caption?: string | null;
  valueUnit?: string | null;
  setALabel?: string | null;
  setBLabel?: string | null;
  setCLabel?: string | null;
  coreLabel?: string | null;
  points?: SeriesPointInput[];
  items?: VennItemInput[];
  branches?: NodeBranchInput[];
}

/**
 * Only ever store a link we would be willing to render as an `href`.
 *
 * A protocol ALLOW-list, not a blocklist — `javascript:`, `data:`, `vbscript:` and
 * `file:` are all reachable from a paste and enumerating them is how one gets missed.
 * The same rule `safeLaunchpadLink` applies, for the same reason.
 */
export function safeInsightLink(raw: string | null | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? value.slice(0, 2048) : null;
  } catch {
    return null;
  }
}

async function replaceBoardContent(boardId: string, input: BoardInput): Promise<void> {
  if (input.type === "VENN") {
    await prisma.wikiInsightVennItem.deleteMany({ where: { boardId } });
    const items = input.items ?? [];
    if (items.length) {
      await prisma.wikiInsightVennItem.createMany({
        data: items.map((item, i) => ({
          boardId,
          label: item.label.trim(),
          region: item.region,
          note: item.note?.trim() || null,
          orderKey: i,
        })),
      });
    }
    return;
  }

  if (input.type === "NODE") {
    await prisma.wikiInsightNode.deleteMany({ where: { boardId } });
    const branches = input.branches ?? [];
    // Two passes, because a leaf needs its branch's generated id. `createMany` does not
    // return ids, so the branches are created individually and the leaves in one batch.
    for (const [i, branch] of branches.entries()) {
      const created = await prisma.wikiInsightNode.create({
        data: {
          boardId,
          parentId: null,
          label: branch.label.trim(),
          color: branch.color ?? null,
          note: branch.note?.trim() || null,
          link: safeInsightLink(branch.link),
          orderKey: i,
        },
        select: { id: true },
      });
      const leaves = branch.leaves ?? [];
      if (leaves.length) {
        await prisma.wikiInsightNode.createMany({
          data: leaves.map((leaf, j) => ({
            boardId,
            parentId: created.id,
            label: leaf.label.trim(),
            note: leaf.note?.trim() || null,
            link: safeInsightLink(leaf.link),
            orderKey: j,
          })),
        });
      }
    }
    return;
  }

  await prisma.wikiInsightSeriesPoint.deleteMany({ where: { boardId } });
  const points = input.points ?? [];
  if (points.length) {
    await prisma.wikiInsightSeriesPoint.createMany({
      data: points.map((point, i) => ({
        boardId,
        label: point.label.trim(),
        value: point.value,
        color: point.color ?? null,
        note: point.note?.trim() || null,
        orderKey: i,
      })),
    });
  }
}

function boardMeta(input: BoardInput) {
  return {
    type: input.type,
    title: input.title.trim(),
    caption: input.caption?.trim() || null,
    valueUnit: input.valueUnit?.trim() || null,
    setALabel: input.setALabel?.trim() || null,
    setBLabel: input.setBLabel?.trim() || null,
    setCLabel: input.setCLabel?.trim() || null,
    coreLabel: input.coreLabel?.trim() || null,
  };
}

export async function createInsightBoard(
  clientId: string,
  input: BoardInput,
): Promise<WikiInsightBoardRecord> {
  const wikiId = await ensureWikiId(clientId);
  const count = await prisma.wikiInsightBoard.count({ where: { wikiId } });
  const board = await prisma.wikiInsightBoard.create({
    data: { wikiId, ...boardMeta(input), orderKey: count },
    select: { id: true },
  });
  await replaceBoardContent(board.id, input);
  const full = await prisma.wikiInsightBoard.findUniqueOrThrow({
    where: { id: board.id },
    include: BOARD_INCLUDE,
  });
  return serializeInsightBoard(full);
}

export async function updateInsightBoard(
  clientId: string,
  boardId: string,
  input: BoardInput,
): Promise<WikiInsightBoardRecord | null> {
  // Scoped by the client, not just the id — an id from another client's wiki must not be
  // writable through this route however it was obtained.
  const existing = await prisma.wikiInsightBoard.findFirst({
    where: { id: boardId, wiki: { clientId } },
    select: { id: true },
  });
  if (!existing) return null;
  await prisma.wikiInsightBoard.update({
    where: { id: boardId },
    data: boardMeta(input),
    select: { id: true },
  });
  await replaceBoardContent(boardId, input);
  const full = await prisma.wikiInsightBoard.findUniqueOrThrow({
    where: { id: boardId },
    include: BOARD_INCLUDE,
  });
  return serializeInsightBoard(full);
}

export async function deleteInsightBoard(clientId: string, boardId: string): Promise<boolean> {
  const existing = await prisma.wikiInsightBoard.findFirst({
    where: { id: boardId, wiki: { clientId } },
    select: { id: true },
  });
  if (!existing) return false;
  await prisma.wikiInsightBoard.delete({ where: { id: boardId } });
  return true;
}

/** Reorder boards. Takes the full id list; anything missing keeps its place at the end. */
export async function reorderInsightBoards(clientId: string, ids: string[]): Promise<void> {
  const boards = await prisma.wikiInsightBoard.findMany({
    where: { wiki: { clientId } },
    select: { id: true },
  });
  const known = new Set(boards.map((b) => b.id));
  await Promise.all(
    ids
      .filter((id) => known.has(id))
      .map((id, i) =>
        prisma.wikiInsightBoard.update({ where: { id }, data: { orderKey: i }, select: { id: true } }),
      ),
  );
}
