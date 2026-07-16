// Absences — same-day (or multi-day) team status ("out today"). Distinct from
// planned leave: no allowance impact, no approval. Marked from Backstage,
// optionally announced to a Slack channel, and rendered as a calendar overlay.
//
// Cover: an absence can nominate a stand-in dev who picks up the absent person's
// work on ONE client for the period. Cover is purely ADDITIVE to the absent
// person's tasks (they stay assigned) — we record exactly which tasks we added
// the cover to and whether we created a temporary client assignment, so ending
// the cover reverts precisely (nothing changes for the absent person).

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import type { EffectiveUser } from "@/server/auth/effective-user";
import { ForbiddenError } from "@/server/auth/effective-user";
import { monthGridRange } from "@/server/backstage-gcal";
import { getSlackBotToken, postMessage } from "@/server/slack/client";
import type { AbsenceDTO, AbsenceKind, CoverableClient, CoverAssignmentDTO } from "@/types/backstage";

const BOOTSTRAP_USER_EMAIL = "owner@gitwork.io";

const absenceInclude = {
  user: { select: { id: true, name: true, email: true, avatarUrl: true } },
  createdBy: { select: { id: true, name: true, email: true } },
  coverUser: { select: { id: true, name: true, email: true } },
  coverClient: { select: { id: true, name: true } },
} satisfies Prisma.AbsenceInclude;

type AbsenceRow = Prisma.AbsenceGetPayload<{ include: typeof absenceInclude }>;

function displayName(u: { name: string | null; email: string }): string {
  return u.name?.trim() ? u.name : u.email;
}

const KIND_PHRASE: Record<AbsenceKind, string> = {
  AWAY: "is away",
  ILL: "is off ill",
  WFH: "is working from home",
  APPOINTMENT: "has an appointment",
};

const KIND_EMOJI: Record<AbsenceKind, string> = {
  AWAY: "🌴",
  ILL: "🤒",
  WFH: "🏠",
  APPOINTMENT: "📅",
};

const DAY_FMT = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

function rowToDTO(row: AbsenceRow): AbsenceDTO {
  return {
    id: row.id,
    userId: row.userId,
    userName: displayName(row.user),
    userAvatarUrl: row.user.avatarUrl,
    date: row.date.toISOString(),
    endDate: row.endDate ? row.endDate.toISOString() : null,
    kind: row.kind as AbsenceKind,
    note: row.note,
    createdById: row.createdById,
    createdByName: row.createdBy ? displayName(row.createdBy) : null,
    slackChannelName: row.slackChannelName,
    slackPosted: row.slackPosted,
    coverUserId: row.coverUserId,
    coverUserName: row.coverUser ? displayName(row.coverUser) : null,
    coverClientId: row.coverClientId,
    coverClientName: row.coverClient?.name ?? null,
    coverActive: row.coverActive,
    createdAt: row.createdAt.toISOString(),
  };
}

// UTC midnight for a given ISO string, or today when omitted.
function dayUtc(iso?: string): Date {
  const base = iso ? new Date(iso) : new Date();
  return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()));
}

// Absences overlapping today (start ≤ today ≤ end, treating null end as single-day).
export async function listTodayAbsences(user: EffectiveUser): Promise<AbsenceDTO[]> {
  await ensureBaseRecords();
  const today = dayUtc();
  const rows = await prisma.absence.findMany({
    where: {
      workspaceId: user.workspaceId,
      date: { lte: today },
      OR: [{ endDate: { gte: today } }, { endDate: null, date: today }],
    },
    include: absenceInclude,
    orderBy: { user: { name: "asc" } },
  });
  return rows.map(rowToDTO);
}

// All absences whose range intersects the month grid window — calendar overlay.
export async function listAbsencesForMonth(
  user: EffectiveUser,
  year: number,
  month: number,
): Promise<AbsenceDTO[]> {
  await ensureBaseRecords();
  const { from, to } = monthGridRange(year, month);
  const rows = await prisma.absence.findMany({
    where: {
      workspaceId: user.workspaceId,
      date: { lt: to },
      OR: [{ endDate: { gte: from } }, { endDate: null, date: { gte: from } }],
    },
    include: absenceInclude,
    orderBy: [{ date: "asc" }, { user: { name: "asc" } }],
  });
  return rows.map(rowToDTO);
}

// Clients the given person has active (non-done) tasks on — the cover options.
export async function listCoverableClients(
  user: EffectiveUser,
  absentUserId: string,
): Promise<CoverableClient[]> {
  await ensureBaseRecords();
  const tasks = await prisma.task.findMany({
    where: {
      workspaceId: user.workspaceId,
      status: { not: "DONE" },
      OR: [{ assignees: { some: { id: absentUserId } } }, { assigneeId: absentUserId }],
    },
    select: { clientId: true, client: { select: { name: true } } },
  });
  const byClient = new Map<string, { name: string; count: number }>();
  for (const t of tasks) {
    const cur = byClient.get(t.clientId) ?? { name: t.client.name, count: 0 };
    cur.count += 1;
    byClient.set(t.clientId, cur);
  }
  return Array.from(byClient, ([clientId, v]) => ({
    clientId,
    clientName: v.name,
    taskCount: v.count,
  })).sort((a, b) => b.taskCount - a.taskCount || a.clientName.localeCompare(b.clientName));
}

// Active covers on a given client — who's standing in for whom right now.
// Surfaced on the client's DEVELOPERS card so cover is visible without changing
// the placed dev.
export async function listActiveCoversForClient(
  user: EffectiveUser,
  clientId: string,
): Promise<CoverAssignmentDTO[]> {
  await ensureBaseRecords();
  const rows = await prisma.absence.findMany({
    where: { workspaceId: user.workspaceId, coverClientId: clientId, coverActive: true },
    include: {
      user: { select: { name: true, email: true } },
      coverUser: { select: { name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((r) => ({
    absenceId: r.id,
    coverUserId: r.coverUserId,
    coverUserName: r.coverUser ? displayName(r.coverUser) : null,
    absentUserId: r.userId,
    absentUserName: displayName(r.user),
    endDate: r.endDate ? r.endDate.toISOString() : null,
  }));
}

// Add the cover dev to the absent person's active tasks on one client (additive),
// and grant temporary client access if they don't already have it. Returns what
// we changed so it can be reverted exactly.
async function applyCover(params: {
  workspaceId: string;
  absentUserId: string;
  coverUserId: string;
  coverClientId: string;
}): Promise<{ taskIds: string[]; createdAssignment: boolean }> {
  const { workspaceId, absentUserId, coverUserId, coverClientId } = params;

  const tasks = await prisma.task.findMany({
    where: {
      workspaceId,
      clientId: coverClientId,
      status: { not: "DONE" },
      OR: [{ assignees: { some: { id: absentUserId } } }, { assigneeId: absentUserId }],
    },
    select: { id: true, assignees: { select: { id: true } } },
  });

  const addedTaskIds: string[] = [];
  for (const t of tasks) {
    if (t.assignees.some((a) => a.id === coverUserId)) continue; // already on it — leave untouched
    await prisma.task.update({
      where: { id: t.id },
      data: { assignees: { connect: { id: coverUserId } } },
    });
    addedTaskIds.push(t.id);
  }

  // Temporary client visibility so the cover dev's board actually shows these.
  const existing = await prisma.clientAssignment.findUnique({
    where: { clientId_userId: { clientId: coverClientId, userId: coverUserId } },
    select: { id: true },
  });
  let createdAssignment = false;
  if (!existing) {
    await prisma.clientAssignment.create({
      data: { workspaceId, clientId: coverClientId, userId: coverUserId },
    });
    createdAssignment = true;
  }

  return { taskIds: addedTaskIds, createdAssignment };
}

// Revert a cover: remove the cover dev from exactly the tasks we added them to,
// and drop the temporary client assignment if we created it.
async function revertCover(row: {
  id: string;
  coverUserId: string | null;
  coverClientId: string | null;
  coverTaskIds: string[];
  coverCreatedAssignment: boolean;
}): Promise<void> {
  if (!row.coverUserId) return;
  for (const taskId of row.coverTaskIds) {
    try {
      await prisma.task.update({
        where: { id: taskId },
        data: { assignees: { disconnect: { id: row.coverUserId } } },
      });
    } catch {
      // Task deleted or cover already off — ignore.
    }
  }
  if (row.coverCreatedAssignment && row.coverClientId) {
    await prisma.clientAssignment
      .delete({
        where: { clientId_userId: { clientId: row.coverClientId, userId: row.coverUserId } },
      })
      .catch(() => {});
  }
}

export async function markAbsence(
  user: EffectiveUser,
  input: {
    userId: string;
    kind: AbsenceKind;
    note?: string;
    date?: string;
    endDate?: string;
    channelId?: string;
    channelName?: string;
    coverUserId?: string;
    coverClientId?: string;
  },
): Promise<AbsenceDTO> {
  await ensureBaseRecords();

  // Target must be a real member of this workspace (excludes the seed account).
  const member = await prisma.workspaceMember.findFirst({
    where: {
      workspaceId: user.workspaceId,
      userId: input.userId,
      user: { email: { not: BOOTSTRAP_USER_EMAIL } },
    },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  if (!member) throw new ForbiddenError("That person isn't in your workspace.");

  // Validate cover inputs when provided.
  if (input.coverUserId) {
    if (input.coverUserId === input.userId) {
      throw new ForbiddenError("The cover dev can't be the person who's out.");
    }
    if (!input.coverClientId) throw new ForbiddenError("Pick a client for the cover.");
    const coverMember = await prisma.workspaceMember.findFirst({
      where: { workspaceId: user.workspaceId, userId: input.coverUserId },
      select: { id: true },
    });
    if (!coverMember) throw new ForbiddenError("The cover dev isn't in your workspace.");
    const client = await prisma.workspaceClient.findFirst({
      where: { id: input.coverClientId, workspaceId: user.workspaceId },
      select: { id: true },
    });
    if (!client) throw new ForbiddenError("That client isn't in your workspace.");
  }

  const date = dayUtc(input.date);
  const endDate = input.endDate ? dayUtc(input.endDate) : null;
  const note = input.note?.trim() || null;

  // If re-marking a day that already had an active cover, revert the old one first
  // so the new cover parameters apply cleanly.
  const prior = await prisma.absence.findUnique({
    where: {
      workspaceId_userId_date: { workspaceId: user.workspaceId, userId: input.userId, date },
    },
    select: {
      id: true,
      coverUserId: true,
      coverClientId: true,
      coverTaskIds: true,
      coverCreatedAssignment: true,
      coverActive: true,
    },
  });
  if (prior?.coverActive) {
    await revertCover(prior);
  }

  const base = await prisma.absence.upsert({
    where: {
      workspaceId_userId_date: { workspaceId: user.workspaceId, userId: input.userId, date },
    },
    create: {
      workspaceId: user.workspaceId,
      userId: input.userId,
      date,
      endDate,
      kind: input.kind,
      note,
      createdById: user.id,
      slackChannelId: input.channelId ?? null,
      slackChannelName: input.channelName ?? null,
      slackPosted: false,
      coverUserId: input.coverUserId ?? null,
      coverClientId: input.coverClientId ?? null,
      coverTaskIds: [],
      coverCreatedAssignment: false,
      coverActive: false,
    },
    update: {
      endDate,
      kind: input.kind,
      note,
      createdById: user.id,
      slackChannelId: input.channelId ?? null,
      slackChannelName: input.channelName ?? null,
      coverUserId: input.coverUserId ?? null,
      coverClientId: input.coverClientId ?? null,
      coverTaskIds: [],
      coverCreatedAssignment: false,
      coverActive: false,
      coverEndedAt: null,
    },
    include: absenceInclude,
  });

  // Apply cover now (the absence starts today).
  if (input.coverUserId && input.coverClientId) {
    const { taskIds, createdAssignment } = await applyCover({
      workspaceId: user.workspaceId,
      absentUserId: input.userId,
      coverUserId: input.coverUserId,
      coverClientId: input.coverClientId,
    });
    await prisma.absence.update({
      where: { id: base.id },
      data: { coverTaskIds: taskIds, coverCreatedAssignment: createdAssignment, coverActive: true },
    });
  }

  // Announce to Slack (best-effort — the absence is recorded regardless).
  if (input.channelId) {
    const ws = await prisma.workspace.findUnique({
      where: { id: user.workspaceId },
      select: { slackBotToken: true, slackBotTokenEncrypted: true },
    });
    const token = getSlackBotToken(ws);
    if (token) {
      const name = displayName(member.user);
      const phrase = endDate
        ? `${KIND_PHRASE[input.kind]} until ${DAY_FMT.format(endDate)}`
        : `${KIND_PHRASE[input.kind]} today`;
      let text = `${KIND_EMOJI[input.kind]} *${name}* ${phrase}`;
      if (input.coverUserId && base.coverClient) {
        const coverName = base.coverUser ? displayName(base.coverUser) : "A teammate";
        text += ` — *${coverName}* is covering ${base.coverClient.name}`;
      }
      if (note) text += ` — ${note}`;
      try {
        const res = await postMessage(token, { channel: input.channelId, text });
        if (res.ok) {
          await prisma.absence.update({
            where: { id: base.id },
            data: { slackPosted: true, slackMessageTs: res.data?.ts ?? null },
          });
        }
      } catch {
        // Network failure — leave slackPosted false; UI surfaces a soft warning.
      }
    }
  }

  const fresh = await prisma.absence.findUniqueOrThrow({
    where: { id: base.id },
    include: absenceInclude,
  });
  return rowToDTO(fresh);
}

// Manually end an active cover (revert now) without deleting the absence.
export async function endAbsenceCover(user: EffectiveUser, id: string): Promise<AbsenceDTO> {
  const row = await prisma.absence.findFirst({
    where: { id, workspaceId: user.workspaceId },
    select: {
      id: true,
      coverUserId: true,
      coverClientId: true,
      coverTaskIds: true,
      coverCreatedAssignment: true,
      coverActive: true,
    },
  });
  if (!row) throw new ForbiddenError("Absence not found");
  if (row.coverActive) {
    await revertCover(row);
    await prisma.absence.update({
      where: { id },
      data: { coverActive: false, coverEndedAt: new Date(), coverTaskIds: [] },
    });
  }
  const fresh = await prisma.absence.findUniqueOrThrow({ where: { id }, include: absenceInclude });
  return rowToDTO(fresh);
}

export async function deleteAbsence(user: EffectiveUser, id: string): Promise<void> {
  const existing = await prisma.absence.findFirst({
    where: { id, workspaceId: user.workspaceId },
    select: {
      id: true,
      coverUserId: true,
      coverClientId: true,
      coverTaskIds: true,
      coverCreatedAssignment: true,
      coverActive: true,
    },
  });
  if (!existing) throw new ForbiddenError("Absence not found");
  if (existing.coverActive) await revertCover(existing); // don't leave a dev stranded on the tasks
  await prisma.absence.delete({ where: { id } });
}

// Cron: end covers whose absence period has passed (effective end < today).
export async function expireEndedCovers(): Promise<{ ended: number }> {
  const today = dayUtc();
  const active = await prisma.absence.findMany({
    where: { coverActive: true },
    select: {
      id: true,
      date: true,
      endDate: true,
      coverUserId: true,
      coverClientId: true,
      coverTaskIds: true,
      coverCreatedAssignment: true,
    },
  });
  let ended = 0;
  for (const row of active) {
    const effectiveEnd = row.endDate ?? row.date;
    if (effectiveEnd < today) {
      await revertCover(row);
      await prisma.absence.update({
        where: { id: row.id },
        data: { coverActive: false, coverEndedAt: new Date(), coverTaskIds: [] },
      });
      ended += 1;
    }
  }
  return { ended };
}
