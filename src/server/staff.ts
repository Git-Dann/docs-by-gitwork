/**
 * Staff: the people roster (CLAUDE.md §87). Builds one list of everyone on the team
 * from two sources that used to live apart:
 *   - workspace members (people who sign in: role, leave, country), and
 *   - Staff records (Candidate rows: job title, clients, rates, CV, GitHub).
 * They are joined by Candidate.memberId. Records created before that column existed
 * are linked on first read by linkStaffRecords, from the same email match the
 * module always relied on, so nothing has to be migrated by hand.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { mergeStaffClients, productTeamClientsByUser } from "@/server/staff-clients";
import { ACTIVE_MEMBER } from "@/server/auth/member-status";
import { activeDeveloperWhere, archivedDeveloperWhere, archivedTeamEmails } from "@/server/codeclear-archived";
import { isSeedAccount, seedAccountUserWhere } from "@/server/seed-accounts";
import {
  departmentsOf,
  isEmploymentType,
  normaliseStaffDetails,
  sortStaff,
  type StaffDetailsUpdate,
  type StaffPerson,
  type StaffRoster,
} from "@/lib/staff";

export class StaffInputError extends Error {
  status = 400;
}

const norm = (email: string | null | undefined) => (email ?? "").trim().toLowerCase();

/**
 * Pure: which unlinked records can be linked to which member, by email. A link is
 * made only when exactly one member and exactly one unlinked record share an email,
 * and that member has no record yet — an ambiguous match is left for a person to
 * resolve, never guessed.
 */
export function planStaffLinks(
  records: Array<{ id: string; email: string | null; memberId: string | null }>,
  members: Array<{ id: string; email: string }>,
): Array<{ recordId: string; memberId: string }> {
  const taken = new Set(records.map((r) => r.memberId).filter(Boolean));
  const membersByEmail = new Map<string, string[]>();
  for (const m of members) {
    const e = norm(m.email);
    if (e) membersByEmail.set(e, [...(membersByEmail.get(e) ?? []), m.id]);
  }
  const unlinkedByEmail = new Map<string, string[]>();
  for (const r of records) {
    const e = norm(r.email);
    if (!r.memberId && e) unlinkedByEmail.set(e, [...(unlinkedByEmail.get(e) ?? []), r.id]);
  }
  const links: Array<{ recordId: string; memberId: string }> = [];
  for (const [email, recordIds] of unlinkedByEmail) {
    const memberIds = membersByEmail.get(email) ?? [];
    if (recordIds.length !== 1 || memberIds.length !== 1 || taken.has(memberIds[0])) continue;
    links.push({ recordId: recordIds[0], memberId: memberIds[0] });
  }
  return links;
}

/** Links existing records to members by email. Idempotent; writes nothing once done. */
export async function linkStaffRecords(workspaceId: string): Promise<number> {
  const [records, members] = await Promise.all([
    prisma.candidate.findMany({ where: { workspaceId }, select: { id: true, email: true, memberId: true } }),
    // includes-archived: a leaver's record still belongs to them, so it links too.
    prisma.workspaceMember.findMany({ where: { workspaceId }, select: { id: true, user: { select: { email: true } } } }),
  ]);
  const links = planStaffLinks(
    records,
    members.map((m) => ({ id: m.id, email: m.user.email })),
  );
  for (const link of links) {
    // memberId is unique: the guard makes a race with a second request a no-op, not an error.
    await prisma.candidate.updateMany({
      where: { id: link.recordId, memberId: null },
      data: { memberId: link.memberId },
    });
  }
  return links.length;
}

const RECORD_SELECT = {
  id: true,
  name: true,
  email: true,
  avatarUrl: true,
  githubHandle: true,
  primaryStack: true,
  jobTitle: true,
  department: true,
  employmentType: true,
  startDate: true,
  managerId: true,
  memberId: true,
  preferredName: true,
  pronouns: true,
  archivedAt: true,
  placements: {
    where: { endDate: null },
    select: { clientName: true, client: { select: { name: true, slug: true } } },
  },
} as const satisfies Prisma.CandidateSelect;

type RecordRow = Prisma.CandidateGetPayload<{ select: typeof RECORD_SELECT }>;

function recordFields(r: RecordRow | null | undefined) {
  if (!r) {
    return {
      recordId: null,
      preferredName: null,
      pronouns: null,
      jobTitle: null,
      department: null,
      employmentType: null,
      startDate: null,
      managerRecordId: null,
      isDeveloper: false,
      primaryStack: null,
      currentClients: [],
    };
  }
  return {
    recordId: r.id,
    preferredName: r.preferredName,
    pronouns: r.pronouns,
    jobTitle: r.jobTitle,
    department: r.department,
    employmentType: isEmploymentType(r.employmentType) ? r.employmentType : null,
    startDate: r.startDate ? r.startDate.toISOString().slice(0, 10) : null,
    managerRecordId: r.managerId,
    isDeveloper: Boolean(r.githubHandle),
    primaryStack: r.primaryStack || null,
    currentClients: r.placements
      .map((p) => (p.client ? { name: p.client.name, slug: p.client.slug } : { name: p.clientName, slug: null }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/**
 * The roster. `active` is everyone on the team now; `archived` is everyone who has left:
 * members archived in the last 30 days (restorable), records archived from Staff, and
 * developer records whose person has left (the old Archived tab, folded in here).
 */
export async function listStaff(workspaceId: string, view: "active" | "archived" = "active"): Promise<StaffRoster> {
  await linkStaffRecords(workspaceId);
  const archivedEmails = await archivedTeamEmails(workspaceId);
  const archived = view === "archived";
  const [members, records] = await Promise.all([
    // includes-archived: the archived view exists to list them; the active view keeps ACTIVE_MEMBER.
    prisma.workspaceMember.findMany({
      // Placeholder accounts (the bootstrap "Foundry Owner", the seeded "admin") are not
      // people on the team. Same filter Team and Backstage use.
      where: {
        workspaceId,
        ...(archived ? { archivedAt: { not: null } } : ACTIVE_MEMBER),
        user: seedAccountUserWhere(),
      },
      select: {
        id: true,
        role: true,
        archivedAt: true,
        user: { select: { id: true, name: true, email: true, avatarUrl: true } },
        // Earliest first: memberId is not unique in the database (see the schema), so if a
        // race ever left two records on one member, every read picks the same one.
        staffRecords: { select: RECORD_SELECT, orderBy: { createdAt: "asc" }, take: 1 },
      },
    }),
    // Records with no active member behind them: developers and contractors who never
    // sign in. Leavers are excluded the same way the developer lists exclude them, and
    // so are DevSignal's external candidates, who are not on the team.
    prisma.candidate.findMany({
      where: archived
        ? {
            workspaceId,
            memberId: null,
            AND: [{ NOT: { origin: "EXTERNAL" } }, { OR: [{ archivedAt: { not: null } }, archivedDeveloperWhere(archivedEmails)] }],
          }
        : {
            workspaceId,
            archivedAt: null,
            AND: [
              activeDeveloperWhere(archivedEmails),
              { NOT: { origin: "EXTERNAL" } },
              { OR: [{ memberId: null }, { member: { archivedAt: { not: null } } }] },
            ],
          },
      select: RECORD_SELECT,
    }),
  ]);

  // Product and account leads are on a client through its product team, not a placement.
  const ledBy = await productTeamClientsByUser(workspaceId, members.map((m) => m.user.id));

  const people: StaffPerson[] = [
    ...members.filter((m) => !isSeedAccount(m.user)).map((m) => {
      const r = m.staffRecords[0];
      const fields = recordFields(r);
      return {
        key: `m:${m.id}`,
        memberId: m.id,
        name: m.user.name?.trim() || r?.name || m.user.email,
        email: m.user.email,
        avatarUrl: m.user.avatarUrl ?? r?.avatarUrl ?? null,
        role: m.role,
        managerName: null,
        ...fields,
        currentClients: mergeStaffClients(fields.currentClients, ledBy.get(m.user.id) ?? []),
        archivedAt: m.archivedAt ? m.archivedAt.toISOString() : null,
      };
    }),
    ...records.filter((r) => !isSeedAccount(r)).map((r) => ({
      key: `r:${r.id}`,
      memberId: null,
      name: r.name,
      email: r.email,
      avatarUrl: r.avatarUrl,
      role: null,
      managerName: null,
      ...recordFields(r),
      archivedAt: r.archivedAt ? r.archivedAt.toISOString() : null,
    })),
  ];

  const nameByRecord = new Map(people.filter((p) => p.recordId).map((p) => [p.recordId!, p.name]));
  for (const p of people) p.managerName = p.managerRecordId ? nameByRecord.get(p.managerRecordId) ?? null : null;

  return { people: sortStaff(people), departments: departmentsOf(people) };
}

/**
 * A Staff record for someone who signs in but has none yet ("Create profile"), or for
 * someone who doesn't sign in at all (a contractor: name required).
 */
export async function createStaffRecord(
  workspaceId: string,
  input: { memberId?: string; name?: string; email?: string | null } & StaffDetailsUpdate,
): Promise<{ recordId: string }> {
  const details = normaliseStaffDetails(input);
  if (!details.ok) throw new StaffInputError(details.error);

  let name = input.name?.trim() ?? "";
  let email = input.email?.trim() || null;
  let avatarUrl: string | null = null;
  let memberId: string | null = null;

  if (input.memberId) {
    const member = await prisma.workspaceMember.findFirst({
      where: { id: input.memberId, workspaceId, ...ACTIVE_MEMBER },
      select: { id: true, staffRecords: { select: { id: true }, orderBy: { createdAt: "asc" }, take: 1 }, user: { select: { name: true, email: true, avatarUrl: true } } },
    });
    if (!member) throw new StaffInputError("That person isn't an active member of this workspace");
    if (member.staffRecords[0]) return { recordId: member.staffRecords[0].id };
    memberId = member.id;
    name = name || member.user.name?.trim() || member.user.email;
    email = member.user.email;
    avatarUrl = member.user.avatarUrl ?? null;
  }
  if (!name) throw new StaffInputError("Enter a name");
  if (name.length > 120) throw new StaffInputError("Name must be 120 characters or fewer");

  await assertManagerInWorkspace(workspaceId, details.value.managerRecordId);
  const created = await prisma.candidate.create({
    data: {
      workspaceId,
      name,
      email,
      avatarUrl,
      memberId,
      githubHandle: null,
      primaryStack: "",
      origin: "INTERNAL",
      preferredName: details.value.preferredName ?? null,
      pronouns: details.value.pronouns ?? null,
      jobTitle: details.value.jobTitle ?? null,
      department: details.value.department ?? null,
      employmentType: details.value.employmentType ?? null,
      startDate: details.value.startDate ? new Date(`${details.value.startDate}T00:00:00Z`) : null,
      managerId: details.value.managerRecordId ?? null,
    },
    select: { id: true },
  });
  return { recordId: created.id };
}

async function assertManagerInWorkspace(workspaceId: string, managerRecordId: string | null | undefined, self?: string) {
  if (!managerRecordId) return;
  if (managerRecordId === self) throw new StaffInputError("Someone can't be their own manager");
  const manager = await prisma.candidate.findFirst({ where: { id: managerRecordId, workspaceId }, select: { id: true } });
  if (!manager) throw new StaffInputError("That manager isn't on this workspace's roster");
}

export async function updateStaffDetails(workspaceId: string, recordId: string, input: StaffDetailsUpdate): Promise<void> {
  const details = normaliseStaffDetails(input);
  if (!details.ok) throw new StaffInputError(details.error);
  const record = await prisma.candidate.findFirst({ where: { id: recordId, workspaceId }, select: { id: true } });
  if (!record) throw Object.assign(new Error("Staff record not found"), { status: 404 });
  await assertManagerInWorkspace(workspaceId, details.value.managerRecordId, recordId);
  const v = details.value;
  await prisma.candidate.update({
    where: { id: recordId },
    data: {
      ...(v.preferredName !== undefined ? { preferredName: v.preferredName } : {}),
      ...(v.pronouns !== undefined ? { pronouns: v.pronouns } : {}),
      ...(v.jobTitle !== undefined ? { jobTitle: v.jobTitle } : {}),
      ...(v.department !== undefined ? { department: v.department } : {}),
      ...(v.employmentType !== undefined ? { employmentType: v.employmentType } : {}),
      ...(v.startDate !== undefined ? { startDate: v.startDate ? new Date(`${v.startDate}T00:00:00Z`) : null } : {}),
      ...(v.managerRecordId !== undefined ? { managerId: v.managerRecordId } : {}),
    },
  });
}

/**
 * The signed-in person's own Staff record (Backstage → Me). Earliest first, like every
 * other read of a member's record (memberId isn't unique in the database).
 */
export async function getOwnStaffRecordId(workspaceId: string, membershipId: string): Promise<string | null> {
  await linkStaffRecords(workspaceId);
  const own = await prisma.candidate.findFirst({
    where: { workspaceId, memberId: membershipId },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return own?.id ?? null;
}

/**
 * Set up the signed-in person's own record, when HR hasn't yet. Anyone can do this for
 * themselves (it holds nothing but their name and email to start with); setting up a
 * record for SOMEONE ELSE still needs Staff manage (createStaffRecord). Idempotent.
 */
export async function createOwnStaffRecord(workspaceId: string, membershipId: string): Promise<{ recordId: string }> {
  const existing = await getOwnStaffRecordId(workspaceId, membershipId);
  if (existing) return { recordId: existing };
  const member = await prisma.workspaceMember.findFirst({
    where: { id: membershipId, workspaceId, ...ACTIVE_MEMBER },
    select: { id: true, user: { select: { name: true, email: true, avatarUrl: true } } },
  });
  if (!member) throw new StaffInputError("You're not an active member of this workspace");
  try {
    const created = await prisma.candidate.create({
      data: {
        workspaceId,
        name: member.user.name?.trim() || member.user.email,
        email: member.user.email,
        avatarUrl: member.user.avatarUrl ?? null,
        memberId: member.id,
        githubHandle: null,
        primaryStack: "",
        origin: "INTERNAL",
      },
      select: { id: true },
    });
    return { recordId: created.id };
  } catch (err) {
    // memberId is unique, so a second click that raced this one fails here. Theirs won;
    // hand back the record it made rather than an error.
    if ((err as { code?: string }).code !== "P2002") throw err;
    const raced = await getOwnStaffRecordId(workspaceId, membershipId);
    if (!raced) throw err;
    return { recordId: raced };
  }
}
