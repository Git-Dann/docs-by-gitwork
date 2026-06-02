// Milestones — single-date timeline markers (separate from feature-block bars).
// Scoped by client + the caller's client access (mirrors feature-blocks.ts).

import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { type EffectiveUser, ForbiddenError } from "@/server/auth/effective-user";
import { assertClientInScope } from "@/server/tasks";
import type { MilestoneDTO } from "@/types/tasks";

type MilestoneRow = {
  id: string;
  clientId: string;
  name: string;
  date: Date;
  description: string | null;
  color: string | null;
};

function toDTO(row: MilestoneRow): MilestoneDTO {
  return {
    id: row.id,
    clientId: row.clientId,
    name: row.name,
    date: row.date.toISOString(),
    description: row.description,
    color: row.color,
  };
}

export async function listMilestones(user: EffectiveUser, clientId: string): Promise<MilestoneDTO[]> {
  await ensureBaseRecords();
  await assertClientInScope(user, clientId);
  const rows = await prisma.milestone.findMany({
    where: { workspaceId: user.workspaceId, clientId },
    orderBy: { date: "asc" },
  });
  return rows.map(toDTO);
}

export async function createMilestone(
  user: EffectiveUser,
  input: { clientId: string; name: string; date: string; description?: string; color?: string; clickupId?: string | null },
): Promise<MilestoneDTO> {
  await ensureBaseRecords();
  await assertClientInScope(user, input.clientId);
  const row = await prisma.milestone.create({
    data: {
      workspaceId: user.workspaceId,
      clientId: input.clientId,
      name: input.name,
      date: new Date(input.date),
      description: input.description ?? null,
      color: input.color ?? null,
      clickupId: input.clickupId ?? null,
    },
  });
  return toDTO(row);
}

export async function updateMilestone(
  user: EffectiveUser,
  id: string,
  input: { name?: string; date?: string; description?: string | null; color?: string | null },
): Promise<MilestoneDTO> {
  const existing = await prisma.milestone.findFirst({
    where: { id, workspaceId: user.workspaceId },
    select: { clientId: true },
  });
  if (!existing) throw new ForbiddenError("Milestone not found");
  await assertClientInScope(user, existing.clientId);

  const row = await prisma.milestone.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.date !== undefined ? { date: new Date(input.date) } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.color !== undefined ? { color: input.color } : {}),
    },
  });
  return toDTO(row);
}

export async function deleteMilestone(user: EffectiveUser, id: string): Promise<void> {
  const existing = await prisma.milestone.findFirst({
    where: { id, workspaceId: user.workspaceId },
    select: { clientId: true },
  });
  if (!existing) throw new ForbiddenError("Milestone not found");
  await assertClientInScope(user, existing.clientId);
  await prisma.milestone.delete({ where: { id } });
}
