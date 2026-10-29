/**
 * What a person's profile shows beyond their record (docs/hr-platform.md): tasks they've
 * completed, where they're placed, their leave, and their developer details. Plus HR's
 * "Coming up" list and the records missing details HR needs.
 *
 * Everything is scoped to the caller's workspace, and the same profileAccess rule decides
 * who sees what: leave TYPES (sick, compassionate) are health-adjacent, so anyone but the
 * person and HR sees "Off".
 */

import { prisma } from "@/lib/prisma";
import { countByDay } from "@/lib/charts/activity-heatmap";
import { decrypt } from "@/lib/encryption";
import { ACTIVE_MEMBER } from "@/server/auth/member-status";
import {
  canApproveBackstage,
  canManageHr,
  canViewHrSensitive,
  canViewStaff,
  ForbiddenError,
  type EffectiveUser,
} from "@/server/auth/effective-user";
import {
  comingUpWithin,
  missingDetailsFor,
  parseSensitive,
  type ComingUpItem,
  type MissingDetail,
  type StaffActivity,
} from "@/lib/hr";
import { getLeaveAllowance } from "@/server/backstage";

const DAY_MS = 86_400_000;
const day = (d: Date) => d.toISOString().slice(0, 10);

const LEAVE_LABEL: Record<string, string> = {
  ANNUAL: "Annual leave",
  SICK: "Sick",
  UNPAID: "Unpaid leave",
  OTHER: "Leave",
};

function notFound(): Error {
  return Object.assign(new Error("Staff record not found"), { status: 404 });
}

export async function getStaffActivity(user: EffectiveUser, recordId: string, now = new Date()): Promise<StaffActivity> {
  const record = await prisma.candidate.findFirst({
    where: { id: recordId, workspaceId: user.workspaceId },
    select: {
      id: true,
      githubHandle: true,
      primaryStack: true,
      techStacks: true,
      memberId: true,
      member: { select: { userId: true } },
      placements: {
        orderBy: { startDate: "desc" },
        select: { clientName: true, startDate: true, endDate: true, allocationPercent: true, client: { select: { name: true, slug: true } } },
      },
    },
  });
  if (!record) throw notFound();
  const self = Boolean(record.memberId && record.memberId === user.membershipId);
  if (!self && !canViewStaff(user)) throw notFound();

  const userId = record.member?.userId ?? null;
  const from = new Date(now.getTime() - 26 * 7 * DAY_MS);
  const horizon = new Date(now.getTime() + 90 * DAY_MS);
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const [tasks, leave, allowance] = await Promise.all([
    userId
      ? prisma.task.findMany({
          where: {
            workspaceId: user.workspaceId,
            completedAt: { gte: from, lte: now },
            OR: [{ assignees: { some: { id: userId } } }, { assigneeId: userId }],
          },
          select: { completedAt: true },
          take: 5000,
        })
      : [],
    userId
      ? prisma.leaveRequest.findMany({
          where: {
            workspaceId: user.workspaceId,
            userId,
            status: { in: ["APPROVED", "PENDING"] },
            endDate: { gte: todayStart },
            startDate: { lte: horizon },
          },
          orderBy: { startDate: "asc" },
          select: { type: true, startDate: true, endDate: true, status: true },
        })
      : [],
    userId && (self || canManageHr(user) || canApproveBackstage(user))
      ? getLeaveAllowance(user, userId).catch(() => null)
      : null,
  ]);

  const seeLeaveType = self || canManageHr(user);
  const dates = tasks.map((t) => t.completedAt).filter((d): d is Date => d != null);
  return {
    completedByDay: userId ? countByDay(dates, from, now).map((d) => ({ date: d.date, value: d.count })) : [],
    completedTotal: dates.length,
    placements: record.placements.map((p) => ({
      clientName: p.client?.name ?? p.clientName,
      slug: p.client?.slug ?? null,
      startDate: day(p.startDate),
      endDate: p.endDate ? day(p.endDate) : null,
      allocationPercent: p.allocationPercent,
    })),
    upcomingLeave: leave.map((l) => ({
      start: day(l.startDate),
      end: day(l.endDate),
      label: seeLeaveType ? LEAVE_LABEL[l.type] ?? "Leave" : "Off",
      pending: l.status === "PENDING",
    })),
    allowance: allowance
      ? { allocated: allowance.allocated, used: allowance.used, pending: allowance.pending, remaining: allowance.remaining }
      : null,
    developer: record.githubHandle
      ? { githubHandle: record.githubHandle, primaryStack: record.primaryStack || null, techStacks: record.techStacks }
      : null,
  };
}

/**
 * HR's "Coming up" (contract ends, probation ends, supplier renewals, and right-to-work
 * expiries when the viewer may read personal details) and the active records missing
 * details. HR only.
 *
 * ⚠️ Right-to-work dates live in the encrypted personal tier. Reading them here is a bulk,
 * system read for reminders, so it is not written to each person's access log; only the
 * date leaves the server, never the rest of the record.
 */
export async function getHrOverview(
  user: EffectiveUser,
  now = new Date(),
): Promise<{ comingUp: ComingUpItem[]; missing: MissingDetail[] }> {
  if (!canManageHr(user)) throw new ForbiddenError("You don't have permission to see HR reminders");
  const today = day(now);

  const [records, suppliers, sensitive] = await Promise.all([
    prisma.candidate.findMany({
      where: {
        workspaceId: user.workspaceId,
        archivedAt: null,
        NOT: { origin: "EXTERNAL" },
        OR: [{ memberId: null }, { member: ACTIVE_MEMBER }],
      },
      select: {
        id: true,
        name: true,
        endDate: true,
        probationEndsOn: true,
        employmentType: true,
        startDate: true,
        managerId: true,
        supplierId: true,
        githubHandle: true,
        member: { select: { role: true, user: { select: { name: true } } } },
      },
    }),
    prisma.supplier.findMany({
      where: { workspaceId: user.workspaceId, archivedAt: null, agreementRenewsOn: { not: null } },
      select: { name: true, agreementRenewsOn: true },
    }),
    prisma.staffSensitive.findMany({ where: { workspaceId: user.workspaceId }, select: { recordId: true, payload: true } }),
  ]);

  const nameOf = (r: (typeof records)[number]) => r.member?.user.name?.trim() || r.name;
  const items: ComingUpItem[] = [];
  for (const r of records) {
    if (r.endDate) items.push({ kind: "contract-end", date: day(r.endDate), name: nameOf(r), href: `/app/staff/${r.id}` });
    if (r.probationEndsOn) items.push({ kind: "probation-end", date: day(r.probationEndsOn), name: nameOf(r), href: `/app/staff/${r.id}` });
  }
  for (const s of suppliers) {
    items.push({ kind: "supplier-renewal", date: day(s.agreementRenewsOn!), name: s.name, href: "/app/staff/suppliers" });
  }
  const sensitiveIds = new Set(sensitive.map((s) => s.recordId));
  if (canViewHrSensitive(user)) {
    const names = new Map(records.map((r) => [r.id, nameOf(r)]));
    for (const s of sensitive) {
      const name = names.get(s.recordId);
      if (!name) continue;
      try {
        const rtw = parseSensitive(JSON.parse(decrypt(s.payload))).rightToWorkExpiry;
        if (rtw) items.push({ kind: "right-to-work", date: rtw, name, href: `/app/staff/${s.recordId}` });
      } catch {
        // An unreadable envelope is skipped, never shown as "no expiry".
      }
    }
  }

  const missing: MissingDetail[] = records
    // Developer-vetting records without a login and without a type are Hiring's, not the team's.
    .filter((r) => r.member || r.employmentType || !r.githubHandle)
    .map((r) => ({
      recordId: r.id,
      name: nameOf(r),
      missing: missingDetailsFor({
        employmentType: r.employmentType,
        startDate: r.startDate ? day(r.startDate) : null,
        managerRecordId: r.managerId,
        supplierId: r.supplierId,
        hasSensitive: sensitiveIds.has(r.id),
        isTopOfTree: r.member?.role === "SUPER_ADMIN" || r.employmentType === "DIRECTOR",
      }),
    }))
    .filter((m) => m.missing.length)
    .sort((a, b) => b.missing.length - a.missing.length || a.name.localeCompare(b.name));

  return { comingUp: comingUpWithin(items, today), missing };
}
