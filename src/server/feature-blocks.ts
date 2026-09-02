// Feature blocks ("lists") — the timeline-planning unit. Each block carries a
// start/end date (the Gantt bar) and holds tasks. Scoped by client + the
// caller's client access (mirrors src/server/tasks.ts).

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { type EffectiveUser, ForbiddenError } from "@/server/auth/effective-user";
import { assertClientInScope } from "@/server/tasks";
import type { FeatureBlockDTO } from "@/types/tasks";

const blockInclude = {
  // Top-level, active tasks only — matching server/wiki.ts's loadWikiTimeline
  // and client-timeline.ts's getPublicTimeline. Without this filter, subtasks
  // and archived tasks were also counted here, which could diverge this DTO's
  // progress/taskCount from the client-facing Gantt views reading the exact
  // same blocks.
  tasks: { where: { parentId: null, archivedAt: null }, select: { status: true } },
} satisfies Prisma.FeatureBlockInclude;

type BlockRow = Prisma.FeatureBlockGetPayload<{ include: typeof blockInclude }>;

function blockRowToDTO(row: BlockRow): FeatureBlockDTO {
  const taskCount = row.tasks.length;
  const doneCount = row.tasks.filter((t) => t.status === "DONE").length;
  return {
    id: row.id,
    clientId: row.clientId,
    name: row.name,
    description: row.description,
    startDate: row.startDate ? row.startDate.toISOString() : null,
    endDate: row.endDate ? row.endDate.toISOString() : null,
    orderKey: row.orderKey,
    color: row.color,
    taskCount,
    doneCount,
    progress: taskCount === 0 ? 0 : Math.round((doneCount / taskCount) * 100),
  };
}

export async function listFeatureBlocks(
  user: EffectiveUser,
  clientId: string,
): Promise<FeatureBlockDTO[]> {
  await ensureBaseRecords();
  await assertClientInScope(user, clientId);
  const rows = await prisma.featureBlock.findMany({
    where: { workspaceId: user.workspaceId, clientId },
    orderBy: [{ orderKey: "asc" }, { startDate: "asc" }],
    include: blockInclude,
  });
  return rows.map(blockRowToDTO);
}

export async function createFeatureBlock(
  user: EffectiveUser,
  input: {
    clientId: string;
    name: string;
    description?: string;
    startDate?: string | null;
    endDate?: string | null;
    color?: string;
    clickupId?: string | null;
  },
): Promise<FeatureBlockDTO> {
  await ensureBaseRecords();
  await assertClientInScope(user, input.clientId);

  const top = await prisma.featureBlock.findFirst({
    where: { workspaceId: user.workspaceId, clientId: input.clientId },
    orderBy: { orderKey: "desc" },
    select: { orderKey: true },
  });

  const row = await prisma.featureBlock.create({
    data: {
      workspaceId: user.workspaceId,
      clientId: input.clientId,
      name: input.name,
      description: input.description ?? null,
      startDate: input.startDate ? new Date(input.startDate) : null,
      endDate: input.endDate ? new Date(input.endDate) : null,
      color: input.color ?? null,
      clickupId: input.clickupId ?? null,
      orderKey: (top?.orderKey ?? 0) + 1,
    },
    include: blockInclude,
  });
  return blockRowToDTO(row);
}

export async function updateFeatureBlock(
  user: EffectiveUser,
  id: string,
  input: {
    name?: string;
    description?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    color?: string | null;
    orderKey?: number;
  },
): Promise<FeatureBlockDTO> {
  const existing = await prisma.featureBlock.findFirst({
    where: { id, workspaceId: user.workspaceId },
    select: { clientId: true },
  });
  if (!existing) throw new ForbiddenError("Feature block not found");
  await assertClientInScope(user, existing.clientId);

  const data: Prisma.FeatureBlockUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.description !== undefined) data.description = input.description;
  if (input.startDate !== undefined) data.startDate = input.startDate ? new Date(input.startDate) : null;
  if (input.endDate !== undefined) data.endDate = input.endDate ? new Date(input.endDate) : null;
  if (input.color !== undefined) data.color = input.color;
  if (input.orderKey !== undefined) data.orderKey = input.orderKey;

  const row = await prisma.featureBlock.update({ where: { id }, data, include: blockInclude });
  return blockRowToDTO(row);
}

export async function deleteFeatureBlock(user: EffectiveUser, id: string): Promise<void> {
  const existing = await prisma.featureBlock.findFirst({
    where: { id, workspaceId: user.workspaceId },
    select: { clientId: true },
  });
  if (!existing) throw new ForbiddenError("Feature block not found");
  await assertClientInScope(user, existing.clientId);
  // Tasks keep existing; their featureBlockId is set null via the FK (SetNull).
  await prisma.featureBlock.delete({ where: { id } });
}
