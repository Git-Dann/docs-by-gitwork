/**
 * Importing a client's product plan from their own planning tool into their Foundry board.
 *
 * First client: Big Wedge, whose planning site (a WordPress "Forge" plugin) publishes the plan as
 * public JSON. The rules live in src/lib/forge-import/ and are pure; this file reads the feed and
 * the board, and on apply writes what the plan says. CLAUDE.md §125 has the why.
 *
 * Safety, in the order it matters:
 *   1. Planning writes NOTHING. The dry run is the plan.
 *   2. Applying re-plans against the live board first, so a re-run, or a crash half-way, only
 *      does what's left. A card carries "forge:<id>" and is never imported twice.
 *   3. Applying only CREATES cards and releases, LINKS existing dev tasks to cards, and FILLS
 *      fields that are empty. It never deletes, archives, reparents, renames or re-statuses a
 *      task the team already has.
 *   4. It refuses to run until the board has every column it needs, rather than guessing.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseBoardColumns, columnNameKey } from "@/lib/tasks/board-columns";
import { fetchScannableUrl } from "@/server/pulse-lite/url-guard";
import { recordAuditEntry } from "@/server/audit-log";
import { parseForgeFeed, parseForgeJson, type ForgeFeed } from "@/lib/forge-import/feed";
import { buildForgePlan, type BoardTask, type ForgePlan, type ReviewDecision } from "@/lib/forge-import/plan";

/** Big Wedge's feed. The routes accept another URL, but this is the one in use. */
export const BIG_WEDGE_FORGE_FEED = "https://ops.bigwedgegolf.com/wp-json/forge/v1/items";

/** The feed is ~80KB today; a response this large is not a plan. */
const MAX_FEED_BYTES = 5 * 1024 * 1024;
const BATCH = 50;

export class ForgeImportError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

async function readCapped(res: Response): Promise<string> {
  const length = Number(res.headers.get("content-length") ?? "0");
  if (length > MAX_FEED_BYTES) throw new ForgeImportError("The plan feed is too large to import.", 413);
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_FEED_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new ForgeImportError("The plan feed is too large to import.", 413);
    }
    chunks.push(value);
  }
  return new TextDecoder("utf-8").decode(Buffer.concat(chunks));
}

/** Read the feed through the SSRF guard: https only, every redirect hop re-checked. */
export async function fetchForgeFeed(feedUrl: string): Promise<ForgeFeed> {
  let url: URL;
  try {
    url = new URL(feedUrl);
  } catch {
    throw new ForgeImportError("That isn't a valid feed address.");
  }
  if (url.protocol !== "https:") throw new ForgeImportError("The feed address must start with https://.");
  let res: Response;
  try {
    res = await fetchScannableUrl(url.toString(), { headers: { accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
  } catch (err) {
    throw new ForgeImportError(`Couldn't read the plan feed: ${err instanceof Error ? err.message : "no answer"}.`, 502);
  }
  if (!res.ok) throw new ForgeImportError(`The plan feed answered ${res.status}, so nothing was read.`, 502);
  try {
    return parseForgeFeed(parseForgeJson(await readCapped(res)));
  } catch (err) {
    if (err instanceof ForgeImportError) throw err;
    throw new ForgeImportError("The plan feed isn't valid JSON, so nothing was read.", 502);
  }
}

const BOARD_TASK_SELECT = {
  id: true,
  title: true,
  status: true,
  parentId: true,
  archivedAt: true,
  itemType: true,
  productCardId: true,
  externalRef: true,
  description: true,
  releaseId: true,
  tier: true,
  area: true,
  estimateHours: true,
  boardColumnId: true,
  metadata: true,
} as const satisfies Prisma.TaskSelect;

async function loadBoard(workspaceId: string, clientId: string) {
  const client = await prisma.workspaceClient.findFirst({
    where: { id: clientId, workspaceId },
    select: { id: true, taskBoardColumns: true },
  });
  if (!client) throw new ForgeImportError("Client not found.", 404);
  // Every task, archived included: an archived task that is the same work still gets linked,
  // and an archived card still counts as imported.
  const [rows, releases] = await Promise.all([
    prisma.task.findMany({ where: { workspaceId, clientId }, select: BOARD_TASK_SELECT }),
    prisma.clientRelease.findMany({ where: { workspaceId, clientId }, select: { id: true, version: true, name: true } }),
  ]);
  const tasks: BoardTask[] = rows.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    parentId: t.parentId,
    archived: t.archivedAt !== null,
    itemType: t.itemType,
    productCardId: t.productCardId,
    externalRef: t.externalRef,
    description: t.description,
    releaseId: t.releaseId,
    tier: t.tier,
    area: t.area,
    estimateHours: t.estimateHours,
  }));
  return { columns: parseBoardColumns(client.taskBoardColumns), tasks, rows, releases };
}

export async function planForgeImport(input: {
  workspaceId: string;
  clientId: string;
  feedUrl?: string;
  decisions?: ReviewDecision[];
}): Promise<ForgePlan> {
  const feed = await fetchForgeFeed(input.feedUrl ?? BIG_WEDGE_FORGE_FEED);
  const board = await loadBoard(input.workspaceId, input.clientId);
  return buildForgePlan({ feed, tasks: board.tasks, releases: board.releases, columns: board.columns, decisions: input.decisions });
}

export interface ForgeApplyResult {
  created: number;
  linked: number;
  devLinked: number;
  filled: number;
  releasesCreated: number;
  pendingReview: number;
  skipped: number;
  alreadyImported: number;
}

const ORDER: Record<string, number> = { feature: 0, subitem: 1, bug: 2, feedback: 3 };

export async function applyForgeImport(input: {
  workspaceId: string;
  clientId: string;
  actorId: string | null;
  feedUrl?: string;
  approvedReviewLinks: ReviewDecision[];
}): Promise<ForgeApplyResult> {
  const { workspaceId, clientId } = input;
  const feed = await fetchForgeFeed(input.feedUrl ?? BIG_WEDGE_FORGE_FEED);
  const board = await loadBoard(workspaceId, clientId);
  const plan = buildForgePlan({
    feed,
    tasks: board.tasks,
    releases: board.releases,
    columns: board.columns,
    decisions: input.approvedReviewLinks,
  });
  if (plan.missingColumns.length) {
    throw new ForgeImportError(`Add these board columns first: ${plan.missingColumns.join(", ")}.`, 409);
  }

  const result: ForgeApplyResult = {
    created: 0,
    linked: 0,
    devLinked: 0,
    filled: 0,
    releasesCreated: 0,
    pendingReview: plan.counts.review,
    skipped: plan.counts.skip,
    alreadyImported: plan.counts.alreadyImported,
  };

  // Releases first, so cards can point at them.
  const releaseIdByForge = new Map<string, string>();
  const topRelease = await prisma.clientRelease.findFirst({ where: { workspaceId, clientId }, orderBy: { orderKey: "desc" }, select: { orderKey: true } });
  let releaseOrder = topRelease?.orderKey ?? 0;
  for (const r of plan.releases) {
    if (r.existingId) {
      releaseIdByForge.set(r.forgeId, r.existingId);
      continue;
    }
    const created = await prisma.clientRelease.create({
      data: {
        workspaceId,
        clientId,
        version: r.version.slice(0, 40),
        name: r.name ? r.name.slice(0, 120) : null,
        startDate: r.startDate ? new Date(r.startDate) : null,
        endDate: r.endDate ? new Date(r.endDate) : null,
        orderKey: ++releaseOrder,
      },
      select: { id: true },
    });
    releaseIdByForge.set(r.forgeId, created.id);
    result.releasesCreated++;
  }

  const columnIdByName = new Map(board.columns.map((c) => [columnNameKey(c.name), c]));
  const columnFor = (name: string | null, status: string): string | null => {
    if (!name) return null;
    const col = columnIdByName.get(columnNameKey(name));
    // A column belongs to one status; a mismatch leaves the task in its status's lane.
    return col && col.stage === status ? col.id : null;
  };
  const rowById = new Map(board.rows.map((r) => [r.id, r]));

  // New cards go to the bottom of their status, in the order Big Wedge lists them.
  const tops = await prisma.task.groupBy({ by: ["status"], where: { workspaceId, clientId }, _max: { orderKey: true } });
  const nextOrder = new Map(tops.map((t) => [t.status as string, (t._max.orderKey ?? 0) + 1]));
  const takeOrder = (status: string) => {
    const n = nextOrder.get(status) ?? 1;
    nextOrder.set(status, n + 1);
    return n;
  };

  // The card each Forge item became (made now, linked now, or imported before).
  const taskIdByForge = new Map<string, string>();
  for (const i of plan.items) if (i.target && (i.action === "link" || i.action === "already-imported")) taskIdByForge.set(i.forgeId, i.target.id);

  // Features before their sub-items, so a sub-item can be made as its feature's subtask.
  const work = plan.items
    .filter((i) => i.action === "create" || i.action === "link" || i.action === "already-imported")
    .sort((a, b) => ORDER[a.forgeType] - ORDER[b.forgeType]);

  for (let start = 0; start < work.length; start += BATCH) {
    const chunk = work.slice(start, start + BATCH);
    await prisma.$transaction(
      async (tx) => {
        for (const item of chunk) {
          const c = item.card;
          const releaseId = c.releaseForgeId ? releaseIdByForge.get(c.releaseForgeId) ?? null : null;
          const forgeMeta = c.metadata as Prisma.InputJsonObject;

          if (item.action === "create") {
            const parentId = c.parentForgeId ? taskIdByForge.get(c.parentForgeId) ?? null : null;
            const created = await tx.task.create({
              data: {
                workspaceId,
                clientId,
                createdById: input.actorId,
                title: c.title,
                description: c.description,
                status: c.status,
                priority: c.priority,
                orderKey: takeOrder(c.status),
                boardColumnId: columnFor(c.column, c.status),
                releaseId,
                parentId,
                itemType: c.itemType,
                tier: c.tier,
                area: c.area,
                estimateHours: c.estimateHours,
                externalRef: c.externalRef,
                metadata: forgeMeta,
                startedAt: c.startedAt ? new Date(c.startedAt) : c.completedAt ? new Date(c.completedAt) : null,
                completedAt: c.completedAt ? new Date(c.completedAt) : null,
              },
              select: { id: true },
            });
            taskIdByForge.set(item.forgeId, created.id);
            result.created++;
            if (item.devLinks.length) {
              // Only a team task that delivers no card yet; it is not otherwise touched.
              const linked = await tx.task.updateMany({
                where: { id: { in: item.devLinks.map((d) => d.id) }, workspaceId, clientId, itemType: null, productCardId: null },
                data: { productCardId: created.id },
              });
              result.devLinked += linked.count;
            }
            continue;
          }

          // link / already-imported: fill what's empty, nothing else.
          const target = item.target ? rowById.get(item.target.id) : undefined;
          if (!target) continue;
          const data: Prisma.TaskUncheckedUpdateManyInput = {};
          if (!target.itemType) data.itemType = c.itemType;
          if (!target.externalRef) data.externalRef = c.externalRef;
          if (!target.tier && c.tier) data.tier = c.tier;
          if (!target.area && c.area) data.area = c.area;
          if (target.estimateHours == null && c.estimateHours != null) data.estimateHours = c.estimateHours;
          if (!target.releaseId && releaseId) data.releaseId = releaseId;
          if (!target.description?.trim()) data.description = c.description;
          if (!target.boardColumnId) {
            const col = columnFor(c.column, target.status);
            if (col) data.boardColumnId = col;
          }
          const meta = target.metadata && typeof target.metadata === "object" && !Array.isArray(target.metadata) ? (target.metadata as Prisma.JsonObject) : null;
          if (!meta || !("forge" in meta)) data.metadata = { ...(meta ?? {}), ...forgeMeta };
          if (Object.keys(data).length === 0) continue;
          // updateMany scoped to the client: a stale id can never write to another client's task.
          const done = await tx.task.updateMany({ where: { id: target.id, workspaceId, clientId }, data });
          if (done.count) {
            if (item.action === "link") result.linked++;
            else result.filled++;
          }
        }
      },
      { timeout: 60_000 },
    );
  }

  await recordAuditEntry({
    workspaceId,
    actorId: input.actorId,
    action: "tasks.forge_import.applied",
    target: clientId,
    metadata: { ...result, decisions: input.approvedReviewLinks.length },
  });
  return result;
}
