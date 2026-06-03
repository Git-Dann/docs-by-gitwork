/**
 * Content snippet library (Phase 3). Reusable saved sections an operator can drop into any
 * document. Workspace-scoped CRUD over the ContentSnippet model.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export interface ContentSnippetRecord {
  id: string;
  name: string;
  sectionKey: string;
  data: unknown;
  createdAt: string;
}

function serialize(row: {
  id: string;
  name: string;
  sectionKey: string;
  data: Prisma.JsonValue;
  createdAt: Date;
}): ContentSnippetRecord {
  return {
    id: row.id,
    name: row.name,
    sectionKey: row.sectionKey,
    data: row.data,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listSnippets(workspaceId: string): Promise<ContentSnippetRecord[]> {
  const rows = await prisma.contentSnippet.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(serialize);
}

export async function createSnippet(input: {
  workspaceId: string;
  name: string;
  sectionKey: string;
  data: unknown;
  createdById?: string | null;
}): Promise<ContentSnippetRecord> {
  const row = await prisma.contentSnippet.create({
    data: {
      workspaceId: input.workspaceId,
      name: input.name,
      sectionKey: input.sectionKey,
      data: (input.data ?? {}) as Prisma.InputJsonValue,
      createdById: input.createdById ?? null,
    },
  });
  return serialize(row);
}

export async function deleteSnippet(workspaceId: string, id: string): Promise<void> {
  // Scope the delete to the workspace so a stray id can't remove another workspace's snippet.
  await prisma.contentSnippet.deleteMany({ where: { id, workspaceId } });
}
