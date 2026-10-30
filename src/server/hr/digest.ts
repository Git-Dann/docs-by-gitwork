/**
 * The weekly HR digest (docs/hr-platform.md): on Monday mornings, each person with HR access
 * gets what's coming up, what's waiting to be checked and whose record is incomplete, in the
 * bell and by email. Wording and timing live in `src/lib/hr-digest.ts`.
 *
 * Run from the every-minute jobs worker (`/api/cron/jobs`) rather than a cron line of its own:
 * several documented cron lines were never installed on the VPS (CLAUDE.md §11), and a digest
 * that silently never runs reads exactly like a quiet week.
 *
 * - **Who:** active members whose own permissions include `hr.manage`. Not Super Admins by
 *   bypass: HR access is a deliberate grant, never a role default, and a digest to everyone
 *   who *could* look would go to people who never asked for it.
 *   ⚠️ `resolveEffectivePermissions` hands a Super Admin EVERY permission before overrides
 *   are read, so a Super Admin qualifies only with an explicit `hr.manage` grant.
 * - **Once a week:** each workspace's week is claimed with a conditional update before
 *   anything is sent, so two worker runs in the same minute can't both send.
 * - **Each recipient's own view:** the overview is built as them, so it holds only what they
 *   may see.
 */

import { prisma } from "@/lib/prisma";
import { ACTIVE_MEMBER } from "@/server/auth/member-status";
import type { EffectiveUser } from "@/server/auth/effective-user";
import { getHrOverview } from "@/server/hr/activity";
import { dispatchNotification } from "@/server/notifications";
import { sendWorkspaceEmail } from "@/server/email";
import { composeHrDigest, digestWeekDue, londonToday } from "@/lib/hr-digest";
import { workspaceHasModule, resolveWorkspaceModules } from "@/lib/workspace-modules";
import { isSuperAdmin, normalizeMatrix, normalizeOverrides, resolveEffectivePermissions } from "@/types/auth";

const appBaseUrl = () => (process.env.NEXT_PUBLIC_APP_URL ?? "https://foundry.gitwork.co.uk").replace(/\/+$/, "");

export interface HrDigestRun {
  week: string | null;
  workspaces: number;
  sent: number;
  quiet: number;
  emailFailures: number;
}

export async function sendHrDigests(now: Date = new Date()): Promise<HrDigestRun> {
  const week = digestWeekDue(now);
  const run: HrDigestRun = { week, workspaces: 0, sent: 0, quiet: 0, emailFailures: 0 };
  if (!week) return run;

  // Only workspaces that haven't had this week's digest. Cheap on every other minute of the day.
  const due = await prisma.workspace.findMany({
    where: { OR: [{ hrDigestWeek: null }, { hrDigestWeek: { not: week } }] },
    select: { id: true, rolePermissions: true, modulesRestricted: true, enabledModules: true },
  });
  const today = londonToday(now);

  for (const ws of due) {
    // Claim first. Losing the claim means another run has it.
    const claim = await prisma.workspace.updateMany({
      where: { id: ws.id, OR: [{ hrDigestWeek: null }, { hrDigestWeek: { not: week } }] },
      data: { hrDigestWeek: week },
    });
    if (claim.count !== 1) continue;
    // Staff is where the HR records live; a business without it has nothing to report.
    if (!workspaceHasModule("codeclear", resolveWorkspaceModules(ws))) continue;
    run.workspaces += 1;

    const matrix = normalizeMatrix(ws.rolePermissions);
    const members = await prisma.workspaceMember.findMany({
      where: { workspaceId: ws.id, ...ACTIVE_MEMBER },
      select: {
        id: true,
        role: true,
        permissionOverrides: true,
        user: { select: { id: true, email: true, name: true, avatarUrl: true } },
      },
    });
    const hr = members
      .map((m) => {
        const overrides = normalizeOverrides(m.permissionOverrides);
        const permissions = resolveEffectivePermissions(m.role, matrix, overrides);
        const recipient = isSuperAdmin(m.role) ? overrides.grant.includes("hr.manage") : permissions.includes("hr.manage");
        return { m, permissions, recipient };
      })
      .filter((r) => r.recipient);
    if (!hr.length) continue;

    const toCheck = await prisma.staffDocument.count({ where: { workspaceId: ws.id, status: "TO_CHECK" } });

    for (const { m, permissions } of hr) {
      const user: EffectiveUser = {
        id: m.user.id,
        email: m.user.email,
        name: m.user.name,
        avatarUrl: m.user.avatarUrl,
        role: m.role,
        permissions,
        workspaceId: ws.id,
        membershipId: m.id,
      };
      try {
        const overview = await getHrOverview(user, now);
        const digest = composeHrDigest({ ...overview, toCheck }, today, appBaseUrl());
        if (!digest) {
          run.quiet += 1;
          continue;
        }
        dispatchNotification({
          event: "hr.weekly_digest",
          workspaceId: ws.id,
          title: digest.title,
          body: digest.body,
          actionUrl: "/app/staff",
          target: { kind: "users", userIds: [m.user.id] },
          groupKey: `hr.weekly:${week}`,
          metadata: digest.counts,
        });
        const mail = await sendWorkspaceEmail({ workspaceId: ws.id, to: m.user.email, subject: digest.title, html: digest.html, text: digest.text });
        if (!mail.ok) {
          run.emailFailures += 1;
          console.warn(`[hr-digest] email to member ${m.id} not sent: ${mail.error}`);
        }
        run.sent += 1;
      } catch (err) {
        // One person's failure must not stop the rest of the workspace's digests.
        console.error(`[hr-digest] member ${m.id}:`, err instanceof Error ? err.message : err);
      }
    }
  }
  return run;
}
