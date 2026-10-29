/**
 * A client's own task-board columns — reading and saving them. The rules live in
 * src/lib/tasks/board-columns.ts; this file only scopes and stores.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { EffectiveUser } from "@/server/auth/effective-user";
import { NotFoundError } from "@/server/auth/effective-user";
import { assertClientInScope } from "@/server/tasks";
import { parseBoardColumns, type BoardColumnDef } from "@/lib/tasks/board-columns";

async function loadClient(user: EffectiveUser, clientId: string) {
  await assertClientInScope(user, clientId);
  const client = await prisma.workspaceClient.findFirst({
    where: { id: clientId, workspaceId: user.workspaceId },
    select: { id: true, taskBoardColumns: true },
  });
  if (!client) throw new NotFoundError("Client not found");
  return client;
}

export async function getBoardColumns(user: EffectiveUser, clientId: string): Promise<BoardColumnDef[]> {
  return parseBoardColumns((await loadClient(user, clientId)).taskBoardColumns);
}

/**
 * Replace the client's columns. A removed column's tasks need no write: they fall back to
 * their status column on the next read, and the stale id is cleared here so it can't come back.
 */
export async function setBoardColumns(
  user: EffectiveUser,
  clientId: string,
  columns: BoardColumnDef[],
): Promise<BoardColumnDef[]> {
  await loadClient(user, clientId);
  const next = parseBoardColumns(columns);
  const kept = next.map((c) => c.id);
  await prisma.$transaction([
    prisma.workspaceClient.update({
      where: { id: clientId },
      data: { taskBoardColumns: next as unknown as Prisma.InputJsonValue },
      select: { id: true },
    }),
    prisma.task.updateMany({
      where: { clientId, workspaceId: user.workspaceId, boardColumnId: { not: null, notIn: kept } },
      data: { boardColumnId: null },
    }),
  ]);
  return next;
}
