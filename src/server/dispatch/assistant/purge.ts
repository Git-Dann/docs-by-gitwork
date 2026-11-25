/**
 * Dispatch chats are deleted 90 days after they were last used (§156). Run nightly from the
 * RETENTION_SWEEP job.
 *
 * What goes: the chat, every message in it (questions, answers, pictures) and any proposal that
 * was never carried out. What stays: proposals that WERE carried out (`done`), as the record of
 * what Dispatch changed and for whom; the task, comment or post they made exists anyway.
 *
 * Bounded per run; a backlog drains over the following nights.
 */

import { prisma } from "@/lib/prisma";

export const CHAT_RETENTION_DAYS = 90;

export async function purgeOldDispatchChats(now: Date = new Date(), batch = 500): Promise<{ chats: number; messages: number; actions: number }> {
  const cutoff = new Date(now.getTime() - CHAT_RETENTION_DAYS * 86_400_000);
  const old = await prisma.dispatchConversation.findMany({
    where: { updatedAt: { lt: cutoff } },
    select: { id: true },
    orderBy: { updatedAt: "asc" },
    take: batch,
  });
  if (!old.length) return { chats: 0, messages: 0, actions: 0 };
  const ids = old.map((c) => c.id);
  const [messages, actions, chats] = await prisma.$transaction([
    prisma.dispatchMessage.deleteMany({ where: { conversationId: { in: ids } } }),
    prisma.dispatchAction.deleteMany({ where: { conversationId: { in: ids }, status: { not: "done" } } }),
    prisma.dispatchConversation.deleteMany({ where: { id: { in: ids } } }),
  ]);
  return { chats: chats.count, messages: messages.count, actions: actions.count };
}
