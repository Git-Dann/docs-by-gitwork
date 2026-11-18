/**
 * Move a client's wiki Sheets onto their Board as product cards (CLAUDE.md §127). The rules are
 * pure, in src/lib/sheets-to-board.ts; this file reads, writes and copies screenshots.
 *
 *  - **The dry run writes nothing.** `planSheetsToBoard` returns what an apply would do.
 *  - **Apply is ONE transaction under a per-client advisory lock**: two applies at once can't
 *    both see "nothing moved yet", and a failure part-way leaves the board as it was. Planning
 *    happens inside, after the lock is held. A second apply makes nothing (each card carries
 *    `externalRef = "sheet-row:<rowId>"`).
 *  - **Every write is scoped to the client**, and a dev task is linked only while it is on this
 *    client and delivers no card yet (in the WHERE, so a change in the meantime wins).
 *  - **Screenshots are copied after the transaction**, a few at a time inside a time budget,
 *    each attach under a per-card lock that re-reads what the card has (so two runs can't attach
 *    one twice). A file from another client's wiki is never copied. A failure is reported, never
 *    thrown, and the next apply tries again.
 *  - **Sheets themselves are not touched.** The rows stay in the database, unread, as the record.
 *
 * Bounded: one query for the sheets, one for the sent-to tasks (`id in`), one for the refs. No
 * work over rows × tasks.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { bytesForPrisma } from "@/lib/prisma-bytes";
import { sniffImage } from "@/lib/forge-import/images";
import { parseBoardColumns } from "@/lib/tasks/board-columns";
import {
  SHEET_ROW_REF_PREFIX,
  planSheetsToBoard as planRows,
  rowUploads,
  sheetRowRef,
  type LinkedTask,
  type RowPlan,
  type SheetsToBoardPlan,
} from "@/lib/sheets-to-board";
import { parseRowCells, parseSheetColumns } from "@/lib/table/cells";
import { readStoredUpload } from "@/server/blob-storage";
import { recordAuditEntry } from "@/server/audit-log";
import type { TaskStatus } from "@/types/tasks";

export class SheetsToBoardError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

/** Screenshots copied at once, and how long the copy may run before leaving the rest for next time. */
export const SHEET_IMAGE_CONCURRENCY = 3;
export const SHEET_IMAGE_BUDGET_MS = 120_000;
const THUMB_SIZE = 320;

type Db = Prisma.TransactionClient | typeof prisma;

interface Target {
  workspaceId: string;
  clientId: string;
}

/** The client, proven to be in the caller's workspace, and its wiki. Anything else is a 404. */
async function loadTarget(db: Db, t: Target) {
  const client = await db.workspaceClient.findFirst({
    where: { id: t.clientId, workspaceId: t.workspaceId },
    select: { id: true, taskBoardColumns: true, wiki: { select: { id: true } } },
  });
  if (!client) throw new SheetsToBoardError("Client not found.", 404);
  return { columns: parseBoardColumns(client.taskBoardColumns), wikiId: client.wiki?.id ?? null };
}

async function loadInputs(db: Db, t: Target) {
  const { columns, wikiId } = await loadTarget(db, t);
  if (!wikiId) return { columns, wikiId, sheets: [], linkedTasks: new Map<string, LinkedTask>(), existingRefs: new Set<string>() };
  const sheets = await db.wikiSheet.findMany({
    where: { wikiId },
    orderBy: [{ orderKey: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      title: true,
      columns: true,
      titleColumnId: true,
      rows: {
        where: { deletedAt: null },
        orderBy: [{ orderKey: "asc" }, { createdAt: "asc" }],
        select: { id: true, cells: true, taskId: true, createdByKind: true, createdByName: true },
      },
    },
  });
  const taskIds = [...new Set(sheets.flatMap((s) => s.rows.map((r) => r.taskId).filter((id): id is string => Boolean(id))))];
  const tasks = taskIds.length
    ? await db.task.findMany({
        // Scoped to the client: a row pointing at another client's task finds nothing here,
        // so it's treated as never sent.
        where: { id: { in: taskIds }, workspaceId: t.workspaceId, clientId: t.clientId },
        select: { id: true, clientId: true, status: true, itemType: true, productCardId: true, boardList: true, startedAt: true, completedAt: true },
      })
    : [];
  const linkedTasks = new Map<string, LinkedTask>(
    tasks.map((x) => [
      x.id,
      {
        id: x.id,
        clientId: x.clientId,
        status: x.status as TaskStatus,
        itemType: x.itemType,
        productCardId: x.productCardId,
        boardList: x.boardList,
        startedAt: x.startedAt?.toISOString() ?? null,
        completedAt: x.completedAt?.toISOString() ?? null,
      },
    ]),
  );
  const refs = await db.task.findMany({
    where: { workspaceId: t.workspaceId, clientId: t.clientId, externalRef: { startsWith: SHEET_ROW_REF_PREFIX } },
    select: { externalRef: true },
  });
  const existingRefs = new Set(refs.map((r) => r.externalRef).filter((r): r is string => Boolean(r)));
  return { columns, wikiId, sheets, linkedTasks, existingRefs };
}

/** Dry run: what moving this client's sheets would do. Writes nothing. */
export async function planSheetsToBoard(t: Target): Promise<SheetsToBoardPlan> {
  const inputs = await loadInputs(prisma, t);
  return planRows({ clientId: t.clientId, sheets: inputs.sheets, existingRefs: inputs.existingRefs, linkedTasks: inputs.linkedTasks, boardColumns: inputs.columns });
}

export interface SheetsToBoardResult {
  created: number;
  /** Dev tasks linked to their new card. */
  devLinked: number;
  /** Rows whose task was already a card, now in the list. */
  joined: number;
  /** Rows already moved by an earlier run. */
  skipped: number;
  cellsCarried: number;
  imagesCopied: number;
  imagesFailed: Array<{ rowId: string; key: string; reason: string }>;
  imagesDeferred: number;
  /** The plan the apply carried out, for the report. */
  plan: SheetsToBoardPlan;
}

type ImageFile = { bytes: Buffer; mime: string; filename: string; wikiId: string };
export type SheetFileReader = (key: string) => Promise<ImageFile | null>;

const readUpload: SheetFileReader = async (key) => {
  const row = await prisma.wikiSheetFile.findUnique({
    where: { key },
    select: { bytes: true, storageKey: true, mime: true, filename: true, wikiId: true },
  });
  if (!row) return null;
  const bytes = await readStoredUpload({ storageKey: row.storageKey, bytes: row.bytes });
  return bytes ? { bytes, mime: row.mime, filename: row.filename, wikiId: row.wikiId } : null;
};

function objectOf(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** The screenshots a card already has from its row: metadata.sheet.images, file key → attachment id. */
export function copiedSheetImages(metadata: unknown): Record<string, string> {
  const images = objectOf(objectOf(objectOf(metadata).sheet).images);
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(images)) if (typeof v === "string") out[k] = v;
  return out;
}

/** Apply the move: create the cards in one transaction, then copy their screenshots. */
export async function applySheetsToBoard(
  t: Target & { actorId: string | null },
  opts: { readFile?: SheetFileReader; budgetMs?: number; now?: () => number } = {},
): Promise<SheetsToBoardResult> {
  const now = new Date();
  const out = await prisma.$transaction(
    async (tx) => {
      const lock = await tx.$queryRaw<Array<{ locked: boolean }>>`SELECT pg_try_advisory_xact_lock(hashtext(${`sheets-to-board:${t.clientId}`})) AS locked`;
      if (!lock[0]?.locked) throw new SheetsToBoardError("A move for this client is already running. Try again when it has finished.", 409);
      const inputs = await loadInputs(tx, t);
      const plan = planRows({ clientId: t.clientId, sheets: inputs.sheets, existingRefs: inputs.existingRefs, linkedTasks: inputs.linkedTasks, boardColumns: inputs.columns });

      // New cards go to the bottom of their status, in sheet order.
      const tops = await tx.task.groupBy({ by: ["status"], where: { workspaceId: t.workspaceId, clientId: t.clientId }, _max: { orderKey: true } });
      const nextOrder = new Map(tops.map((x) => [x.status as string, (x._max.orderKey ?? 0) + 1]));
      const takeOrder = (status: string) => {
        const n = nextOrder.get(status) ?? 1;
        nextOrder.set(status, n + 1);
        return n;
      };

      let created = 0;
      let devLinked = 0;
      let joined = 0;
      for (const row of plan.rows) {
        if (row.action === "join-card" && row.cardTaskId) {
          const done = await tx.task.updateMany({
            where: { id: row.cardTaskId, workspaceId: t.workspaceId, clientId: t.clientId, boardList: null },
            data: { boardList: row.boardList },
          });
          joined += done.count;
          continue;
        }
        if (row.action !== "create") continue;
        const card = await tx.task.create({ data: cardData(t, row, takeOrder(row.status), now), select: { id: true } });
        created++;
        if (row.linkDevTaskId) {
          const linked = await tx.task.updateMany({
            where: { id: row.linkDevTaskId, workspaceId: t.workspaceId, clientId: t.clientId, itemType: null, productCardId: null },
            data: { productCardId: card.id },
          });
          devLinked += linked.count;
        }
      }
      return { plan, created, devLinked, joined };
    },
    { maxWait: 10_000, timeout: 120_000 },
  );

  const images = await copySheetImages(t, opts);
  const result: SheetsToBoardResult = {
    created: out.created,
    devLinked: out.devLinked,
    joined: out.joined,
    skipped: out.plan.counts.already,
    cellsCarried: out.plan.counts.cellsCarried,
    imagesCopied: images.copied,
    imagesFailed: images.failed,
    imagesDeferred: images.deferred,
    plan: out.plan,
  };
  await recordAuditEntry({
    workspaceId: t.workspaceId,
    actorId: t.actorId,
    action: "tasks.sheets_to_board.applied",
    target: t.clientId,
    metadata: { created: out.created, devLinked: out.devLinked, joined: out.joined, skipped: result.skipped, imagesCopied: images.copied, imagesFailed: images.failed.length },
  });
  return result;
}

function cardData(t: Target & { actorId: string | null }, row: RowPlan, orderKey: number, now: Date): Prisma.TaskUncheckedCreateInput {
  const sheet: Prisma.InputJsonObject = {
    sheetId: row.sheetId,
    rowId: row.rowId,
    sheetTitle: row.sheetTitle,
    createdByKind: row.createdByKind,
    createdByName: row.createdByName,
    movedAt: now.toISOString(),
    images: {},
  };
  return {
    workspaceId: t.workspaceId,
    clientId: t.clientId,
    createdById: t.actorId,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    orderKey,
    boardColumnId: row.columnId,
    itemType: row.itemType,
    area: row.area,
    externalRef: sheetRowRef(row.rowId),
    boardList: row.boardList,
    metadata: { sheet },
    startedAt: row.startedAt ? new Date(row.startedAt) : row.completedAt ? new Date(row.completedAt) : null,
    completedAt: row.completedAt ? new Date(row.completedAt) : null,
  };
}

interface ImageJob {
  taskId: string;
  rowId: string;
  key: string;
}

/**
 * Copy the uploaded screenshots of every moved row onto its card. Looks at the cards that exist
 * (this run's and earlier runs'), so a screenshot that failed last time is tried again.
 */
export async function copySheetImages(
  t: Target,
  opts: { readFile?: SheetFileReader; budgetMs?: number; now?: () => number } = {},
): Promise<{ copied: number; failed: Array<{ rowId: string; key: string; reason: string }>; deferred: number }> {
  const read = opts.readFile ?? readUpload;
  const clock = opts.now ?? (() => Date.now());
  const budget = opts.budgetMs ?? SHEET_IMAGE_BUDGET_MS;
  const started = clock();
  const { wikiId } = await loadTarget(prisma, t);
  const result = { copied: 0, failed: [] as Array<{ rowId: string; key: string; reason: string }>, deferred: 0 };
  if (!wikiId) return result;

  const cards = await prisma.task.findMany({
    where: { workspaceId: t.workspaceId, clientId: t.clientId, externalRef: { startsWith: SHEET_ROW_REF_PREFIX } },
    select: { id: true, externalRef: true, metadata: true },
  });
  if (!cards.length) return result;
  const rowIds = cards.map((c) => c.externalRef!.slice(SHEET_ROW_REF_PREFIX.length));
  const rows = await prisma.wikiSheetRow.findMany({
    where: { id: { in: rowIds }, sheet: { wikiId } },
    select: { id: true, cells: true, sheet: { select: { columns: true } } },
  });
  const rowById = new Map(rows.map((r) => [r.id, r]));
  const jobs: ImageJob[] = [];
  for (const card of cards) {
    const rowId = card.externalRef!.slice(SHEET_ROW_REF_PREFIX.length);
    const row = rowById.get(rowId);
    if (!row) continue;
    const columns = parseSheetColumns(row.sheet.columns);
    const done = copiedSheetImages(card.metadata);
    for (const u of rowUploads(columns, parseRowCells(row.cells, columns))) {
      if (!done[u.key]) jobs.push({ taskId: card.id, rowId, key: u.key });
    }
  }
  if (!jobs.length) return result;
  const sharp = (await import("sharp")).default;

  let next = 0;
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= jobs.length) return;
      const job = jobs[i];
      if (clock() - started > budget) {
        result.deferred++;
        continue;
      }
      try {
        const file = await read(job.key);
        if (!file) throw new Error("the uploaded file is no longer stored");
        // Only this client's own uploads: a key from another wiki stays a link in the description.
        if (file.wikiId !== wikiId) throw new Error("it was uploaded to a different client's wiki");
        const mime = sniffImage(file.bytes);
        if (!mime) throw new Error("its contents aren't a PNG, JPEG, GIF or WebP image");
        const thumb = await sharp(file.bytes).rotate().resize(THUMB_SIZE, THUMB_SIZE, { fit: "inside" }).jpeg({ quality: 80 }).toBuffer();
        if (await attachOnce(t, job, file, mime, thumb)) result.copied++;
      } catch (err) {
        result.failed.push({ rowId: job.rowId, key: job.key, reason: err instanceof Error ? err.message : "unknown error" });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(SHEET_IMAGE_CONCURRENCY, jobs.length) }, worker));
  return result;
}

async function attachOnce(t: Target, job: ImageJob, file: ImageFile, mime: string, thumb: Buffer): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    // pg_advisory_xact_lock returns void, which $queryRaw can't read (§125.1 follow-up).
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`sheet-img:${job.taskId}`}))`;
    const task = await tx.task.findFirst({ where: { id: job.taskId, workspaceId: t.workspaceId, clientId: t.clientId }, select: { metadata: true } });
    if (!task || copiedSheetImages(task.metadata)[job.key]) return false;
    const row = await tx.taskAttachment.create({
      data: { taskId: job.taskId, uploadedById: null, image: bytesForPrisma(file.bytes), thumb: bytesForPrisma(thumb), mime, filename: file.filename },
      select: { id: true },
    });
    const meta = objectOf(task.metadata);
    const sheet = objectOf(meta.sheet);
    await tx.task.update({
      where: { id: job.taskId },
      data: { metadata: { ...meta, sheet: { ...sheet, images: { ...copiedSheetImages(task.metadata), [job.key]: row.id } } } as Prisma.InputJsonObject },
    });
    return true;
  });
}
