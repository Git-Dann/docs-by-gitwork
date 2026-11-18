// Releases — the version a client's tasks ship in (ClientRelease). Scoped by client and the
// caller's client access, exactly like feature blocks (src/server/feature-blocks.ts).
// Rules live in src/lib/tasks/releases.ts.

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { type EffectiveUser, ForbiddenError } from "@/server/auth/effective-user";
import { assertClientInScope } from "@/server/tasks";
import { safeReleaseDocUrl, sortReleases } from "@/lib/tasks/releases";
import type { ReleaseDTO } from "@/types/tasks";

const releaseInclude = {
  // Top-level, live tasks only: the same set the timeline and the categories count.
  tasks: { where: { parentId: null, archivedAt: null }, select: { status: true } },
} satisfies Prisma.ClientReleaseInclude;

type ReleaseRow = Prisma.ClientReleaseGetPayload<{ include: typeof releaseInclude }>;

function releaseRowToDTO(row: ReleaseRow): ReleaseDTO {
  return {
    id: row.id,
    clientId: row.clientId,
    version: row.version,
    name: row.name,
    startDate: row.startDate ? row.startDate.toISOString() : null,
    endDate: row.endDate ? row.endDate.toISOString() : null,
    orderKey: row.orderKey,
    docUrl: safeReleaseDocUrl(row.docUrl),
    taskCount: row.tasks.length,
    doneCount: row.tasks.filter((t) => t.status === "DONE").length,
  };
}

export async function listReleases(user: EffectiveUser, clientId: string): Promise<ReleaseDTO[]> {
  await assertClientInScope(user, clientId);
  const rows = await prisma.clientRelease.findMany({
    where: { workspaceId: user.workspaceId, clientId },
    include: releaseInclude,
  });
  return sortReleases(rows.map(releaseRowToDTO));
}

export async function createRelease(
  user: EffectiveUser,
  input: { clientId: string; version: string; name?: string | null; startDate?: string | null; endDate?: string | null; docUrl?: string | null },
): Promise<ReleaseDTO> {
  await assertClientInScope(user, input.clientId);
  const top = await prisma.clientRelease.findFirst({
    where: { workspaceId: user.workspaceId, clientId: input.clientId },
    orderBy: { orderKey: "desc" },
    select: { orderKey: true },
  });
  const row = await prisma.clientRelease.create({
    data: {
      workspaceId: user.workspaceId,
      clientId: input.clientId,
      version: input.version.trim(),
      name: input.name?.trim() || null,
      startDate: input.startDate ? new Date(input.startDate) : null,
      endDate: input.endDate ? new Date(input.endDate) : null,
      docUrl: safeReleaseDocUrl(input.docUrl),
      orderKey: (top?.orderKey ?? 0) + 1,
    },
    include: releaseInclude,
  });
  return releaseRowToDTO(row);
}

async function findOwnRelease(user: EffectiveUser, id: string) {
  const existing = await prisma.clientRelease.findFirst({
    where: { id, workspaceId: user.workspaceId },
    select: { clientId: true },
  });
  if (!existing) throw new ForbiddenError("Release not found");
  await assertClientInScope(user, existing.clientId);
  return existing;
}

export async function updateRelease(
  user: EffectiveUser,
  id: string,
  input: { version?: string; name?: string | null; startDate?: string | null; endDate?: string | null; docUrl?: string | null; orderKey?: number },
): Promise<ReleaseDTO> {
  await findOwnRelease(user, id);
  const data: Prisma.ClientReleaseUpdateInput = {};
  if (input.version !== undefined) data.version = input.version.trim();
  if (input.name !== undefined) data.name = input.name?.trim() || null;
  if (input.startDate !== undefined) data.startDate = input.startDate ? new Date(input.startDate) : null;
  if (input.endDate !== undefined) data.endDate = input.endDate ? new Date(input.endDate) : null;
  if (input.docUrl !== undefined) data.docUrl = safeReleaseDocUrl(input.docUrl);
  if (input.orderKey !== undefined) data.orderKey = input.orderKey;
  const row = await prisma.clientRelease.update({ where: { id }, data, include: releaseInclude });
  return releaseRowToDTO(row);
}

/** Deletes the release only. Its tasks stay where they are, out of any release (SetNull). */
export async function deleteRelease(user: EffectiveUser, id: string): Promise<void> {
  await findOwnRelease(user, id);
  await prisma.clientRelease.delete({ where: { id } });
}
