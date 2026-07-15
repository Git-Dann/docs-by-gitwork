// Absences — same-day "out today" team status. Distinct from planned leave:
// no allowance impact, no approval. Marked from Backstage, optionally announced
// to a Slack channel, and rendered as an overlay on the team calendar.

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import type { EffectiveUser } from "@/server/auth/effective-user";
import { ForbiddenError } from "@/server/auth/effective-user";
import { monthGridRange } from "@/server/backstage-gcal";
import { getSlackBotToken, postMessage } from "@/server/slack/client";
import type { AbsenceDTO, AbsenceKind } from "@/types/backstage";

const BOOTSTRAP_USER_EMAIL = "owner@gitwork.io";

const absenceInclude = {
  user: { select: { id: true, name: true, email: true, avatarUrl: true } },
  createdBy: { select: { id: true, name: true, email: true } },
} satisfies Prisma.AbsenceInclude;

type AbsenceRow = Prisma.AbsenceGetPayload<{ include: typeof absenceInclude }>;

function displayName(u: { name: string | null; email: string }): string {
  return u.name?.trim() ? u.name : u.email;
}

// Slack copy per absence kind. Emoji + phrase → "🤒 *Ada* is off ill today".
const KIND_SLACK: Record<AbsenceKind, { emoji: string; phrase: string }> = {
  AWAY: { emoji: "🌴", phrase: "is away today" },
  ILL: { emoji: "🤒", phrase: "is off ill today" },
  WFH: { emoji: "🏠", phrase: "is working from home today" },
  APPOINTMENT: { emoji: "📅", phrase: "has an appointment today" },
};

function rowToDTO(row: AbsenceRow): AbsenceDTO {
  return {
    id: row.id,
    userId: row.userId,
    userName: displayName(row.user),
    userAvatarUrl: row.user.avatarUrl,
    date: row.date.toISOString(),
    kind: row.kind as AbsenceKind,
    note: row.note,
    createdById: row.createdById,
    createdByName: row.createdBy ? displayName(row.createdBy) : null,
    slackChannelName: row.slackChannelName,
    slackPosted: row.slackPosted,
    createdAt: row.createdAt.toISOString(),
  };
}

// UTC midnight for a given ISO string, or today when omitted.
function dayUtc(iso?: string): Date {
  const base = iso ? new Date(iso) : new Date();
  return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()));
}

export async function listTodayAbsences(user: EffectiveUser): Promise<AbsenceDTO[]> {
  await ensureBaseRecords();
  const rows = await prisma.absence.findMany({
    where: { workspaceId: user.workspaceId, date: dayUtc() },
    include: absenceInclude,
    orderBy: { user: { name: "asc" } },
  });
  return rows.map(rowToDTO);
}

// All absences intersecting the month grid window — for the calendar overlay.
export async function listAbsencesForMonth(
  user: EffectiveUser,
  year: number,
  month: number,
): Promise<AbsenceDTO[]> {
  await ensureBaseRecords();
  const { from, to } = monthGridRange(year, month);
  const rows = await prisma.absence.findMany({
    where: { workspaceId: user.workspaceId, date: { gte: from, lt: to } },
    include: absenceInclude,
    orderBy: [{ date: "asc" }, { user: { name: "asc" } }],
  });
  return rows.map(rowToDTO);
}

export async function markAbsence(
  user: EffectiveUser,
  input: {
    userId: string;
    kind: AbsenceKind;
    note?: string;
    date?: string;
    channelId?: string;
    channelName?: string;
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

  const date = dayUtc(input.date);
  const note = input.note?.trim() || null;

  const row = await prisma.absence.upsert({
    where: {
      workspaceId_userId_date: { workspaceId: user.workspaceId, userId: input.userId, date },
    },
    create: {
      workspaceId: user.workspaceId,
      userId: input.userId,
      date,
      kind: input.kind,
      note,
      createdById: user.id,
      slackChannelId: input.channelId ?? null,
      slackChannelName: input.channelName ?? null,
      slackPosted: false,
    },
    update: {
      kind: input.kind,
      note,
      createdById: user.id,
      slackChannelId: input.channelId ?? null,
      slackChannelName: input.channelName ?? null,
    },
    include: absenceInclude,
  });

  // Announce to Slack (best-effort — the absence is recorded regardless).
  if (input.channelId) {
    const ws = await prisma.workspace.findUnique({
      where: { id: user.workspaceId },
      select: { slackBotToken: true, slackBotTokenEncrypted: true },
    });
    const token = getSlackBotToken(ws);
    if (token) {
      const copy = KIND_SLACK[input.kind];
      const name = displayName(member.user);
      const text = `${copy.emoji} *${name}* ${copy.phrase}${note ? ` — ${note}` : ""}`;
      try {
        const res = await postMessage(token, { channel: input.channelId, text });
        if (res.ok) {
          const updated = await prisma.absence.update({
            where: { id: row.id },
            data: { slackPosted: true, slackMessageTs: res.data?.ts ?? null },
            include: absenceInclude,
          });
          return rowToDTO(updated);
        }
      } catch {
        // Network failure — leave slackPosted false; UI surfaces a soft warning.
      }
    }
  }

  return rowToDTO(row);
}

export async function deleteAbsence(user: EffectiveUser, id: string): Promise<void> {
  const existing = await prisma.absence.findFirst({
    where: { id, workspaceId: user.workspaceId },
    select: { id: true },
  });
  if (!existing) throw new ForbiddenError("Absence not found");
  await prisma.absence.delete({ where: { id } });
}
