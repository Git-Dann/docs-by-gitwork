/**
 * Handover — CRUD over an entirely AUTHORED record.
 *
 * ⚠️ An earlier cut computed live client state here (overdue counts, Care
 * queues) and returned it alongside the items. Nothing renders it any more —
 * read against real data those figures were noise beside the sentence they sat
 * under — so it is gone rather than left costing five extra queries per read
 * for a payload no page opens. `getHandoverClientState` and the
 * `@/server/support` import went with it.
 *
 * ── Gate ────────────────────────────────────────────────────────────────────
 * Admin and above, for READS as well as writes. A handover routinely carries
 * commercial facts — an unsigned retainer, billing that does not match the work
 * — which are not developer-facing. `assertAtLeastAdmin` lets a null caller
 * (the workspace API_KEY: cron and server integrations) through, matching every
 * other Backstage module.
 *
 * ⚠️ `Handover.standingRule` is still a column and is no longer written or read.
 * The "one rule, stated once at the top" banner was removed on 24 Sep — in
 * practice it restated what the routing card now says with names, which is the
 * answerable version. The column stays because dropping it is a data-losing
 * change and the guarded `prisma db push` would skip the WHOLE sync (§2).
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
import type {
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
    notes: row.notes,
    status: row.status as HandoverStatus,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    items: row.items.map(serializeItem),
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
