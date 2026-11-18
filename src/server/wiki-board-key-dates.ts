/**
 * Key dates on a client's Board Schedule: add, edit and delete (soft), by the client on their wiki
 * link or the team on the internal wiki, and the import of the client's planning-tool calendar
 * (Big Wedge's Forge "companyDates"). CLAUDE.md §128.
 *
 * The client side has the Board's write posture (src/server/wiki-board-access.ts resolves the
 * writer); here every write is scoped to the writer's client in its WHERE, so another client's key
 * date is a 404, and a client's writes run inside the board's per-wiki lock with their own quota
 * (`consumeBoardQuota(…, "keyDate")`), so a script can't bury the Schedule.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { BoardError, isClientWriter, keyDateDTO, withBoardLock, type BoardWriter } from "@/server/wiki-board";
import { consumeBoardQuota } from "@/server/wiki-board-limit";
import type { WikiBoardKeyDate } from "@/types/wiki-board";

const KEY_DATE_SELECT = { id: true, title: true, date: true, note: true, externalRef: true } as const satisfies Prisma.WikiBoardKeyDateSelect;

/** A YYYY-MM-DD as the @db.Date the column stores. */
function dateValue(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

export interface KeyDateInput {
  title: string;
  date: string;
  note?: string | null;
}

export async function createKeyDate(writer: BoardWriter, input: KeyDateInput): Promise<WikiBoardKeyDate> {
  const client = await prisma.workspaceClient.findUnique({ where: { id: writer.clientId }, select: { workspaceId: true } });
  if (!client) throw new BoardError("Not found", 404);
  const row = await withBoardLock(writer, async (tx) => {
    if (isClientWriter(writer)) await consumeBoardQuota(tx, writer.wikiId, "keyDate");
    return tx.wikiBoardKeyDate.create({
      data: {
        workspaceId: client.workspaceId,
        clientId: writer.clientId,
        title: input.title.trim(),
        date: dateValue(input.date),
        note: input.note?.trim() || null,
        createdById: writer.userId,
        createdByName: writer.name,
      },
      select: KEY_DATE_SELECT,
    });
  });
  return keyDateDTO(row);
}

export async function updateKeyDate(
  writer: BoardWriter,
  id: string,
  patch: Partial<KeyDateInput>,
): Promise<WikiBoardKeyDate> {
  const data: Prisma.WikiBoardKeyDateUpdateManyMutationInput = {};
  if (patch.title !== undefined) data.title = patch.title.trim();
  if (patch.date !== undefined) data.date = dateValue(patch.date);
  if (patch.note !== undefined) data.note = patch.note?.trim() || null;
  const row = await withBoardLock(writer, async (tx) => {
    if (isClientWriter(writer)) await consumeBoardQuota(tx, writer.wikiId, "keyDate");
    // Scoped to this client and live in the WHERE: another client's key date matches nothing.
    const done = await tx.wikiBoardKeyDate.updateMany({ where: { id, clientId: writer.clientId, archivedAt: null }, data });
    if (done.count === 0) throw new BoardError("Not found", 404);
    return tx.wikiBoardKeyDate.findFirstOrThrow({ where: { id, clientId: writer.clientId }, select: KEY_DATE_SELECT });
  });
  return keyDateDTO(row);
}

/** Soft: an imported date the client removed stays removed (the import skips it). */
export async function deleteKeyDate(writer: BoardWriter, id: string): Promise<void> {
  await withBoardLock(writer, async (tx) => {
    if (isClientWriter(writer)) await consumeBoardQuota(tx, writer.wikiId, "keyDate");
    const done = await tx.wikiBoardKeyDate.updateMany({
      where: { id, clientId: writer.clientId, archivedAt: null },
      data: { archivedAt: new Date() },
    });
    if (done.count === 0) throw new BoardError("Not found", 404);
  });
}
