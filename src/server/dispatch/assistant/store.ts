/**
 * Dispatch conversations and their messages. Private to their owner: every read here is scoped
 * by the person's id, and there is no function that reads someone else's.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { EffectiveUser } from "@/server/auth/effective-user";

export interface StoredMessage {
  role: "user" | "assistant";
  content: unknown;
}

export class ConversationNotFoundError extends Error {
  readonly status = 404;
}

export async function getOwnConversation(user: EffectiveUser, id: string) {
  const row = await prisma.dispatchConversation.findFirst({
    where: { id, userId: user.id, workspaceId: user.workspaceId },
  });
  if (!row) throw new ConversationNotFoundError("That chat doesn't exist, or isn't yours.");
  return row;
}

export async function createConversation(
  user: EffectiveUser,
  input: { clientId: string; surface: "web" | "slack"; title: string; slackChannelId?: string; slackThreadTs?: string },
) {
  return prisma.dispatchConversation.create({
    data: {
      workspaceId: user.workspaceId,
      userId: user.id,
      clientId: input.clientId,
      surface: input.surface,
      title: input.title.slice(0, 80) || "New chat",
      slackChannelId: input.slackChannelId ?? null,
      slackThreadTs: input.slackThreadTs ?? null,
    },
  });
}

export async function loadMessages(conversationId: string): Promise<StoredMessage[]> {
  const rows = await prisma.dispatchMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    select: { role: true, content: true },
  });
  return rows.map((r) => ({ role: r.role === "assistant" ? "assistant" : "user", content: r.content }));
}

export async function appendMessage(
  conversationId: string,
  role: "user" | "assistant",
  content: unknown,
  usage?: Record<string, unknown>,
): Promise<void> {
  await prisma.dispatchMessage.create({
    data: {
      conversationId,
      role,
      content: content as Prisma.InputJsonValue,
      ...(usage ? { usage: usage as Prisma.InputJsonValue } : {}),
    },
  });
  await prisma.dispatchConversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
}

/** Questions this person asked in the last hour, across their chats (the runaway-loop guard). */
export async function questionsInLastHour(user: EffectiveUser): Promise<number> {
  const since = new Date(Date.now() - 60 * 60 * 1000);
  return prisma.dispatchMessage.count({
    where: {
      createdAt: { gte: since },
      role: "user",
      usage: { path: ["question"], equals: true },
      conversationId: {
        in: (
          await prisma.dispatchConversation.findMany({
            where: { userId: user.id, workspaceId: user.workspaceId, updatedAt: { gte: since } },
            select: { id: true },
          })
        ).map((c) => c.id),
      },
    },
  });
}

export async function listOwnConversations(user: EffectiveUser, clientId?: string) {
  return prisma.dispatchConversation.findMany({
    where: { userId: user.id, workspaceId: user.workspaceId, surface: "web", ...(clientId ? { clientId } : {}) },
    orderBy: { updatedAt: "desc" },
    take: 30,
    select: { id: true, clientId: true, title: true, updatedAt: true },
  });
}

/** Deletes the chat and its messages. The record of changes made through it is kept. */
export async function deleteOwnConversation(user: EffectiveUser, id: string): Promise<void> {
  await getOwnConversation(user, id);
  await prisma.dispatchMessage.deleteMany({ where: { conversationId: id } });
  await prisma.dispatchConversation.delete({ where: { id } });
}
