/**
 * Reads what a person's achievements are worked out from (rules in src/lib/achievements.ts).
 * Only the person themselves is ever read: there's no route for anyone else's, by design.
 */

import { prisma } from "@/lib/prisma";
import { isSuperAdmin } from "@/types/auth";
import { getHolidaysForCountry } from "@/server/backstage-holidays";
import type { EffectiveUser } from "@/server/auth/effective-user";
import {
  ACHIEVEMENTS,
  countOnThePlan,
  countOnTime,
  progressFor,
  standupStreak,
  ymd,
  type AchievementProgress,
} from "@/lib/achievements";

const STREAK_DAYS = 180;
const TASK_DAYS = 90;

export interface AchievementsDTO {
  achievements: AchievementProgress[];
}

export async function loadAchievements(user: EffectiveUser, now: Date = new Date()): Promise<AchievementsDTO> {
  const has = (p: string) => isSuperAdmin(user.role) || user.permissions.includes(p);
  const streakFrom = new Date(now.getTime() - STREAK_DAYS * 86_400_000);
  const taskFrom = new Date(now.getTime() - TASK_DAYS * 86_400_000);
  const mine = { OR: [{ assignees: { some: { id: user.id } } }, { assigneeId: user.id }] };

  const [updates, leave, member, tasks, deals] = await Promise.all([
    prisma.dailyUpdate.findMany({
      where: { workspaceId: user.workspaceId, userId: user.id, amPushedAt: { not: null }, workDate: { gte: streakFrom } },
      select: { workDate: true },
    }),
    prisma.leaveRequest.findMany({
      where: { workspaceId: user.workspaceId, userId: user.id, status: "APPROVED", endDate: { gte: streakFrom } },
      select: { startDate: true, endDate: true },
    }),
    prisma.workspaceMember.findUnique({ where: { id: user.membershipId }, select: { countryCode: true } }),
    has("clients")
      ? prisma.task.findMany({
          where: { workspaceId: user.workspaceId, completedAt: { gte: taskFrom }, archivedAt: null, ...mine },
          select: { createdAt: true, completedAt: true, dueDate: true, featureBlockId: true, releaseId: true },
        })
      : Promise.resolve([]),
    has("proposals")
      ? prisma.document.count({
          where: {
            workspaceId: user.workspaceId,
            ownerId: user.id,
            archivedAt: null,
            OR: [{ acceptedAt: { not: null } }, { signatureRequests: { some: { status: "COMPLETED" } } }],
          },
        })
      : Promise.resolve(null),
  ]);

  const daysOff = new Set<string>();
  for (const l of leave) {
    for (let d = new Date(l.startDate); d <= l.endDate; d = new Date(d.getTime() + 86_400_000)) daysOff.add(ymd(d));
  }
  for (const h of getHolidaysForCountry(member?.countryCode ?? "GB", streakFrom, now)) daysOff.add(h.date.slice(0, 10));

  const finished = tasks
    .filter((t) => t.completedAt)
    .map((t) => ({
      createdAt: t.createdAt.toISOString(),
      completedAt: (t.completedAt as Date).toISOString(),
      dueDate: t.dueDate?.toISOString() ?? null,
      planned: Boolean(t.featureBlockId || t.releaseId),
    }));

  const streak = standupStreak({ posted: new Set(updates.map((u) => ymd(u.workDate))), daysOff, today: now, days: STREAK_DAYS });

  const out: AchievementProgress[] = [];
  for (const def of ACHIEVEMENTS) {
    if (def.id === "standup-streak") {
      // Only people who post standups: someone who never has isn't shown a zero.
      if (has("clients") || updates.length > 0) out.push(progressFor(def, streak.best, streak.current));
    } else if (def.id === "on-the-plan" && has("clients")) out.push(progressFor(def, countOnThePlan(finished)));
    else if (def.id === "on-time" && has("clients")) out.push(progressFor(def, countOnTime(finished)));
    else if (def.id === "deals-won" && deals != null) out.push(progressFor(def, deals));
  }
  return { achievements: out };
}
