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
  /** True when the viewer is the author, which is what unlocks delete + receipts. */
  isAuthor: boolean;
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
    isAuthor: row.author.id === viewerId,
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

  // ⚠️ Double-submit guard. A push is irreversible once sent, so two taps on Send is
  // two notifications on someone's phone for one message — and the person on the
  // receiving end cannot tell it was an accident. The button disables while pending,
  // but that only covers the tab it was pressed in: a retry after a flaky response, or
  // a second tab, still gets through.
  //
  // Matched on author + identical subject and body within a minute, which is what a
  // double-submit looks like and what a deliberate re-send an hour later does not.
  const duplicate = await prisma.teamMessage.findFirst({
    where: {
      workspaceId: user.workspaceId,
      authorId: user.id,
      subject: input.subject.trim(),
      body: input.body.trim(),
      createdAt: { gte: new Date(Date.now() - 60_000) },
    },
    include: MESSAGE_INCLUDE,
  });
  if (duplicate) return toDTO(duplicate, user.id);

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
    where: {
      workspaceId: user.workspaceId,
      // Dismissed messages leave this person's list and nobody else's.
      recipients: { some: { userId: user.id, dismissedAt: null } },
    },
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

/**
 * Marks a message UNREAD again for this person.
 *
 * The counterpart to `markTeamMessageRead`, and not merely symmetry: opening a message
 * is how you find out it needs twenty minutes you do not have right now, and without
 * this the only way to keep it on your list is to not open it at all. Clearing the
 * stamp loses the original read time, which is the honest trade — the author's receipt
 * should say "unread" if the reader has put it back.
 */
export async function markTeamMessageUnread(user: EffectiveUser, id: string): Promise<void> {
  await prisma.teamMessageRecipient.updateMany({
    where: { messageId: id, userId: user.id },
    data: { readAt: null },
  });
}

/** Marks every message addressed to this person as read. */
export async function markAllTeamMessagesRead(user: EffectiveUser): Promise<number> {
  const result = await prisma.teamMessageRecipient.updateMany({
    where: {
      userId: user.id,
      readAt: null,
      dismissedAt: null,
      message: { workspaceId: user.workspaceId },
    },
    data: { readAt: new Date() },
  });
  return result.count;
}

/**
 * Removes a message from THIS person's list, leaving everyone else's alone.
 *
 * ⚠️ Deliberately not a delete. A recipient clearing their own inbox must not be able
 * to destroy a message addressed to four other people. The row survives so the author's
 * read receipt stays truthful — "they read it and filed it" is not "it never arrived".
 */
export async function dismissTeamMessage(user: EffectiveUser, id: string): Promise<void> {
  await prisma.teamMessageRecipient.updateMany({
    where: { messageId: id, userId: user.id, dismissedAt: null },
    data: { dismissedAt: new Date() },
  });
}

/**
 * Deletes a message for everyone. Author only.
 *
 * ⚠️ This is a delete, not an unsend. The notification has already been delivered and
 * may already have been read on someone's phone; nothing here can recall that. What it
 * does is stop the message being reachable from now on. The UI says so rather than
 * implying the words can be taken back.
 *
 * Not permitted to admins-in-general, matching `getTeamMessage`: a message addressed to
 * two people is not workspace content, and letting any admin delete one would make the
 * author's copy something they do not control.
 */
export async function deleteTeamMessage(user: EffectiveUser, id: string): Promise<boolean> {
  const result = await prisma.teamMessage.deleteMany({
    where: { id, workspaceId: user.workspaceId, authorId: user.id },
  });
  return result.count > 0;
}
