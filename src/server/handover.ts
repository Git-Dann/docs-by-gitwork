/**
 * Handover — CRUD over the authored half, plus the derived client state.
 *
 * ── The one rule this module keeps ──────────────────────────────────────────
 * The items are AUTHORED and the client state is DERIVED, and they are never
 * merged. `getHandover` stamps `asOf` on every read so the page can say which
 * half is live. A handover whose derived figures were frozen with its prose
 * would be quietly wrong by day three, which is precisely why the July 2026
 * attempt (a Docs `HANDOVER` record) did not survive contact with a week away.
 *
 * ── Gate ────────────────────────────────────────────────────────────────────
 * Admin and above, for READS as well as writes. A handover routinely carries
 * commercial facts — an unsigned retainer, billing that does not match the work
 * — which are not developer-facing. `assertAtLeastAdmin` lets a null caller
 * (the workspace API_KEY: cron and server integrations) through, matching every
 * other Backstage module.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import {
  type EffectiveUser,
  ForbiddenError,
  NotFoundError,
  assertAtLeastAdmin,
} from "@/server/auth/effective-user";
import { getClientQueueSummaries } from "@/server/support";
import type {
  HandoverClientState,
  HandoverDTO,
  HandoverInput,
  HandoverItemDTO,
  HandoverItemInput,
  HandoverItemKind,
  HandoverItemStatus,
  HandoverStatus,
  HandoverSummaryDTO,
} from "@/types/handover";

const ITEM_INCLUDE = {
  owner: { select: { name: true } },
  resolvedBy: { select: { name: true } },
} as const satisfies Prisma.HandoverItemInclude;

const HANDOVER_INCLUDE = {
  user: { select: { name: true } },
  items: { include: ITEM_INCLUDE, orderBy: [{ orderKey: "asc" }, { createdAt: "asc" }] },
} as const satisfies Prisma.HandoverInclude;

type ItemRow = Prisma.HandoverItemGetPayload<{ include: typeof ITEM_INCLUDE }>;
type HandoverRow = Prisma.HandoverGetPayload<{ include: typeof HANDOVER_INCLUDE }>;

/** Day-precision UTC midnight — the convention across the whole of Backstage. */
function dayUtc(value: string | Date): Date {
  const d = new Date(value);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function serializeItem(row: ItemRow): HandoverItemDTO {
  return {
    id: row.id,
    kind: row.kind as HandoverItemKind,
    clientId: row.clientId,
    clientName: row.clientName,
    title: row.title,
    detail: row.detail,
    ownerUserId: row.ownerUserId,
    ownerName: row.owner?.name ?? null,
    cadence: row.cadence,
    channel: row.channel,
    status: row.status as HandoverItemStatus,
    orderKey: row.orderKey,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    resolvedByName: row.resolvedBy?.name ?? null,
  };
}

/**
 * Live state for every active client, batched.
 *
 * Care figures come from `getClientQueueSummaries()` rather than a second count.
 * Writing our own would give the handover and the Care cockpit two numbers for
 * the same client, and a dashboard whose figures disagree with the screen it
 * links to is worse than one with no figures at all (§42.6).
 */
export async function getHandoverClientState(workspaceId: string): Promise<HandoverClientState[]> {
  const clients = await prisma.workspaceClient.findMany({
    where: { workspaceId, status: "ACTIVE", hidden: false },
    select: { id: true, name: true, slug: true },
    orderBy: { name: "asc" },
  });
  if (clients.length === 0) return [];
  const clientIds = clients.map((c) => c.id);
  const now = new Date();

  // `parentId: null, archivedAt: null` matches every other progress calculation in
  // the app — without it subtasks double-count and archived work resurfaces.
  const liveTasks: Prisma.TaskWhereInput = {
    workspaceId,
    clientId: { in: clientIds },
    archivedAt: null,
    parentId: null,
    status: { not: "DONE" },
  };

  const [openRows, overdueRows, supportClients, careCounts] = await Promise.all([
    prisma.task.groupBy({ by: ["clientId"], where: liveTasks, _count: { _all: true } }),
    prisma.task.groupBy({
      by: ["clientId"],
      where: { ...liveTasks, dueDate: { lt: now } },
      _count: { _all: true },
    }),
    prisma.supportClient.findMany({
      where: { workspaceId, workspaceClientId: { in: clientIds } },
      select: { id: true, workspaceClientId: true },
    }),
    getClientQueueSummaries(),
  ]);

  const open = new Map<string, number>();
  for (const r of openRows) if (r.clientId) open.set(r.clientId, r._count._all);
  const overdue = new Map<string, number>();
  for (const r of overdueRows) if (r.clientId) overdue.set(r.clientId, r._count._all);

  // Care is keyed by SupportClient.id; the board is keyed by WorkspaceClient.id. The
  // link is the explicit `workspaceClientId` column and NEVER a name match — the same
  // client is `wedge` in Portal and "Big Wedge Golf" in Care (§42.15).
  const care = new Map<string, { awaiting: number; oldest: string | null }>();
  for (const sc of supportClients) {
    if (!sc.workspaceClientId) continue;
    const summary = careCounts[sc.id];
    if (!summary) continue;
    const prev = care.get(sc.workspaceClientId);
    const oldest =
      prev?.oldest && summary.oldestAwaitingAt
        ? prev.oldest < summary.oldestAwaitingAt
          ? prev.oldest
          : summary.oldestAwaitingAt
        : (prev?.oldest ?? summary.oldestAwaitingAt);
    care.set(sc.workspaceClientId, {
      awaiting: (prev?.awaiting ?? 0) + summary.awaiting,
      oldest,
    });
  }

  return clients.map((c) => {
    const openTasks = open.get(c.id) ?? 0;
    const careAwaiting = care.get(c.id)?.awaiting ?? 0;
    return {
      clientId: c.id,
      clientName: c.name,
      slug: c.slug,
      openTasks,
      overdueTasks: overdue.get(c.id) ?? 0,
      careAwaiting,
      careOldestAwaitingAt: care.get(c.id)?.oldest ?? null,
      thin: openTasks === 0 && careAwaiting === 0,
    };
  });
}

function summarize(row: HandoverRow): HandoverSummaryDTO {
  return {
    id: row.id,
    userId: row.userId,
    userName: row.user?.name ?? null,
    title: row.title,
    startsOn: row.startsOn.toISOString(),
    endsOn: row.endsOn.toISOString(),
    status: row.status as HandoverStatus,
    openDecisions: row.items.filter((i) => i.kind === "DECISION" && i.status !== "DONE").length,
    openRisks: row.items.filter((i) => i.kind === "RISK" && i.status !== "DONE").length,
    duties: row.items.filter((i) => i.kind === "DUTY").length,
  };
}

export async function listHandovers(user: EffectiveUser | null): Promise<HandoverSummaryDTO[]> {
  assertAtLeastAdmin(user);
  const { workspace } = await ensureBaseRecords();
  const rows = await prisma.handover.findMany({
    where: { workspaceId: user?.workspaceId ?? workspace.id },
    include: HANDOVER_INCLUDE,
    orderBy: [{ startsOn: "desc" }],
    take: 50,
  });
  return rows.map(summarize);
}

export async function getHandover(user: EffectiveUser | null, id: string): Promise<HandoverDTO> {
  assertAtLeastAdmin(user);
  const { workspace } = await ensureBaseRecords();
  const workspaceId = user?.workspaceId ?? workspace.id;
  const row = await prisma.handover.findFirst({
    where: { id, workspaceId },
    include: HANDOVER_INCLUDE,
  });
  if (!row) throw new NotFoundError("That handover doesn't exist.");

  return {
    id: row.id,
    userId: row.userId,
    userName: row.user?.name ?? null,
    title: row.title,
    startsOn: row.startsOn.toISOString(),
    endsOn: row.endsOn.toISOString(),
    standingRule: row.standingRule,
    notes: row.notes,
    status: row.status as HandoverStatus,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    items: row.items.map(serializeItem),
    clientState: await getHandoverClientState(workspaceId),
    asOf: new Date().toISOString(),
  };
}

export async function createHandover(
  user: EffectiveUser | null,
  input: HandoverInput,
): Promise<HandoverSummaryDTO> {
  assertAtLeastAdmin(user);
  const { workspace } = await ensureBaseRecords();
  const workspaceId = user?.workspaceId ?? workspace.id;
  const userId = input.userId ?? user?.id;
  if (!userId) throw new ForbiddenError("Who is this handover for?");

  const startsOn = dayUtc(input.startsOn);
  const endsOn = dayUtc(input.endsOn);
  if (endsOn < startsOn) throw new ForbiddenError("The end date is before the start date.");

  const member = await prisma.workspaceMember.findFirst({
    where: { workspaceId, userId },
    select: { id: true },
  });
  if (!member) throw new ForbiddenError("That person isn't in your workspace.");

  const row = await prisma.handover.create({
    data: {
      workspaceId,
      userId,
      title: input.title.trim(),
      startsOn,
      endsOn,
      standingRule: input.standingRule?.trim() || null,
      notes: input.notes?.trim() || null,
      status: input.status ?? "DRAFT",
      createdById: user?.id ?? null,
    },
    include: HANDOVER_INCLUDE,
  });
  return summarize(row);
}

export async function updateHandover(
  user: EffectiveUser | null,
  id: string,
  input: Partial<HandoverInput>,
): Promise<HandoverSummaryDTO> {
  assertAtLeastAdmin(user);
  const { workspace } = await ensureBaseRecords();
  const workspaceId = user?.workspaceId ?? workspace.id;
  const existing = await prisma.handover.findFirst({ where: { id, workspaceId }, select: { id: true } });
  if (!existing) throw new NotFoundError("That handover doesn't exist.");

  const data: Prisma.HandoverUpdateInput = {};
  if (input.title !== undefined) data.title = input.title.trim();
  if (input.startsOn !== undefined) data.startsOn = dayUtc(input.startsOn);
  if (input.endsOn !== undefined) data.endsOn = dayUtc(input.endsOn);
  if (input.standingRule !== undefined) data.standingRule = input.standingRule?.trim() || null;
  if (input.notes !== undefined) data.notes = input.notes?.trim() || null;
  if (input.status !== undefined) data.status = input.status;

  const row = await prisma.handover.update({ where: { id }, data, include: HANDOVER_INCLUDE });
  return summarize(row);
}

export async function deleteHandover(user: EffectiveUser | null, id: string): Promise<void> {
  assertAtLeastAdmin(user);
  const { workspace } = await ensureBaseRecords();
  const workspaceId = user?.workspaceId ?? workspace.id;
  const existing = await prisma.handover.findFirst({ where: { id, workspaceId }, select: { id: true } });
  if (!existing) throw new NotFoundError("That handover doesn't exist.");
  await prisma.handover.delete({ where: { id } });
}

export async function addHandoverItem(
  user: EffectiveUser | null,
  handoverId: string,
  input: HandoverItemInput,
): Promise<HandoverItemDTO> {
  assertAtLeastAdmin(user);
  const { workspace } = await ensureBaseRecords();
  const workspaceId = user?.workspaceId ?? workspace.id;
  const handover = await prisma.handover.findFirst({
    where: { id: handoverId, workspaceId },
    select: { id: true },
  });
  if (!handover) throw new NotFoundError("That handover doesn't exist.");

  // `clientName` is denormalised on purpose: the handover has to keep reading
  // correctly after a client is renamed or archived, and `clientId` is a loose id
  // with no FK for exactly that reason.
  let clientName: string | null = null;
  if (input.clientId) {
    const client = await prisma.workspaceClient.findFirst({
      where: { id: input.clientId, workspaceId },
      select: { name: true },
    });
    if (!client) throw new ForbiddenError("That client isn't in your workspace.");
    clientName = client.name;
  }
  if (input.ownerUserId) {
    const owner = await prisma.workspaceMember.findFirst({
      where: { workspaceId, userId: input.ownerUserId },
      select: { id: true },
    });
    if (!owner) throw new ForbiddenError("That person isn't in your workspace.");
  }

  const last = await prisma.handoverItem.findFirst({
    where: { handoverId, kind: input.kind },
    orderBy: { orderKey: "desc" },
    select: { orderKey: true },
  });

  const row = await prisma.handoverItem.create({
    data: {
      workspaceId,
      handoverId,
      kind: input.kind,
      clientId: input.clientId ?? null,
      clientName,
      title: input.title.trim(),
      detail: input.detail?.trim() || null,
      ownerUserId: input.ownerUserId ?? null,
      cadence: input.cadence?.trim() || null,
      channel: input.channel?.trim() || null,
      status: input.status ?? "OPEN",
      orderKey: input.orderKey ?? (last?.orderKey ?? 0) + 1,
    },
    include: ITEM_INCLUDE,
  });
  return serializeItem(row);
}

export async function updateHandoverItem(
  user: EffectiveUser | null,
  itemId: string,
  input: Partial<HandoverItemInput>,
): Promise<HandoverItemDTO> {
  assertAtLeastAdmin(user);
  const { workspace } = await ensureBaseRecords();
  const workspaceId = user?.workspaceId ?? workspace.id;
  const existing = await prisma.handoverItem.findFirst({
    where: { id: itemId, workspaceId },
    select: { id: true, status: true },
  });
  if (!existing) throw new NotFoundError("That item doesn't exist.");

  const data: Prisma.HandoverItemUpdateInput = {};
  if (input.title !== undefined) data.title = input.title.trim();
  if (input.detail !== undefined) data.detail = input.detail?.trim() || null;
  if (input.kind !== undefined) data.kind = input.kind;
  if (input.cadence !== undefined) data.cadence = input.cadence?.trim() || null;
  if (input.channel !== undefined) data.channel = input.channel?.trim() || null;
  if (input.orderKey !== undefined) data.orderKey = input.orderKey;

  if (input.clientId !== undefined) {
    if (input.clientId) {
      const client = await prisma.workspaceClient.findFirst({
        where: { id: input.clientId, workspaceId },
        select: { name: true },
      });
      if (!client) throw new ForbiddenError("That client isn't in your workspace.");
      data.clientId = input.clientId;
      data.clientName = client.name;
    } else {
      data.clientId = null;
      data.clientName = null;
    }
  }

  if (input.ownerUserId !== undefined) {
    if (input.ownerUserId) {
      const owner = await prisma.workspaceMember.findFirst({
        where: { workspaceId, userId: input.ownerUserId },
        select: { id: true },
      });
      if (!owner) throw new ForbiddenError("That person isn't in your workspace.");
      data.owner = { connect: { id: input.ownerUserId } };
    } else {
      data.owner = { disconnect: true };
    }
  }

  // Closing an item records WHO closed it and WHEN. Reopening clears both rather
  // than leaving a resolver on an open row — a stale "closed by Syed" on something
  // still open is the kind of half-truth that stops a board being believed.
  if (input.status !== undefined && input.status !== existing.status) {
    data.status = input.status;
    if (input.status === "DONE") {
      data.resolvedAt = new Date();
      data.resolvedBy = user?.id ? { connect: { id: user.id } } : undefined;
    } else {
      data.resolvedAt = null;
      data.resolvedBy = { disconnect: true };
    }
  }

  const row = await prisma.handoverItem.update({
    where: { id: itemId },
    data,
    include: ITEM_INCLUDE,
  });
  return serializeItem(row);
}

export async function deleteHandoverItem(user: EffectiveUser | null, itemId: string): Promise<void> {
  assertAtLeastAdmin(user);
  const { workspace } = await ensureBaseRecords();
  const workspaceId = user?.workspaceId ?? workspace.id;
  const existing = await prisma.handoverItem.findFirst({
    where: { id: itemId, workspaceId },
    select: { id: true },
  });
  if (!existing) throw new NotFoundError("That item doesn't exist.");
  await prisma.handoverItem.delete({ where: { id: itemId } });
}
