/**
 * What a person asked Dispatch to remember across chats (§173). Dan, 26 Nov 2026: Dispatch
 * remembered within a chat but not across them.
 *
 * Each note is the person's own: saved when they ask ("remember I'm on iOS") or state a lasting
 * preference, read only into their own chats, listed in the panel where they can delete any of
 * them, and forgotten on request. Capped so a chat's context stays small and cheap.
 */

import { prisma } from "@/lib/prisma";
import type { EffectiveUser } from "@/server/auth/effective-user";

export const MAX_MEMORIES = 30;
export const MAX_MEMORY_CHARS = 300;

export interface MemoryRow {
  id: string;
  text: string;
  createdAt: string;
}

export async function listMemories(user: Pick<EffectiveUser, "id" | "workspaceId">): Promise<MemoryRow[]> {
  const rows = await prisma.dispatchMemory.findMany({
    where: { workspaceId: user.workspaceId, userId: user.id },
    orderBy: { createdAt: "asc" },
    take: MAX_MEMORIES,
    select: { id: true, text: true, createdAt: true },
  });
  return rows.map((r) => ({ id: r.id, text: r.text, createdAt: r.createdAt.toISOString() }));
}

/** Tidy a note: one line, trimmed, capped. Empty means nothing to save. */
export function cleanMemory(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > MAX_MEMORY_CHARS ? `${t.slice(0, MAX_MEMORY_CHARS - 1)}…` : t;
}

export async function addMemory(user: Pick<EffectiveUser, "id" | "workspaceId">, text: string): Promise<{ saved: boolean; reason?: string }> {
  const note = cleanMemory(text);
  if (!note) return { saved: false, reason: "There was nothing to remember." };
  const existing = await listMemories(user);
  if (existing.some((m) => m.text.toLowerCase() === note.toLowerCase())) return { saved: true };
  if (existing.length >= MAX_MEMORIES) {
    return { saved: false, reason: `There are already ${MAX_MEMORIES} things remembered. Delete one in the Dispatch panel (the bookmark) to make room.` };
  }
  await prisma.dispatchMemory.create({ data: { workspaceId: user.workspaceId, userId: user.id, text: note } });
  return { saved: true };
}

/** Forget notes containing `about` (case-insensitive), or every note when it's "everything". */
export async function forgetMemories(user: Pick<EffectiveUser, "id" | "workspaceId">, about: string): Promise<number> {
  const q = about.trim().toLowerCase();
  if (!q) return 0;
  const all = /^(everything|all|all of it)$/.test(q);
  const rows = await listMemories(user);
  const ids = rows.filter((r) => all || r.text.toLowerCase().includes(q)).map((r) => r.id);
  if (!ids.length) return 0;
  const res = await prisma.dispatchMemory.deleteMany({ where: { id: { in: ids }, userId: user.id, workspaceId: user.workspaceId } });
  return res.count;
}

export async function deleteMemory(user: Pick<EffectiveUser, "id" | "workspaceId">, id: string): Promise<boolean> {
  const res = await prisma.dispatchMemory.deleteMany({ where: { id, userId: user.id, workspaceId: user.workspaceId } });
  return res.count > 0;
}
