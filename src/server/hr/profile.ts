/**
 * A person's HR profile (docs/hr-platform.md, Phase 1): the Staff record plus its
 * employment and sensitive tiers, and the log of who looked at or changed them.
 *
 * Every read and write goes through `profileAccess` (src/lib/hr.ts), so the page, the
 * API and the demo can never disagree about who sees what. The sensitive tier is a
 * separate request from the profile on purpose: opening someone's profile must not
 * read, or log, their personal details unless the viewer actually asks for them.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decrypt, encrypt } from "@/lib/encryption";
import {
  canManageCode,
  canManageHr,
  canViewHrSensitive,
  canViewStaff,
  ForbiddenError,
  type EffectiveUser,
} from "@/server/auth/effective-user";
import {
  changedSensitiveFields,
  normaliseEmployment,
  normaliseSensitive,
  parseSensitive,
  profileAccess,
  shouldLogSensitiveView,
  EMPTY_SENSITIVE,
  HR_ACCESS_ACTIONS,
  type EmploymentUpdate,
  type HrAccessAction,
  type HrAccessEntry,
  type ProfileRelation,
  type SensitiveDetails,
  type StaffProfile,
} from "@/lib/hr";
import { StaffInputError } from "@/server/staff";
import { canRestore } from "@/server/auth/member-status";
import { canManageRole, isAtLeast } from "@/types/auth";
import { deleteBlockReason, type StaffLifecycle } from "@/lib/hr";

const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const toDate = (v: string | null) => (v ? new Date(`${v}T00:00:00Z`) : null);

function notFound(): Error {
  return Object.assign(new Error("Staff record not found"), { status: 404 });
}

const PROFILE_SELECT = {
  id: true,
  name: true,
  email: true,
  avatarUrl: true,
  githubHandle: true,
  jobTitle: true,
  department: true,
  employmentType: true,
  startDate: true,
  managerId: true,
  memberId: true,
  supplierId: true,
  preferredName: true,
  pronouns: true,
  endDate: true,
  probationEndsOn: true,
  noticePeriodWeeks: true,
  daysPerWeek: true,
  archivedAt: true,
  member: { select: { role: true, archivedAt: true, user: { select: { name: true, email: true, avatarUrl: true } } } },
  _count: { select: { placements: true, githubAnalysisRuns: true, devSignalAssessments: true } },
  placements: {
    where: { endDate: null },
    select: { clientName: true, client: { select: { name: true, slug: true } } },
  },
} as const satisfies Prisma.CandidateSelect;

/** The viewer's relation to a record: their own, one of their reports, or anyone else. */
async function relationTo(
  user: EffectiveUser,
  record: { memberId: string | null; managerId: string | null },
): Promise<ProfileRelation> {
  if (record.memberId && record.memberId === user.membershipId) return "self";
  if (!record.managerId) return "other";
  const own = await prisma.candidate.findFirst({
    where: { workspaceId: user.workspaceId, memberId: user.membershipId },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return own && own.id === record.managerId ? "manager" : "other";
}

function accessFor(user: EffectiveUser, relation: ProfileRelation) {
  return profileAccess({
    relation,
    canViewStaff: canViewStaff(user),
    canManageStaff: canManageCode(user),
    canManageHr: canManageHr(user),
    canViewSensitive: canViewHrSensitive(user),
  });
}

async function loadRecord(user: EffectiveUser, recordId: string) {
  const record = await prisma.candidate.findFirst({
    where: { id: recordId, workspaceId: user.workspaceId },
    select: PROFILE_SELECT,
  });
  if (!record) throw notFound();
  const relation = await relationTo(user, record);
  return { record, relation, access: accessFor(user, relation) };
}

async function writeLog(user: EffectiveUser, recordId: string, action: HrAccessAction, detail?: string | null) {
  await prisma.hrAccessLog.create({
    data: {
      workspaceId: user.workspaceId,
      recordId,
      actorUserId: user.id,
      actorName: user.name?.trim() || user.email,
      action,
      detail: detail ?? null,
    },
  });
}

type ProfileRecord = Prisma.CandidateGetPayload<{ select: typeof PROFILE_SELECT }>;

/**
 * Archive / restore / delete, for this viewer. Someone who signs in follows the
 * Settings → Team rule exactly (Admin and above, not yourself, not at or above your
 * rank) because the same routes do the work; a record-only person needs Staff manage.
 */
export function lifecycleFor(user: EffectiveUser, record: ProfileRecord, relation: ProfileRelation): StaffLifecycle {
  const member = record.member;
  const hasLogin = Boolean(member);
  const archivedAt = member ? member.archivedAt : record.archivedAt;
  const canArchive = member
    ? isAtLeast(user.role, "ADMIN") && relation !== "self" && canManageRole(user.role, member.role)
    : canManageCode(user) || canManageHr(user);
  const blocked = deleteBlockReason({
    hasLogin,
    placements: record._count.placements,
    analysisRuns: record._count.githubAnalysisRuns,
    assessments: record._count.devSignalAssessments,
  });
  return {
    hasLogin,
    archived: Boolean(archivedAt),
    archivedAt: archivedAt ? archivedAt.toISOString() : null,
    restorable: member ? !member.archivedAt || canRestore(member) : true,
    canArchive,
    canDelete: canManageCode(user) && !blocked,
    deleteBlockedReason: blocked,
  };
}

export async function getStaffProfile(user: EffectiveUser, recordId: string): Promise<StaffProfile> {
  const { record, relation, access } = await loadRecord(user, recordId);
  // 404 rather than 403: someone without Staff access learns nothing about whether the id exists.
  if (!access.directory) throw notFound();

  const [manager, supplier, sensitive] = await Promise.all([
    record.managerId
      ? prisma.candidate.findFirst({
          where: { id: record.managerId, workspaceId: user.workspaceId },
          select: { name: true, member: { select: { user: { select: { name: true } } } } },
        })
      : null,
    access.employment && record.supplierId
      ? prisma.supplier.findFirst({ where: { id: record.supplierId, workspaceId: user.workspaceId }, select: { name: true } })
      : null,
    access.sensitive ? prisma.staffSensitive.findUnique({ where: { recordId }, select: { id: true } }) : null,
  ]);

  const u = record.member?.user;
  return {
    recordId: record.id,
    memberId: record.memberId,
    name: u?.name?.trim() || record.name,
    preferredName: record.preferredName,
    pronouns: record.pronouns,
    email: u?.email ?? record.email,
    avatarUrl: u?.avatarUrl ?? record.avatarUrl,
    role: record.member?.role ?? null,
    jobTitle: record.jobTitle,
    department: record.department,
    employmentType: record.employmentType,
    startDate: day(record.startDate),
    managerRecordId: record.managerId,
    managerName: manager ? manager.member?.user.name?.trim() || manager.name : null,
    currentClients: record.placements
      .map((p) => (p.client ? { name: p.client.name, slug: p.client.slug } : { name: p.clientName, slug: null }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    isDeveloper: Boolean(record.githubHandle),
    relation,
    access,
    employment: access.employment
      ? {
          supplierId: record.supplierId,
          supplierName: supplier?.name ?? null,
          endDate: day(record.endDate),
          probationEndsOn: day(record.probationEndsOn),
          noticePeriodWeeks: record.noticePeriodWeeks,
          daysPerWeek: record.daysPerWeek,
        }
      : null,
    hasSensitive: Boolean(sensitive),
    lifecycle: lifecycleFor(user, record, relation),
  };
}

/** Archive or restore someone WITHOUT a login. A member is archived through Settings → Team's routes. */
export async function setRecordArchived(user: EffectiveUser, recordId: string, archived: boolean): Promise<void> {
  const { record, relation } = await loadRecord(user, recordId);
  if (record.member) {
    throw new StaffInputError("They sign in to Foundry, so they're archived on their login. Use Archive on their profile.");
  }
  if (!lifecycleFor(user, record, relation).canArchive) throw new ForbiddenError("You don't have permission to archive people");
  await prisma.candidate.update({
    where: { id: record.id },
    data: archived ? { archivedAt: new Date(), archivedById: user.id } : { archivedAt: null, archivedById: null },
  });
}

/**
 * Delete a record made by mistake. Refused for anyone with history (see deleteBlockReason):
 * they are archived instead. Their personal details go with them; the access log stays.
 */
export async function deleteRecord(user: EffectiveUser, recordId: string): Promise<{ name: string }> {
  const { record, relation } = await loadRecord(user, recordId);
  const lifecycle = lifecycleFor(user, record, relation);
  if (lifecycle.deleteBlockedReason) throw new StaffInputError(lifecycle.deleteBlockedReason);
  if (!lifecycle.canDelete) throw new ForbiddenError("You don't have permission to delete people");
  await prisma.$transaction([
    prisma.staffSensitive.deleteMany({ where: { recordId: record.id } }),
    // Nobody keeps pointing at a manager who no longer exists.
    prisma.candidate.updateMany({ where: { workspaceId: user.workspaceId, managerId: record.id }, data: { managerId: null } }),
    prisma.candidate.delete({ where: { id: record.id } }),
  ]);
  return { name: record.name };
}

export async function updateEmployment(user: EffectiveUser, recordId: string, input: EmploymentUpdate): Promise<void> {
  const { record, access } = await loadRecord(user, recordId);
  if (!access.editEmployment) throw new ForbiddenError("You don't have permission to change employment details");
  const v = normaliseEmployment(input);
  if (!v.ok) throw new StaffInputError(v.error);
  const u = v.value;
  if (u.supplierId) {
    const supplier = await prisma.supplier.findFirst({
      where: { id: u.supplierId, workspaceId: user.workspaceId, archivedAt: null },
      select: { id: true },
    });
    if (!supplier) throw new StaffInputError("That supplier isn't on this workspace's list");
  }
  const data: Prisma.CandidateUpdateInput = {
    ...(u.supplierId !== undefined ? { supplierId: u.supplierId } : {}),
    ...(u.endDate !== undefined ? { endDate: toDate(u.endDate) } : {}),
    ...(u.probationEndsOn !== undefined ? { probationEndsOn: toDate(u.probationEndsOn) } : {}),
    ...(u.noticePeriodWeeks !== undefined ? { noticePeriodWeeks: u.noticePeriodWeeks } : {}),
    ...(u.daysPerWeek !== undefined ? { daysPerWeek: u.daysPerWeek } : {}),
  };
  const fields = Object.keys(data);
  if (!fields.length) return;
  await prisma.candidate.update({ where: { id: record.id }, data });
  await writeLog(user, record.id, "UPDATE_EMPLOYMENT", fields.join(", "));
}

async function readSensitive(recordId: string): Promise<SensitiveDetails> {
  const row = await prisma.staffSensitive.findUnique({ where: { recordId }, select: { payload: true } });
  if (!row) return { ...EMPTY_SENSITIVE, emergencyContacts: [] };
  return parseSensitive(JSON.parse(decrypt(row.payload)));
}

/** The sensitive tier. A read by anyone but the person is written to the access log. */
export async function getSensitive(user: EffectiveUser, recordId: string): Promise<SensitiveDetails> {
  const { record, relation, access } = await loadRecord(user, recordId);
  if (!access.directory && relation !== "self") throw notFound();
  if (!access.sensitive) throw new ForbiddenError("You don't have permission to see personal details");
  const details = await readSensitive(record.id);
  if (shouldLogSensitiveView(relation)) await writeLog(user, record.id, "VIEW_SENSITIVE");
  return details;
}

export async function updateSensitive(
  user: EffectiveUser,
  recordId: string,
  input: Partial<SensitiveDetails>,
  today = new Date().toISOString().slice(0, 10),
): Promise<SensitiveDetails> {
  const { record, access } = await loadRecord(user, recordId);
  if (!access.editSensitive) throw new ForbiddenError("You don't have permission to change personal details");
  const v = normaliseSensitive(input, today);
  if (!v.ok) throw new StaffInputError(v.error);
  const before = await readSensitive(record.id);
  const changed = changedSensitiveFields(before, v.value);
  if (!changed.length) return v.value;
  const payload = encrypt(JSON.stringify(v.value));
  await prisma.staffSensitive.upsert({
    where: { recordId: record.id },
    create: { workspaceId: user.workspaceId, recordId: record.id, payload, updatedById: user.id },
    update: { payload, updatedById: user.id },
  });
  // The log names WHAT changed, never the values.
  await writeLog(user, record.id, "UPDATE_SENSITIVE", changed.join(", "));
  return v.value;
}

export async function listAccessLog(user: EffectiveUser, recordId: string, limit = 100): Promise<HrAccessEntry[]> {
  const { record, access } = await loadRecord(user, recordId);
  if (!access.accessLog) throw new ForbiddenError("You don't have permission to see the HR access log");
  const rows = await prisma.hrAccessLog.findMany({
    where: { workspaceId: user.workspaceId, recordId: record.id },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 200),
    select: { id: true, action: true, actorName: true, detail: true, createdAt: true },
  });
  return rows
    .filter((r): r is typeof r & { action: HrAccessAction } => (HR_ACCESS_ACTIONS as readonly string[]).includes(r.action))
    .map((r) => ({ id: r.id, action: r.action, actorName: r.actorName, detail: r.detail, at: r.createdAt.toISOString() }));
}
