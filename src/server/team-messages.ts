// Team messages — something a person wrote and addressed to named people.
//
// Distinct from `Broadcast` (src/server/desk.ts), which looks similar and is not: that
// is a workspace-wide notice board, one active at a time, 500 characters, expiring,
// shown passively on the Desk, notifying nobody. Sending a weekly summary through it
// would take down the workspace notice and reach no one.
//
// This is the one notification event routed to a phone by default — see the note on
// `team.message` in notification-events.ts. Everything else Foundry sends is something
// the system noticed; this is the one a human chose to send.

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { EffectiveUser } from "@/server/auth/effective-user";
import { assertAtLeastAdmin } from "@/server/auth/effective-user";
import { dispatchNotification } from "@/server/notifications";

export type TeamMessageRecipientDTO = {
  userId: string;
  name: string | null;
  email: string;
  readAt: string | null;
};

export type TeamMessageDTO = {
  id: string;
  subject: string;
  body: string;
  createdAt: string;
  author: { id: string; name: string | null; email: string };
  recipients: TeamMessageRecipientDTO[];
  /** Set only when reading as a recipient — when *you* read it. */
  readAt: string | null;
};

// `satisfies` re-arms the excess-property check that extracting an args object into a
// const would otherwise disable — the repo has a test for exactly this, because an
// unguarded `select` referencing a column that does not exist is what 500'd every
// client's wiki.
const MESSAGE_INCLUDE = {
  author: { select: { id: true, name: true, email: true } },
  recipients: {
    select: {
      userId: true,
      readAt: true,
      user: { select: { name: true, email: true } },
    },
  },
} as const satisfies Prisma.TeamMessageInclude;

type MessageRow = {
  id: string;
  subject: string;
  body: string;
  createdAt: Date;
  author: { id: string; name: string | null; email: string };
  recipients: {
    userId: string;
    readAt: Date | null;
    user: { name: string | null; email: string };
  }[];
};

function toDTO(row: MessageRow, viewerId: string): TeamMessageDTO {
  return {
    id: row.id,
    subject: row.subject,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    author: row.author,
    recipients: row.recipients.map((r) => ({
      userId: r.userId,
      name: r.user.name,
      email: r.user.email,
      readAt: r.readAt?.toISOString() ?? null,
    })),
    readAt: row.recipients.find((r) => r.userId === viewerId)?.readAt?.toISOString() ?? null,
  };
}

/**
 * Sends a message to named people.
 *
 * ⚠️ Addressing YOURSELF is honoured, not dropped. `dispatchNotification` excludes the
 * actor by default — right for the other 23 events, which are things the system noticed
 * about something you did and needn't tell you about — but a message you deliberately
 * typed your own name into is a choice, not a slip. The first version silently removed
 * the author, which made it impossible to send yourself a test of your own wording
 * before sending it to someone else. So when the author is among the recipients, the
 * dispatch runs with no actor and the author is notified like anyone else.
 */
export async function sendTeamMessage(
  user: EffectiveUser,
  input: { subject: string; body: string; recipientIds: string[] },
): Promise<TeamMessageDTO> {
  assertAtLeastAdmin(user);

  const requested = [...new Set(input.recipientIds)];
  const includesSelf = requested.includes(user.id);

  // Only people who are actually in this workspace — an id from a stale picker, or a
  // hand-crafted request, must not create a recipient row for someone who cannot open
  // the message.
  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId: user.workspaceId, userId: { in: requested } },
    select: { userId: true },
  });
  const recipientIds = members.map((m) => m.userId);
  if (recipientIds.length === 0) {
    throw Object.assign(new Error("Pick at least one recipient in this workspace."), {
      status: 400,
    });
  }

  const created = await prisma.teamMessage.create({
    data: {
      workspaceId: user.workspaceId,
      authorId: user.id,
      subject: input.subject.trim(),
      body: input.body.trim(),
      recipients: { create: recipientIds.map((userId) => ({ userId })) },
    },
    include: MESSAGE_INCLUDE,
  });

  dispatchNotification({
    event: "team.message",
    workspaceId: user.workspaceId,
    // Omitted when the author addressed themselves, so the dispatcher's
    // exclude-the-actor rule does not undo a deliberate choice.
    actorId: includesSelf ? null : user.id,
    title: created.subject,
    body: preview(created.body),
    actionUrl: `/app/messages/${created.id}`,
    target: { kind: "users", userIds: recipientIds },
    // Per message, so two messages never collapse into one alert — the grouping that
    // makes "you were assigned 15 tasks" one row is wrong here: each message is its own
    // thing to read.
    groupKey: `team-message:${created.id}`,
  });

  return toDTO(created, user.id);
}

/** Messages addressed to this person, newest first. */
export async function listMyTeamMessages(user: EffectiveUser): Promise<TeamMessageDTO[]> {
  const rows = await prisma.teamMessage.findMany({
    where: { workspaceId: user.workspaceId, recipients: { some: { userId: user.id } } },
    include: MESSAGE_INCLUDE,
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return rows.map((row) => toDTO(row, user.id));
}

/** Messages this person sent, newest first — so you can see whether it was read. */
export async function listSentTeamMessages(user: EffectiveUser): Promise<TeamMessageDTO[]> {
  assertAtLeastAdmin(user);
  const rows = await prisma.teamMessage.findMany({
    where: { workspaceId: user.workspaceId, authorId: user.id },
    include: MESSAGE_INCLUDE,
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return rows.map((row) => toDTO(row, user.id));
}

/**
 * One message, readable by its recipients and its author only.
 *
 * ⚠️ Not by any admin. A message addressed to two people is not workspace-wide content,
 * and "admins can read anything" would make this a poor place to write anything candid
 * — which is most of what it is for.
 */
export async function getTeamMessage(
  user: EffectiveUser,
  id: string,
): Promise<TeamMessageDTO | null> {
  const row = await prisma.teamMessage.findFirst({
    where: {
      id,
      workspaceId: user.workspaceId,
      OR: [{ authorId: user.id }, { recipients: { some: { userId: user.id } } }],
    },
    include: MESSAGE_INCLUDE,
  });
  return row ? toDTO(row, user.id) : null;
}

/**
 * Marks a message read for this person. Idempotent, and it never moves an existing
 * timestamp — "first read" is the fact worth keeping, not "last opened".
 */
export async function markTeamMessageRead(user: EffectiveUser, id: string): Promise<void> {
  await prisma.teamMessageRecipient.updateMany({
    where: { messageId: id, userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });
}

/** First line or so, for the notification body and the list row. */
function preview(body: string): string {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length > 140 ? `${flat.slice(0, 139)}…` : flat;
}
