/**
 * Whose leave a Backstage approver looks after.
 *
 * Admins and Super Admins look after everyone. An approver who is NOT an Admin (Siân, from
 * Nov 2026, through the People & office preset) looks after Gitwork's own staff only:
 * developers' leave stays with Admins (Dan, Nov 2026: "she won't be looking after Devs").
 *
 * Who counts as a developer is the Staff record's own fact (`DEVELOPER_RECORD`: a GitHub
 * handle or the Developer switch), never the sign-in role (§113). Someone with no Staff
 * record is counted as staff, which errs towards Siân seeing a request rather than a
 * request reaching nobody who handles it.
 *
 * Also the one place a person's start date is read for their holiday year.
 */
import { prisma } from "@/lib/prisma";
import type { EffectiveUser } from "@/server/auth/effective-user";
import { ForbiddenError, canApproveBackstage } from "@/server/auth/effective-user";
import { DEVELOPER_RECORD, isDeveloperRecord } from "@/server/codeclear-archived";
import { isAtLeast } from "@/types/auth";
import { ACTIVE_MEMBER } from "@/server/auth/member-status";

/** Admins and up approve everyone's leave; any other approver approves staff only. */
export function looksAfterDevelopers(user: { role: string }): boolean {
  return isAtLeast(user.role, "ADMIN");
}

/** Whether this viewer's Backstage team views are limited to Gitwork staff. */
export function staffOnlyView(user: EffectiveUser): boolean {
  return canApproveBackstage(user) && !looksAfterDevelopers(user);
}

type StaffFacts = { isDeveloper: boolean; startDate: Date | null };

/**
 * The Staff-record facts for each user id, linked by membership first and then by email
 * (records added before the link existed). A user with no record is absent from the map.
 */
export async function staffFactsByUser(workspaceId: string, userIds?: string[]): Promise<Map<string, StaffFacts>> {
  // includes-archived: facts about people whose leave already exists, which is history.
  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId, ...(userIds ? { userId: { in: userIds } } : {}) },
    select: { id: true, userId: true, user: { select: { email: true } } },
  });
  if (members.length === 0) return new Map();
  const byMember = new Map(members.map((m) => [m.id, m.userId]));
  const byEmail = new Map(members.map((m) => [m.user.email.trim().toLowerCase(), m.userId]));
  const records = await prisma.candidate.findMany({
    where: {
      workspaceId,
      origin: { not: "EXTERNAL" },
      OR: [
        { memberId: { in: [...byMember.keys()] } },
        { email: { in: [...byEmail.keys()], mode: "insensitive" } },
      ],
    },
    select: { memberId: true, email: true, githubHandle: true, isDeveloper: true, startDate: true, archivedAt: true },
    orderBy: { createdAt: "asc" },
  });
  const out = new Map<string, StaffFacts>();
  for (const r of records) {
    const userId =
      (r.memberId ? byMember.get(r.memberId) : undefined) ??
      (r.email ? byEmail.get(r.email.trim().toLowerCase()) : undefined);
    if (!userId) continue;
    const linked = r.memberId ? byMember.has(r.memberId) : false;
    const existing = out.get(userId);
    // A record linked to the membership wins over one only matched by email.
    if (existing && !linked) continue;
    out.set(userId, { isDeveloper: isDeveloperRecord(r), startDate: r.startDate });
  }
  return out;
}

/** User ids whose Staff record says they're a developer. */
export async function developerUserIds(workspaceId: string): Promise<string[]> {
  const records = await prisma.candidate.findMany({
    where: { workspaceId, origin: { not: "EXTERNAL" }, ...DEVELOPER_RECORD },
    select: { memberId: true, email: true },
  });
  const memberIds = records.map((r) => r.memberId).filter((x): x is string => Boolean(x));
  const emails = records.map((r) => r.email?.trim().toLowerCase()).filter((x): x is string => Boolean(x));
  if (memberIds.length === 0 && emails.length === 0) return [];
  // includes-archived: a developer who left still had developer leave.
  const members = await prisma.workspaceMember.findMany({
    where: {
      workspaceId,
      OR: [{ id: { in: memberIds } }, { user: { email: { in: emails, mode: "insensitive" } } }],
    },
    select: { userId: true },
  });
  return [...new Set(members.map((m) => m.userId))];
}

/** Whether `targetUserId` is a developer, by their Staff record. */
export async function isDeveloperUser(workspaceId: string, targetUserId: string): Promise<boolean> {
  const facts = await staffFactsByUser(workspaceId, [targetUserId]);
  return facts.get(targetUserId)?.isDeveloper ?? false;
}

/**
 * Refuse a staff-only approver acting on a developer's leave. Callers check approval rights
 * first; this only narrows WHOSE leave.
 */
export async function assertLooksAfterLeaveOf(user: EffectiveUser, targetUserId: string): Promise<void> {
  if (targetUserId === user.id || looksAfterDevelopers(user)) return;
  if (await isDeveloperUser(user.workspaceId, targetUserId)) {
    throw new ForbiddenError("Developers' leave is handled by Admins");
  }
}

/**
 * Who to tell about a leave request: Admins and Super Admins always; staff-only approvers
 * only when the person asking is not a developer. Returns user ids, the requester excluded.
 */
export async function leaveApproverUserIds(workspaceId: string, requesterId: string): Promise<string[]> {
  const [members, requesterIsDeveloper] = await Promise.all([
    prisma.workspaceMember.findMany({
      where: { workspaceId, ...ACTIVE_MEMBER },
      select: { userId: true, role: true, permissions: true },
    }),
    isDeveloperUser(workspaceId, requesterId),
  ]);
  return members
    .filter((m) => m.userId !== requesterId)
    .filter((m) => {
      if (isAtLeast(m.role, "ADMIN")) return true;
      const perms = Array.isArray(m.permissions) ? (m.permissions as string[]) : [];
      return perms.includes("backstage.approve") && !requesterIsDeveloper;
    })
    .map((m) => m.userId);
}
