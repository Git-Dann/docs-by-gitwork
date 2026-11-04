/**
 * Whose leave a Backstage approver looks after.
 *
 * Admins and Super Admins look after everyone. An approver who is NOT an Admin (Siân, from
 * Nov 2026, through the People & office preset) looks after Gitwork's own staff only.
 * Everyone else's leave stays with Admins (Dan, Nov 2026: "she won't be looking after Devs";
 * "Hassaan and Syed are not Gitwork").
 *
 * Gitwork's own staff = `isGitworkStaff` (src/lib/staff.ts): an Employee or Director on their
 * Staff record, and not a developer. Contractors, freelancers and anyone with no Staff record
 * are not hers; their leave still reaches the Admins, so nothing goes unhandled. Staff →
 * People splits its roster by the same rule, so the page and her approvals can't disagree.
 *
 * Also the one place a person's start date is read for their holiday year.
 */
import { prisma } from "@/lib/prisma";
import type { EffectiveUser } from "@/server/auth/effective-user";
import { ForbiddenError, canApproveBackstage } from "@/server/auth/effective-user";
import { isDeveloperRecord } from "@/server/codeclear-archived";
import { GITWORK_EMPLOYMENT_TYPES, isGitworkStaff } from "@/lib/staff";
import { isAtLeast } from "@/types/auth";
import { ACTIVE_MEMBER } from "@/server/auth/member-status";

/** Admins and up approve everyone's leave; any other approver approves Gitwork staff only. */
export function looksAfterDevelopers(user: { role: string }): boolean {
  return isAtLeast(user.role, "ADMIN");
}

/** Whether this viewer's Backstage team views are limited to Gitwork staff. */
export function staffOnlyView(user: EffectiveUser): boolean {
  return canApproveBackstage(user) && !looksAfterDevelopers(user);
}

type StaffFacts = { isGitwork: boolean; startDate: Date | null };

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
    select: {
      memberId: true,
      email: true,
      githubHandle: true,
      isDeveloper: true,
      employmentType: true,
      startDate: true,
    },
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
    out.set(userId, {
      isGitwork: isGitworkStaff({ employmentType: r.employmentType, isDeveloper: isDeveloperRecord(r) }),
      startDate: r.startDate,
    });
  }
  return out;
}

/** User ids of Gitwork's own staff, by their Staff records. */
export async function gitworkUserIds(workspaceId: string): Promise<string[]> {
  const records = await prisma.candidate.findMany({
    where: {
      workspaceId,
      origin: { not: "EXTERNAL" },
      employmentType: { in: [...GITWORK_EMPLOYMENT_TYPES] },
    },
    select: { memberId: true, email: true, githubHandle: true, isDeveloper: true },
  });
  const staff = records.filter((r) => !isDeveloperRecord(r));
  const memberIds = staff.map((r) => r.memberId).filter((x): x is string => Boolean(x));
  const emails = staff.map((r) => r.email?.trim().toLowerCase()).filter((x): x is string => Boolean(x));
  if (memberIds.length === 0 && emails.length === 0) return [];
  // includes-archived: a leaver's past leave is still theirs.
  const members = await prisma.workspaceMember.findMany({
    where: {
      workspaceId,
      OR: [{ id: { in: memberIds } }, { user: { email: { in: emails, mode: "insensitive" } } }],
    },
    select: { userId: true },
  });
  return [...new Set(members.map((m) => m.userId))];
}

/**
 * The `userId` filter for a staff-only viewer's team views: Gitwork's staff, plus the viewer
 * themselves (their own leave is always theirs, even before their record has a type).
 */
export async function gitworkUserFilter(user: EffectiveUser): Promise<{ userId: { in: string[] } }> {
  return { userId: { in: [...new Set([...(await gitworkUserIds(user.workspaceId)), user.id])] } };
}

/** Whether `targetUserId` is one of Gitwork's own staff, by their Staff record. */
export async function isGitworkUser(workspaceId: string, targetUserId: string): Promise<boolean> {
  const facts = await staffFactsByUser(workspaceId, [targetUserId]);
  return facts.get(targetUserId)?.isGitwork ?? false;
}

/**
 * Refuse a staff-only approver acting on leave that isn't Gitwork staff's. Callers check
 * approval rights first; this only narrows WHOSE leave.
 */
export async function assertLooksAfterLeaveOf(user: EffectiveUser, targetUserId: string): Promise<void> {
  if (targetUserId === user.id || looksAfterDevelopers(user)) return;
  if (!(await isGitworkUser(user.workspaceId, targetUserId))) {
    throw new ForbiddenError("This person's leave is handled by Admins");
  }
}

/**
 * Who to tell about a leave request: Admins and Super Admins always; staff-only approvers
 * only when the person asking is Gitwork staff. Returns user ids, the requester excluded.
 */
export async function leaveApproverUserIds(workspaceId: string, requesterId: string): Promise<string[]> {
  const [members, requesterIsGitwork] = await Promise.all([
    prisma.workspaceMember.findMany({
      where: { workspaceId, ...ACTIVE_MEMBER },
      select: { userId: true, role: true, permissions: true },
    }),
    isGitworkUser(workspaceId, requesterId),
  ]);
  return members
    .filter((m) => m.userId !== requesterId)
    .filter((m) => {
      if (isAtLeast(m.role, "ADMIN")) return true;
      const perms = Array.isArray(m.permissions) ? (m.permissions as string[]) : [];
      return perms.includes("backstage.approve") && requesterIsGitwork;
    })
    .map((m) => m.userId);
}
