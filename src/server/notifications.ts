// In-app notification feed — central dispatcher + read functions.
//
// dispatchNotification() is the single emit point every module calls after a successful
// write. It resolves WHO should hear about an event (by role / permission / client
// assignment), respects each recipient's NotificationPreference, and writes a GROUPED
// in-app row so a dev assigned 15 tasks gets one row ("You were assigned 15 tasks"), not 15.
//
// Fire-and-forget, exactly like notifyDocumentEvent in slack-notify.ts: a failure here must
// never bubble into the originating request (createTask, approveLeaveRequest, …).
//
// Channels: `inApp`, `push` and `slack` are wired; `email` is still deferred.
//
// `slack` is deliberately NOT per-recipient. The other channels deliver to a person, so a
// person's preference governs them. A Slack channel post is a workspace-level broadcast — it
// goes to `Workspace.channelRoutes[event]` exactly once per dispatch, gated on the event's
// DEFAULT routing including "slack". Routing it per-recipient would post N copies of one digest
// to one channel, and would let an individual's preference change what a shared channel sees.
// Existing direct sends (Pulse iOS push, Backstage approver emails, the standup cards) stay
// where they are, so nothing double-sends.

import type { Notification, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { EffectiveUser } from "@/server/auth/effective-user";
import { isAtLeast, isSuperAdmin } from "@/types/auth";
import {
  DEFAULT_EVENT_ROUTING,
  type NotificationChannel,
  type NotificationEvent,
} from "@/server/notification-events";
import type { NotificationDTO } from "@/types/notifications";
import { isWebPushEnabled, sendWebPushToUser } from "@/server/web-push";
import { getSlackBotToken, postMessage } from "@/server/slack/client";

// ─── Dispatcher ──────────────────────────────────────────────────────────────

/** Who should receive an event. Explicit `users` targets are trusted (e.g. a task's
 *  assignees) and bypass client-scope filtering; broadcast targets (`permission`,
 *  `clientTeam`) are intersected with client scope when a clientId is supplied. */
export type AudienceSpec =
  | { kind: "users"; userIds: string[] } // explicit recipients (assignees, leave requester)
  | { kind: "permission"; permission: string } // holders of a permission (support.manage, docs.manage, …)
  | { kind: "backstageApprovers" } // admins + backstage.approve
  | { kind: "admins" } // ADMIN and above
  | { kind: "clientTeam" }; // everyone who can see `clientId` (requires clientId)

export interface DispatchInput {
  event: NotificationEvent;
  workspaceId: string;
  /** The user who caused the event — always excluded from the recipient set. */
  actorId?: string | null;
  /** Static title. Use `titleForCount` instead when the copy depends on the grouped count. */
  title: string;
  /** Recomputed on every upsert so the title and `count` never disagree. */
  titleForCount?: (count: number) => string;
  body?: string | null;
  actionUrl?: string | null;
  /** Entity ref persisted on the row + used for client-scope intersection. */
  clientId?: string | null;
  metadata?: Record<string, unknown>;
  target: AudienceSpec;
  /** Collapse key WITHOUT the per-user suffix — the dispatcher appends ":<userId>". */
  groupKey: string;
  /** How many underlying items this dispatch represents. Bulk paths pass N. Default 1. */
  count?: number;
  /** Extra recipients always included, bypassing client-scope filtering — e.g. meeting
   *  attendees who were on the call (relevant regardless of client attribution). Unioned
   *  with the target set; the actor is still excluded. */
  alwaysUserIds?: string[];
}

/** Same unread group within this window is incremented rather than re-created. */
const GROUP_WINDOW_MS = 6 * 60 * 60 * 1000;

/** Best-effort fire-and-forget. Never throws into the caller. */
export function dispatchNotification(input: DispatchInput): void {
  const job = (async () => {
    try {
      // Workspace-level channel post first, and independent of the recipient set: a digest
      // routed to a channel should still land there even if every individual has muted it.
      await postToSlackChannel(input).catch(() => undefined);

      const recipients = await resolveRecipients(input);
      if (recipients.length === 0) return;
      const pushLive = isWebPushEnabled();
      // Per-recipient isolation — one bad write can't poison delivery to the others.
      await Promise.allSettled(
        recipients.map(async (userId) => {
          const channels = await resolveUserChannels(userId, input.event);
          if (channels.includes("inApp")) await persistInApp(userId, input);
          // Browser push — best-effort, only when VAPID keys are configured and the
          // user routes this event to `push`. sendWebPushToUser self-guards + prunes.
          if (pushLive && channels.includes("push")) {
            await sendWebPushToUser(userId, {
              title: input.title,
              body: input.body ?? null,
              url: input.actionUrl ?? "/app",
              tag: input.groupKey,
            }).catch(() => undefined);
          }
        }),
      );
    } catch (err) {
      console.warn("[notifications] dispatch failed", (err as Error).message);
    }
  })();
  void job;
}

/**
 * One Slack post per dispatch, to the channel mapped for this event in
 * `Workspace.channelRoutes` (e.g. `{"foreman.digest": "C123"}`).
 *
 * Gated on the event's DEFAULT routing containing "slack" — an event is channel-worthy by
 * design, not by an individual's preference. No route configured → silent no-op, so adding
 * "slack" to an event's routing is safe before anyone has picked a channel.
 */
async function postToSlackChannel(input: DispatchInput): Promise<void> {
  if (!(DEFAULT_EVENT_ROUTING[input.event] ?? []).includes("slack")) return;

  const ws = await prisma.workspace.findUnique({
    where: { id: input.workspaceId },
    select: { channelRoutes: true, slackBotToken: true, slackBotTokenEncrypted: true },
  });
  if (!ws) return;

  const routes = ws.channelRoutes;
  if (!routes || typeof routes !== "object" || Array.isArray(routes)) return;
  const channel = (routes as Record<string, unknown>)[input.event];
  if (typeof channel !== "string" || !channel.trim()) return;

  const token = getSlackBotToken(ws);
  if (!token) return;

  const lines = [`*${input.title}*`];
  if (input.body) lines.push(input.body);
  if (input.actionUrl) {
    const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "https://foundry.gitwork.co.uk";
    lines.push(`<${base}${input.actionUrl}|Open in Foundry>`);
  }

  const res = await postMessage(token, { channel: channel.trim(), text: lines.join("\n") });
  if (!res.ok) console.warn("[notifications] slack post failed", { event: input.event, error: res.error });
}

async function resolveRecipients(input: DispatchInput): Promise<string[]> {
  const target = input.target;
  let userIds: string[];
  let applyClientScope = false;

  if (target.kind === "users") {
    userIds = target.userIds;
  } else {
    const members = await prisma.workspaceMember.findMany({
      where: { workspaceId: input.workspaceId },
      select: { userId: true, role: true, permissions: true },
    });
    const has = (m: (typeof members)[number], perm: string) =>
      isSuperAdmin(m.role) ||
      (Array.isArray(m.permissions) && (m.permissions as string[]).includes(perm));

    switch (target.kind) {
      case "permission":
        userIds = members.filter((m) => has(m, target.permission)).map((m) => m.userId);
        applyClientScope = true;
        break;
      case "backstageApprovers":
        userIds = members
          .filter((m) => isAtLeast(m.role, "ADMIN") || has(m, "backstage.approve"))
          .map((m) => m.userId);
        break;
      case "admins":
        userIds = members.filter((m) => isAtLeast(m.role, "ADMIN")).map((m) => m.userId);
        break;
      case "clientTeam":
        userIds = members.map((m) => m.userId);
        applyClientScope = true;
        break;
    }
  }

  // Never notify someone of their own action.
  if (input.actorId) userIds = userIds.filter((id) => id !== input.actorId);

  // Broadcast audiences are limited to clients the recipient can actually see. This is the
  // read-side mirror of clientScopeWhere in tasks.ts — a restricted dev only hears about a
  // client they hold a ClientAssignment for. Explicit `users` targets bypass this (being
  // named — e.g. assigned the task — is itself the authorization to be told).
  if (applyClientScope && input.clientId) {
    userIds = await intersectClientScope(input.workspaceId, input.clientId, userIds);
  }

  // Always-include recipients (e.g. meeting attendees) bypass scope but still exclude the actor.
  if (input.alwaysUserIds?.length) {
    const extra = input.actorId
      ? input.alwaysUserIds.filter((id) => id !== input.actorId)
      : input.alwaysUserIds;
    userIds = [...userIds, ...extra];
  }

  return [...new Set(userIds)];
}

/** Filter `userIds` to those who may see `clientId`: super-admins / seeAllClients always
 *  pass; everyone else needs a ClientAssignment row. */
async function intersectClientScope(
  workspaceId: string,
  clientId: string,
  userIds: string[],
): Promise<string[]> {
  if (userIds.length === 0) return [];
  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId, userId: { in: userIds } },
    select: { userId: true, role: true, permissions: true },
  });
  const allowed = new Set<string>();
  const restricted: string[] = [];
  for (const m of members) {
    const seeAll =
      isSuperAdmin(m.role) ||
      (Array.isArray(m.permissions) && (m.permissions as string[]).includes("seeAllClients"));
    if (seeAll) allowed.add(m.userId);
    else restricted.push(m.userId);
  }
  if (restricted.length > 0) {
    const assignments = await prisma.clientAssignment.findMany({
      where: { workspaceId, clientId, userId: { in: restricted } },
      select: { userId: true },
    });
    for (const a of assignments) allowed.add(a.userId);
  }
  return userIds.filter((id) => allowed.has(id));
}

/** Whether this recipient wants `event` in their in-app feed. Lazy-defaults to the shared
 *  routing map when no preference row / per-event override exists. */
async function resolveUserChannels(
  userId: string,
  event: NotificationEvent,
): Promise<NotificationChannel[]> {
  const pref = await prisma.notificationPreference.findUnique({
    where: { userId },
    select: { inAppEnabled: true, events: true },
  });
  const routing = readEventRouting(pref?.events, event) ?? DEFAULT_EVENT_ROUTING[event] ?? ["inApp"];
  // `inAppEnabled` is the in-app master switch — when off it suppresses only the
  // bell/feed, not push (push is gated separately by VAPID keys + a live sub).
  if (pref && !pref.inAppEnabled) return routing.filter((c) => c !== "inApp");
  return routing;
}

function readEventRouting(
  events: Prisma.JsonValue | null | undefined,
  event: NotificationEvent,
): NotificationChannel[] | null {
  if (!events || typeof events !== "object" || Array.isArray(events)) return null;
  const value = (events as Record<string, unknown>)[event];
  return Array.isArray(value) ? (value as NotificationChannel[]) : null;
}

/** Grouped upsert: increment an existing unread row for this (recipient, group) within the
 *  window, else create a new row. */
async function persistInApp(userId: string, input: DispatchInput): Promise<void> {
  const groupKey = `${input.groupKey}:${userId}`;
  const incoming = input.count ?? 1;
  const since = new Date(Date.now() - GROUP_WINDOW_MS);

  const existing = await prisma.notification.findFirst({
    where: { userId, groupKey, read: false, createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    select: { id: true, count: true, metadata: true },
  });

  if (existing) {
    const nextCount = existing.count + incoming;
    await prisma.notification.update({
      where: { id: existing.id },
      data: {
        count: nextCount,
        title: input.titleForCount ? input.titleForCount(nextCount) : input.title,
        body: input.body ?? null,
        actionUrl: input.actionUrl ?? null,
        metadata: mergeMetadata(existing.metadata, input.metadata),
        // updatedAt bumps automatically (@updatedAt) → the group floats to the top of the feed.
      },
    });
    return;
  }

  await prisma.notification.create({
    data: {
      workspaceId: input.workspaceId,
      userId,
      event: input.event,
      title: input.titleForCount ? input.titleForCount(incoming) : input.title,
      body: input.body ?? null,
      groupKey,
      count: incoming,
      actionUrl: input.actionUrl ?? null,
      clientId: input.clientId ?? null,
      metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}

function mergeMetadata(
  prev: Prisma.JsonValue | null,
  next: Record<string, unknown> | undefined,
): Prisma.InputJsonValue | undefined {
  if (!next) return (prev ?? undefined) as Prisma.InputJsonValue | undefined;
  const base =
    prev && typeof prev === "object" && !Array.isArray(prev) ? (prev as Record<string, unknown>) : {};
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(next)) {
    const existing = out[k];
    out[k] = Array.isArray(existing) && Array.isArray(v) ? [...existing, ...v] : v;
  }
  return out as Prisma.InputJsonValue;
}

// ─── Read ──────────────────────────────────────────────────────────────────

const LIST_LIMIT_DEFAULT = 20;
const LIST_LIMIT_MAX = 50;

function rowToDTO(row: Notification): NotificationDTO {
  return {
    id: row.id,
    event: row.event as NotificationEvent,
    title: row.title,
    body: row.body ?? null,
    count: row.count,
    read: row.read,
    readAt: row.readAt ? row.readAt.toISOString() : null,
    actionUrl: row.actionUrl ?? null,
    clientId: row.clientId ?? null,
    metadata:
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** A user only ever touches their own rows. */
function ownScope(user: EffectiveUser): Prisma.NotificationWhereInput {
  return { workspaceId: user.workspaceId, userId: user.id };
}

export async function listNotifications(
  user: EffectiveUser,
  opts: { limit?: number; unreadOnly?: boolean } = {},
): Promise<NotificationDTO[]> {
  const take = Math.min(opts.limit ?? LIST_LIMIT_DEFAULT, LIST_LIMIT_MAX);
  const rows = await prisma.notification.findMany({
    where: { ...ownScope(user), ...(opts.unreadOnly ? { read: false } : {}) },
    // Grouped rows bump updatedAt on each re-fire, so order by it to float a freshly
    // incremented group ("now 16 tasks") to the top. Tiebreak on id for stability.
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take,
  });
  return rows.map(rowToDTO);
}

export async function unreadCount(user: EffectiveUser): Promise<number> {
  return prisma.notification.count({ where: { ...ownScope(user), read: false } });
}

/** Mark a specific set read. The ownScope clause guarantees a user can only flip their own
 *  rows even if they pass someone else's id. Returns the new unread total for the client. */
export async function markRead(
  user: EffectiveUser,
  ids: string[],
): Promise<{ updated: number; unread: number }> {
  if (ids.length === 0) return { updated: 0, unread: await unreadCount(user) };
  const res = await prisma.notification.updateMany({
    where: { ...ownScope(user), id: { in: ids }, read: false },
    data: { read: true, readAt: new Date() },
  });
  return { updated: res.count, unread: await unreadCount(user) };
}

export async function markAllRead(
  user: EffectiveUser,
): Promise<{ updated: number; unread: number }> {
  const res = await prisma.notification.updateMany({
    where: { ...ownScope(user), read: false },
    data: { read: true, readAt: new Date() },
  });
  return { updated: res.count, unread: 0 };
}
