/**
 * Dispatch's numbers for Analytics → AI usage (Super Admins, §156): questions, what they cost,
 * how much of the prompt came from the cache, and who asks where. Counts and costs only: chats
 * are private, so no question or answer text leaves here.
 */

import { prisma } from "@/lib/prisma";
import { budgetStatus, type BudgetStatus } from "./budget";

export interface DispatchUsage {
  questions: number;
  costUsd: number;
  costPerQuestion: number | null;
  /** Share of prompt tokens read from the cache (0–1), null with no calls. */
  cacheHitRate: number | null;
  byDay: { day: string; questions: number; costUsd: number }[];
  byPerson: { userId: string; name: string; questions: number; costUsd: number }[];
  bySurface: { surface: string; questions: number }[];
  budget: BudgetStatus;
}

export async function getDispatchUsage(workspaceId: string, from: Date, to: Date): Promise<DispatchUsage> {
  const [calls, questions] = await Promise.all([
    prisma.aiUsageLog.findMany({
      where: { workspaceId, module: "DISPATCH", createdAt: { gte: from, lte: to } },
      select: { userId: true, costUsd: true, inputTokens: true, cachedInputTokens: true, cacheWriteTokens: true, createdAt: true },
    }),
    // A question is the person's own message (tool results are stored as user messages too,
    // without the `question` mark).
    prisma.dispatchMessage.findMany({
      where: { role: "user", createdAt: { gte: from, lte: to }, usage: { path: ["question"], equals: true } },
      select: { createdAt: true, conversationId: true },
    }),
  ]);

  const convIds = [...new Set(questions.map((q) => q.conversationId))];
  const convs = convIds.length
    ? await prisma.dispatchConversation.findMany({
        where: { id: { in: convIds }, workspaceId },
        select: { id: true, userId: true, surface: true },
      })
    : [];
  const convById = new Map(convs.map((c) => [c.id, c]));
  const ownQuestions = questions.filter((q) => convById.has(q.conversationId));

  const day = (d: Date) => d.toISOString().slice(0, 10);
  const byDay = new Map<string, { questions: number; costUsd: number }>();
  const byUser = new Map<string, { questions: number; costUsd: number }>();
  const bySurface = new Map<string, number>();
  let cost = 0;
  let prompt = 0;
  let cached = 0;
  for (const c of calls) {
    cost += c.costUsd;
    prompt += c.inputTokens + c.cachedInputTokens + c.cacheWriteTokens;
    cached += c.cachedInputTokens;
    const d = byDay.get(day(c.createdAt)) ?? { questions: 0, costUsd: 0 };
    d.costUsd += c.costUsd;
    byDay.set(day(c.createdAt), d);
    if (c.userId) {
      const u = byUser.get(c.userId) ?? { questions: 0, costUsd: 0 };
      u.costUsd += c.costUsd;
      byUser.set(c.userId, u);
    }
  }
  for (const q of ownQuestions) {
    const conv = convById.get(q.conversationId)!;
    const d = byDay.get(day(q.createdAt)) ?? { questions: 0, costUsd: 0 };
    d.questions += 1;
    byDay.set(day(q.createdAt), d);
    const u = byUser.get(conv.userId) ?? { questions: 0, costUsd: 0 };
    u.questions += 1;
    byUser.set(conv.userId, u);
    bySurface.set(conv.surface, (bySurface.get(conv.surface) ?? 0) + 1);
  }

  const users = byUser.size
    ? await prisma.user.findMany({ where: { id: { in: [...byUser.keys()] } }, select: { id: true, name: true, email: true } })
    : [];
  const nameOf = new Map(users.map((u) => [u.id, u.name ?? u.email]));
  const r4 = (n: number) => Math.round(n * 10000) / 10000;

  return {
    questions: ownQuestions.length,
    costUsd: r4(cost),
    costPerQuestion: ownQuestions.length ? r4(cost / ownQuestions.length) : null,
    cacheHitRate: prompt ? Math.round((cached / prompt) * 1000) / 1000 : null,
    byDay: [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([d, v]) => ({ day: d, questions: v.questions, costUsd: r4(v.costUsd) })),
    byPerson: [...byUser.entries()]
      .map(([userId, v]) => ({ userId, name: nameOf.get(userId) ?? "Someone", questions: v.questions, costUsd: r4(v.costUsd) }))
      .sort((a, b) => b.costUsd - a.costUsd),
    bySurface: [...bySurface.entries()].map(([surface, n]) => ({ surface, questions: n })).sort((a, b) => b.questions - a.questions),
    budget: await budgetStatus(workspaceId, to),
  };
}
