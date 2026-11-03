/**
 * Who may use the Platform console: Gitwork's platform operators.
 *
 * This is NOT a workspace role. Once other businesses are on Foundry, each has its
 * own Super Admins, and none of them may see across businesses. Platform admin is a
 * flag on the User (`isPlatformAdmin`) plus the seed list below, so Dan and Harry
 * have it without a database write on the day this ships.
 *
 * Checked live against the database on every request (never from the session token),
 * and only for an ACTIVE member: archiving someone's Gitwork membership removes their
 * platform access with it, through the same revocation requireAuthedUser enforces.
 */

import { prisma } from "@/lib/prisma";
import { ForbiddenError, requireAuthedUser, type EffectiveUser } from "@/server/auth/effective-user";

export const PLATFORM_ADMIN_EMAILS = ["dan@gitwork.co.uk", "harry@gitwork.co.uk"] as const;

export function isPlatformAdminRecord(user: { email: string; isPlatformAdmin: boolean } | null | undefined): boolean {
  if (!user) return false;
  return user.isPlatformAdmin || (PLATFORM_ADMIN_EMAILS as readonly string[]).includes(user.email.trim().toLowerCase());
}

/** The caller, if they are a platform admin; otherwise throws (403, or 401 with no identity). */
export async function requirePlatformAdmin(req: Request): Promise<EffectiveUser> {
  const caller = await requireAuthedUser(req);
  const user = await prisma.user.findUnique({
    where: { id: caller.id },
    select: { email: true, isPlatformAdmin: true },
  });
  if (!isPlatformAdminRecord(user)) throw new ForbiddenError("Platform admins only");
  return caller;
}

/** For pages and /api/account: is this user id a platform admin? Never throws. */
export async function isPlatformAdminUserId(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, isPlatformAdmin: true } });
  return isPlatformAdminRecord(user);
}
