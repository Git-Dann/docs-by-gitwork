/**
 * The timezone of the person Dispatch is talking to (§174), best source first: what Slack or the
 * browser says right now (`hint`), their notification settings, their Staff record, then the
 * country on their membership. Falls back to UK time. See src/lib/dispatch/time.ts.
 */

import { prisma } from "@/lib/prisma";
import { isValidTimeZone, pickTimeZone } from "@/lib/dispatch/time";
import type { EffectiveUser } from "@/server/auth/effective-user";

export async function askerTimeZone(user: Pick<EffectiveUser, "id" | "workspaceId" | "email">, hint?: string | null): Promise<string> {
  if (isValidTimeZone(hint)) return hint.trim();
  const [prefs, member, staff] = await Promise.all([
    prisma.notificationPreference.findUnique({ where: { userId: user.id }, select: { timezone: true } }),
    prisma.workspaceMember.findFirst({ where: { workspaceId: user.workspaceId, userId: user.id }, select: { countryCode: true } }),
    prisma.candidate.findFirst({
      where: {
        workspaceId: user.workspaceId,
        timezone: { not: null },
        OR: [{ member: { userId: user.id } }, ...(user.email ? [{ email: { equals: user.email, mode: "insensitive" as const } }] : [])],
      },
      select: { timezone: true },
    }),
  ]);
  return pickTimeZone([prefs?.timezone, staff?.timezone], member?.countryCode);
}
