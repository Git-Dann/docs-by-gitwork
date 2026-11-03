/**
 * Who is a developer is now a fact on the Staff record (`Candidate.isDeveloper`), set when
 * someone is invited as one or switched on in their profile. See DEVELOPER_RECORD in
 * src/server/codeclear-archived.ts.
 *
 * For the people already on the team, `backfillDeveloperFlags` decides it ONCE from what was
 * true before the flag existed: a GitHub handle, or the Developer role. It only considers
 * records and memberships from before `DEVELOPER_FLAG_SINCE`, and it settles every such record
 * to true or false, so it can never go on reading the role for anyone (the reason the flag
 * exists: everyone signs in as DEVELOPER, §57.6). Runs at server start-up; a no-op once done.
 */

import { prisma } from "@/lib/prisma";
import { ACTIVE_MEMBER } from "@/server/auth/member-status";
import { DEVELOPER_ROLE } from "@/server/codeclear-archived";
import { seedAccountUserWhere } from "@/server/seed-accounts";
import { linkStaffRecords } from "@/server/staff";

/** Records and memberships created from here on are decided by people, never inferred. */
export const DEVELOPER_FLAG_SINCE = new Date("2026-11-05T00:00:00Z");

export async function backfillDeveloperFlags(): Promise<{ created: number; flagged: number; cleared: number }> {
  const before = { lt: DEVELOPER_FLAG_SINCE };
  const undecided = await prisma.candidate.count({ where: { isDeveloper: null, createdAt: before } });
  const missing = await prisma.workspaceMember.count({
    where: { role: DEVELOPER_ROLE, ...ACTIVE_MEMBER, createdAt: before, staffRecords: { none: {} }, user: seedAccountUserWhere() },
  });
  if (undecided === 0 && missing === 0) return { created: 0, flagged: 0, cleared: 0 };

  // Link records to accounts by email first, so nobody already on a card gets a second one.
  if (missing > 0) {
    const workspaces = await prisma.workspaceMember.findMany({
      where: { role: DEVELOPER_ROLE, ...ACTIVE_MEMBER, createdAt: before, staffRecords: { none: {} } },
      select: { workspaceId: true },
      distinct: ["workspaceId"],
    });
    for (const w of workspaces) await linkStaffRecords(w.workspaceId);
  }

  return prisma.$transaction(async (tx) => {
    // One run at a time: memberId can't be @unique (§2), so two would each make a record.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('developer-flag-backfill'))`;
    const members = await tx.workspaceMember.findMany({
      where: { role: DEVELOPER_ROLE, ...ACTIVE_MEMBER, createdAt: before, staffRecords: { none: {} }, user: seedAccountUserWhere() },
      select: { id: true, workspaceId: true, user: { select: { name: true, email: true, avatarUrl: true } } },
    });
    for (const m of members) {
      await tx.candidate.create({
        data: {
          workspaceId: m.workspaceId,
          memberId: m.id,
          name: m.user.name?.trim() || m.user.email,
          email: m.user.email,
          avatarUrl: m.user.avatarUrl ?? null,
          githubHandle: null,
          primaryStack: "",
          origin: "INTERNAL",
          isDeveloper: true,
        },
      });
    }
    const flagged = await tx.candidate.updateMany({
      where: {
        isDeveloper: null,
        createdAt: before,
        OR: [{ githubHandle: { not: null } }, { member: { role: DEVELOPER_ROLE } }],
      },
      data: { isDeveloper: true },
    });
    const cleared = await tx.candidate.updateMany({
      where: { isDeveloper: null, createdAt: before },
      data: { isDeveloper: false },
    });
    return { created: members.length, flagged: flagged.count, cleared: cleared.count };
  });
}
