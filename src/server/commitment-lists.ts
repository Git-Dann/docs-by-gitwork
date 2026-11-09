/**
 * A person's own to-do lists (Foundry for Mac). Private like Commitments: every read and write
 * is scoped to the caller, and another person's list id reads as not found. Deleting a list
 * archives it and takes its to-dos out of it; nothing is ever hard-deleted.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { EffectiveUser } from "@/server/auth/effective-user";
import { CommitmentError } from "@/server/commitments";
import { MAX_LISTS_PER_PERSON, type ListColor } from "@/lib/commitments";
import type { CommitmentListDTO } from "@/types/commitments";

type ListRow = Prisma.CommitmentListGetPayload<object>;

function mine(user: EffectiveUser) {
  return { userId: user.id, workspaceId: user.workspaceId };
}

function toListDTO(row: ListRow): CommitmentListDTO {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    symbol: row.symbol,
    area: row.area,
    orderKey: row.orderKey,
    archived: row.archivedAt !== null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** The caller's lists that aren't archived, by orderKey then age. */
export async function listCommitmentLists(user: EffectiveUser): Promise<CommitmentListDTO[]> {
  const rows = await prisma.commitmentList.findMany({
    where: { ...mine(user), archivedAt: null },
    orderBy: [{ orderKey: "asc" }, { createdAt: "asc" }],
    take: MAX_LISTS_PER_PERSON,
  });
  return rows.map(toListDTO);
}

export interface CommitmentListInput {
  name?: string;
  color?: ListColor | null;
  symbol?: string | null;
  area?: string | null;
  orderKey?: number;
}

function listData(input: CommitmentListInput) {
  const data: Prisma.CommitmentListUpdateInput = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new CommitmentError("A list needs a name.");
    data.name = name;
  }
  if (input.color !== undefined) data.color = input.color ?? null;
  if (input.symbol !== undefined) data.symbol = input.symbol?.trim() || null;
  if (input.area !== undefined) data.area = input.area?.trim() || null;
  if (input.orderKey !== undefined) {
    if (!Number.isFinite(input.orderKey)) throw new CommitmentError("That order isn't a valid number.");
    data.orderKey = input.orderKey;
  }
  return data;
}

export async function createCommitmentList(
  user: EffectiveUser,
  input: CommitmentListInput & { name: string },
): Promise<CommitmentListDTO> {
  const count = await prisma.commitmentList.count({ where: { ...mine(user), archivedAt: null } });
  if (count >= MAX_LISTS_PER_PERSON) {
    throw new CommitmentError(`You can have at most ${MAX_LISTS_PER_PERSON} lists.`);
  }
  const name = input.name.trim();
  if (!name) throw new CommitmentError("A list needs a name.");
  const row = await prisma.commitmentList.create({
    data: { ...mine(user), ...listData(input), name } as Prisma.CommitmentListUncheckedCreateInput,
  });
  return toListDTO(row);
}

async function findMyList(user: EffectiveUser, id: string): Promise<ListRow> {
  const row = await prisma.commitmentList.findFirst({ where: { id, ...mine(user), archivedAt: null } });
  if (!row) throw new CommitmentError("List not found.", 404);
  return row;
}

export async function updateCommitmentList(
  user: EffectiveUser,
  id: string,
  input: CommitmentListInput,
): Promise<CommitmentListDTO> {
  const row = await findMyList(user, id);
  const updated = await prisma.commitmentList.update({ where: { id: row.id }, data: listData(input) });
  return toListDTO(updated);
}

/** Archives the list and takes the caller's to-dos out of it, in one transaction. */
export async function archiveCommitmentList(user: EffectiveUser, id: string): Promise<void> {
  const row = await findMyList(user, id);
  await prisma.$transaction([
    prisma.commitmentList.update({ where: { id: row.id }, data: { archivedAt: new Date() } }),
    prisma.commitment.updateMany({ where: { ...mine(user), listId: row.id }, data: { listId: null } }),
  ]);
}
