/**
 * Importing a client's product plan from their own planning tool into their Foundry board.
 *
 * First client: Big Wedge, whose planning site (a WordPress "Forge" plugin) publishes the plan as
 * public JSON. The rules live in src/lib/forge-import/ and are pure; this file reads the feed and
 * the board, and on apply writes what the plan says. CLAUDE.md §125 has the why.
 *
 * Safety, in the order it matters:
 *   1. Planning writes NOTHING. The dry run is the plan.
 *   2. Applying re-plans against the live board inside ONE transaction, under a per-client lock,
 *      so two applies can't both import everything, and a failure part-way leaves the board as
 *      it was. A card carries "forge:<id>" (a release too) and is never imported twice.
 *   3. Applying only CREATES cards and releases, LINKS existing dev tasks to cards, and FILLS
 *      fields that are empty — each fill guarded in its WHERE, and each field filled at most once
 *      (metadata.forge.filled), so a value the team set or cleared is never overwritten. It never
 *      deletes, archives, reparents, renames, re-statuses or re-columns a task the team already has.
 *   4. It refuses to run until the board has every column it needs, rather than guessing.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseBoardColumns, columnNameKey } from "@/lib/tasks/board-columns";
import { fetchScannableUrl } from "@/server/pulse-lite/url-guard";
import { copyForgeImages, type ImageCopyResult } from "@/server/forge-images";
import { copiedImages } from "@/lib/forge-import/images";
import { recordAuditEntry } from "@/server/audit-log";
import { planForgeKeyDates, syncForgeKeyDates } from "@/server/wiki-board-key-date-import";
import { parseForgeFeed, parseForgeJson, type ForgeFeed } from "@/lib/forge-import/feed";
import {
  buildForgePlan,
  matchFeedSteps,
  type BoardTask,
  type FeedMatches,
  type ForgePlan,
  type ReviewDecision,
} from "@/lib/forge-import/plan";

/** Big Wedge's feed. The routes accept another URL, but this is the one in use. */
export const BIG_WEDGE_FORGE_FEED = "https://ops.bigwedgegolf.com/wp-json/forge/v1/items";

/** The feed is ~80KB today; a response this large is not a plan. */
const MAX_FEED_BYTES = 5 * 1024 * 1024;

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

type Db = Pick<Prisma.TransactionClient, "workspaceClient" | "task" | "clientRelease">;

function forgeFilledOf(metadata: unknown): string[] {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return [];
  const forge = (metadata as Record<string, unknown>).forge;
  if (!forge || typeof forge !== "object" || Array.isArray(forge)) return [];
  const filled = (forge as Record<string, unknown>).filled;
  return Array.isArray(filled) ? filled.filter((f): f is string => typeof f === "string") : [];
}

async function loadBoard(db: Db, workspaceId: string, clientId: string) {
  const client = await db.workspaceClient.findFirst({
    where: { id: clientId, workspaceId },
    select: { id: true, taskBoardColumns: true },
  });
  if (!client) throw new ForgeImportError("Client not found.", 404);
  // Every task, archived included: an archived task that is the same work still gets linked,
  // and an archived card still counts as imported.
  const [rows, releases] = await Promise.all([
    db.task.findMany({ where: { workspaceId, clientId }, select: BOARD_TASK_SELECT }),
    db.clientRelease.findMany({
      where: { workspaceId, clientId },
      select: { id: true, version: true, name: true, externalRef: true, docUrl: true },
    }),
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
    forgeFilled: forgeFilledOf(t.metadata),
    forgeImages: Object.keys(copiedImages(t.metadata)),
  }));
  return { columns: parseBoardColumns(client.taskBoardColumns), tasks, rows, releases };
}

/** Longest the title matching may run before the import refuses rather than carry on. */
export const MATCH_BUDGET_MS = 60_000;

/**
 * Title matching, handing control back to the server between feed items. Matching is n × m and
 * runs on the one thread that answers every request: run straight through, the first live dry
 * run against Wedge's board froze foundry.gitwork.co.uk for minutes (Nov 2026). Pausing after
 * each item keeps the site answering; the budget stops a pathological board running forever.
 */
export async function matchFeedYielding(
  feed: ForgeFeed,
  tasks: BoardTask[],
  opts: { budgetMs?: number; now?: () => number } = {},
): Promise<FeedMatches> {
  const now = opts.now ?? (() => Date.now());
  const budget = opts.budgetMs ?? MATCH_BUDGET_MS;
  const started = now();
  const run = matchFeedSteps(feed, tasks);
  for (let step = run.next(); !step.done; step = run.next()) {
    await new Promise<void>((resolve) => setImmediate(resolve));
    if (now() - started > budget) {
      throw new ForgeImportError(
        "Matching this board against the feed is taking too long, so it was stopped before it slowed Foundry down.",
        503,
      );
    }
  }
  return run.result();
}

export async function planForgeImport(input: {
  workspaceId: string;
  clientId: string;
  feedUrl?: string;
  decisions?: ReviewDecision[];
}): Promise<ForgePlan> {
  const feed = await fetchForgeFeed(input.feedUrl ?? BIG_WEDGE_FORGE_FEED);
  const board = await loadBoard(prisma, input.workspaceId, input.clientId);
  const matched = await matchFeedYielding(feed, board.tasks);
  return buildForgePlan({ feed, tasks: board.tasks, releases: board.releases, columns: board.columns, decisions: input.decisions, matched });
}

export interface ForgeApplyResult {
  created: number;
  linked: number;
  devLinked: number;
  filled: number;
  releasesCreated: number;
  /** The planning tool's calendar dates added to the Board's Schedule as key dates. */
  keyDatesCreated: number;
  pendingReview: number;
  waiting: number;
  skipped: number;
  alreadyImported: number;
  /** Screenshots copied onto cards after the import, and any that couldn't be (tried again next run). */
  imagesCopied: number;
  imagesFailed: ImageCopyResult["failed"];
  imagesDeferred: number;
}

/** Features before sub-items, so a sub-item is made as its feature's subtask. */
const ORDER = new Map<string, number>([
  ["feature", 0],
  ["subitem", 1],
  ["bug", 2],
  ["feedback", 3],
]);

/** The fields a fill may write. Each is written only where the task still has no value. */
const FILL_FIELDS = ["itemType", "externalRef", "tier", "area", "estimateHours", "releaseId", "description", "parentId"] as const;
type FillField = (typeof FILL_FIELDS)[number];

/** "Still has no value", in the WHERE, so a value the team set a moment ago is never overwritten. */
function emptyWhere(field: FillField): Prisma.TaskWhereInput {
  return field === "description" ? { OR: [{ description: null }, { description: "" }] } : { [field]: null };
}

export async function applyForgeImport(input: {
  workspaceId: string;
  clientId: string;
  actorId: string | null;
  feedUrl?: string;
  approvedReviewLinks: ReviewDecision[];
}): Promise<ForgeApplyResult> {
  const { workspaceId, clientId } = input;
  // The feed is read first, outside the transaction: a network call has no business holding
  // a database lock.
  const feed = await fetchForgeFeed(input.feedUrl ?? BIG_WEDGE_FORGE_FEED);
  const now = new Date().toISOString();

  // ONE transaction, under a per-client lock. Two applies at once (a double click, the app and
  // Claude together) can't both see "nothing imported yet" and both make every card: the second
  // waits for nothing and is refused. And because it's one transaction, a failure part-way
  // leaves the board exactly as it was. Planning happens INSIDE, after the lock is held.
  const result = await prisma.$transaction(
    async (tx) => {
      const lock = await tx.$queryRaw<Array<{ locked: boolean }>>`SELECT pg_try_advisory_xact_lock(hashtext(${`forge:${clientId}`})) AS locked`;
      if (!lock[0]?.locked) throw new ForgeImportError("An import for this client is already running. Try again when it has finished.", 409);

      const board = await loadBoard(tx, workspaceId, clientId);
      const matched = await matchFeedYielding(feed, board.tasks);
      const plan = buildForgePlan({
        feed,
        tasks: board.tasks,
        releases: board.releases,
        columns: board.columns,
        decisions: input.approvedReviewLinks,
        matched,
      });
      if (plan.missingColumns.length) {
        throw new ForgeImportError(`Add these board columns first: ${plan.missingColumns.join(", ")}.`, 409);
      }

      const out: Omit<ForgeApplyResult, "imagesCopied" | "imagesFailed" | "imagesDeferred"> = {
        created: 0,
        linked: 0,
        devLinked: 0,
        filled: 0,
        releasesCreated: 0,
        keyDatesCreated: 0,
        pendingReview: plan.counts.review,
        waiting: plan.counts.waiting,
        skipped: plan.counts.skip,
        alreadyImported: plan.counts.alreadyImported,
      };

      // Releases first, so cards can point at them.
      const releaseIdByForge = new Map<string, string>();
      const topRelease = await tx.clientRelease.findFirst({ where: { workspaceId, clientId }, orderBy: { orderKey: "desc" }, select: { orderKey: true } });
      let releaseOrder = topRelease?.orderKey ?? 0;
      for (const r of plan.releases) {
        if (r.existingId) {
          releaseIdByForge.set(r.forgeId, r.existingId);
          // Stamp the Forge id on a release recognised by version + name, and add its doc where
          // it has none. Guarded in the WHERE, like every fill.
          if (r.stampRef) {
            await tx.clientRelease.updateMany({ where: { id: r.existingId, workspaceId, clientId, externalRef: null }, data: { externalRef: r.externalRef } });
          }
          if (r.docUrl) {
            await tx.clientRelease.updateMany({ where: { id: r.existingId, workspaceId, clientId, docUrl: null }, data: { docUrl: r.docUrl } });
          }
          continue;
        }
        const created = await tx.clientRelease.create({
          data: {
            workspaceId,
            clientId,
            version: r.version,
            name: r.name,
            startDate: r.startDate ? new Date(r.startDate) : null,
            endDate: r.endDate ? new Date(r.endDate) : null,
            orderKey: ++releaseOrder,
            externalRef: r.externalRef,
            docUrl: r.docUrl,
          },
          select: { id: true },
        });
        releaseIdByForge.set(r.forgeId, created.id);
        out.releasesCreated++;
      }

      // The planning tool's own calendar (content drops, events) → the Schedule's key dates.
      // Idempotent by ref; a date deleted in Foundry is never brought back.
      out.keyDatesCreated = (await syncForgeKeyDates(tx, workspaceId, clientId, feed.keyDates)).created;

      const columnIdByName = new Map(board.columns.map((c) => [columnNameKey(c.name), c]));
      const columnFor = (name: string | null, status: string): string | null => {
        if (!name) return null;
        const col = columnIdByName.get(columnNameKey(name));
        // A column belongs to one status; a mismatch leaves the task in its status's lane.
        return col && col.stage === status ? col.id : null;
      };
      const rowById = new Map(board.rows.map((r) => [r.id, r]));

      // New cards go to the bottom of their status, in the order Big Wedge lists them.
      const tops = await tx.task.groupBy({ by: ["status"], where: { workspaceId, clientId }, _max: { orderKey: true } });
      const nextOrder = new Map(tops.map((t) => [t.status as string, (t._max.orderKey ?? 0) + 1]));
      const takeOrder = (status: string) => {
        const n = nextOrder.get(status) ?? 1;
        nextOrder.set(status, n + 1);
        return n;
      };

      // The card each Forge item became (made now, linked now, or imported before), and whether
      // that card is itself a subtask: a sub-item is never nested more than one level deep.
      const taskIdByForge = new Map<string, string>();
      const parentOfCard = new Map<string, string | null>();
      for (const i of plan.items) {
        if (i.target && (i.action === "link" || i.action === "already-imported")) {
          taskIdByForge.set(i.forgeId, i.target.id);
          parentOfCard.set(i.target.id, rowById.get(i.target.id)?.parentId ?? null);
        }
      }
      /** The card a sub-item hangs under: its feature's card, or that card's own parent. */
      const topCardFor = (forgeId: string | null): string | null => {
        if (!forgeId) return null;
        const id = taskIdByForge.get(forgeId);
        if (!id) return null;
        return parentOfCard.get(id) ?? id;
      };

      const work = plan.items
        .filter((i) => i.action === "create" || i.action === "link" || i.action === "already-imported")
        .sort((a, b) => (ORDER.get(a.forgeType) ?? 9) - (ORDER.get(b.forgeType) ?? 9));

      for (const item of work) {
        const c = item.card;
        const releaseId = c.releaseForgeId ? releaseIdByForge.get(c.releaseForgeId) ?? null : null;

        if (item.action === "create") {
          const parentId = c.parentForgeId ? topCardFor(c.parentForgeId) : null;
          const set: Partial<Record<FillField, unknown>> = {
            itemType: c.itemType,
            externalRef: c.externalRef,
            tier: c.tier,
            area: c.area,
            estimateHours: c.estimateHours,
            releaseId,
            description: c.description,
            parentId,
          };
          const filled = FILL_FIELDS.filter((f) => set[f] !== null && set[f] !== undefined);
          const forgeMeta = (c.metadata.forge ?? {}) as Prisma.InputJsonObject;
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
              // Only a card the importer MAKES is placed in a column. A team task is never moved.
              boardColumnId: columnFor(c.column, c.status),
              releaseId,
              parentId,
              itemType: c.itemType,
              tier: c.tier,
              area: c.area,
              estimateHours: c.estimateHours,
              externalRef: c.externalRef,
              metadata: { forge: { ...forgeMeta, filled, filledAt: now } },
              startedAt: c.startedAt ? new Date(c.startedAt) : c.completedAt ? new Date(c.completedAt) : null,
              completedAt: c.completedAt ? new Date(c.completedAt) : null,
            },
            select: { id: true },
          });
          taskIdByForge.set(item.forgeId, created.id);
          parentOfCard.set(created.id, parentId);
          out.created++;
          if (item.devLinks.length) {
            // Only a team task that delivers no card yet; it is not otherwise touched.
            const linked = await tx.task.updateMany({
              where: { id: { in: item.devLinks.map((d) => d.id) }, workspaceId, clientId, itemType: null, productCardId: null },
              data: { productCardId: created.id },
            });
            out.devLinked += linked.count;
          }
          continue;
        }

        // link / already-imported: fill what's empty, one field at a time, each guarded in its
        // WHERE. Never the column or status of a task the team already had.
        const target = item.target ? rowById.get(item.target.id) : undefined;
        if (!target) continue;
        const values: Partial<Record<FillField, unknown>> = {
          itemType: c.itemType,
          externalRef: c.externalRef,
          tier: c.tier,
          area: c.area,
          estimateHours: c.estimateHours,
          releaseId,
          description: c.description,
          parentId: item.fill.includes("parentId") ? topCardFor(c.parentForgeId) : null,
        };
        const filledNow: FillField[] = [];
        for (const field of FILL_FIELDS) {
          if (!item.fill.includes(field)) continue;
          const value = values[field];
          if (value === null || value === undefined) continue;
          if (field === "parentId" && value === target.id) continue;
          const done = await tx.task.updateMany({
            where: { AND: [{ id: target.id, workspaceId, clientId }, emptyWhere(field)] },
            data: { [field]: value } as Prisma.TaskUncheckedUpdateManyInput,
          });
          if (done.count) filledNow.push(field);
        }
        const meta = target.metadata && typeof target.metadata === "object" && !Array.isArray(target.metadata) ? (target.metadata as Prisma.JsonObject) : {};
        const prevForge = meta.forge && typeof meta.forge === "object" && !Array.isArray(meta.forge) ? (meta.forge as Prisma.JsonObject) : null;
        if (filledNow.length || !prevForge) {
          // Remember what was filled, so a later run never fills it again.
          const filled = [...new Set([...forgeFilledOf(meta), ...filledNow])];
          await tx.task.updateMany({
            where: { id: target.id, workspaceId, clientId },
            data: { metadata: { ...meta, forge: { ...(c.metadata.forge as Prisma.InputJsonObject), ...(prevForge ?? {}), filled, filledAt: now } } },
          });
        }
        if (item.action === "link") out.linked++;
        else if (filledNow.length) out.filled++;
      }
      return out;
    },
    { maxWait: 10_000, timeout: 300_000 },
  );

  // Screenshots, after the transaction: downloads never hold the lock.
  const images = await copyForgeImages({ workspaceId, clientId, feed });
  const full: ForgeApplyResult = {
    ...result,
    imagesCopied: images.copied,
    imagesFailed: images.failed,
    imagesDeferred: images.deferred,
  };
  await recordAuditEntry({
    workspaceId,
    actorId: input.actorId,
    action: "tasks.forge_import.applied",
    target: clientId,
    metadata: { ...result, imagesCopied: images.copied, imagesFailed: images.failed.length, decisions: input.approvedReviewLinks.length },
  });
  return full;
}

export interface ForgeKeyDatesResult {
  applied: boolean;
  /** The dates that would be (or were) added, by title and date. */
  create: Array<{ title: string; date: string }>;
  existing: number;
  skipped: number;
  created: number;
}

/**
 * Bring the planning tool's calendar dates onto the client's Schedule without running the whole
 * plan import: a dry run unless `apply`. Apply takes the same per-client lock as the plan import,
 * so the two can't both add the same dates.
 */
export async function importForgeKeyDates(input: {
  workspaceId: string;
  clientId: string;
  feedUrl?: string;
  apply: boolean;
}): Promise<ForgeKeyDatesResult> {
  const { workspaceId, clientId } = input;
  const feed = await fetchForgeFeed(input.feedUrl ?? BIG_WEDGE_FORGE_FEED);
  if (!input.apply) {
    const plan = await planForgeKeyDates(prisma, clientId, feed.keyDates);
    return { applied: false, create: plan.create.map(({ title, date }) => ({ title, date })), existing: plan.existing, skipped: plan.skipped, created: 0 };
  }
  return prisma.$transaction(async (tx) => {
    const lock = await tx.$queryRaw<Array<{ locked: boolean }>>`SELECT pg_try_advisory_xact_lock(hashtext(${`forge:${clientId}`})) AS locked`;
    if (!lock[0]?.locked) throw new ForgeImportError("An import for this client is already running. Try again when it has finished.", 409);
    const done = await syncForgeKeyDates(tx, workspaceId, clientId, feed.keyDates);
    return { applied: true, create: done.create.map(({ title, date }) => ({ title, date })), existing: done.existing, skipped: done.skipped, created: done.created };
  });
}
