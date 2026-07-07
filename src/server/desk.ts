/**
 * On Your Desk — server aggregation that isn't owned by another domain module.
 *
 * Pure aggregator, no AI: `getMyDeskSlack` reads recent messages from the Slack
 * channels of the clients the caller can see (scoped exactly like the task board)
 * and merges them into one "what moved" feed. Reuses the workspace bot token and
 * the same `conversations.history` read as the per-client slack-activity route —
 * no new scopes, no Slack↔Foundry user mapping. Unlike that route it does NOT
 * summarise (the Desk never makes live model calls).
 */

import { prisma } from "@/lib/prisma";
import { getSlackBotToken } from "@/server/slack/client";
import {
  canSeeAllClients,
  assertAtLeastAdmin,
  type EffectiveUser,
} from "@/server/auth/effective-user";
import { assignedClientIds } from "@/server/tasks";
import { getHolidaysForCountry } from "@/server/backstage-holidays";
import type {
  DeskSlackMessage,
  DeskSlackResult,
  DeskHolidays,
  NextHoliday,
  DeskReminderDTO,
  BroadcastDTO,
  BroadcastDuration,
  DeskMentionItem,
  DeskMentionsResult,
} from "@/types/desk";

const SLACK_API = "https://slack.com/api";
const MAX_CHANNELS = 8; // cap Slack calls — plenty for a "what moved" glance
const PER_CHANNEL = 8;
const MAX_MESSAGES = 24;

type SlackRawMsg = {
  type: string;
  subtype?: string;
  text?: string;
  ts: string;
  user?: string;
  bot_id?: string;
};

export async function getMyDeskSlack(user: EffectiveUser): Promise<DeskSlackResult> {
  const ws = await prisma.workspace.findUnique({
    where: { id: user.workspaceId },
    select: { slackBotToken: true, slackBotTokenEncrypted: true },
  });
  const token = getSlackBotToken(ws);
  if (!token) return { configured: false, reason: "no_token", messages: [] };

  // Same scope as the task board: everyone → whole workspace; restricted devs →
  // only their assigned clients. Then keep only those with a linked channel.
  const scopeIds = canSeeAllClients(user) ? null : await assignedClientIds(user);
  const clients = await prisma.workspaceClient.findMany({
    where: {
      workspaceId: user.workspaceId,
      hidden: false,
      ...(scopeIds ? { id: { in: scopeIds.length ? scopeIds : ["__none__"] } } : {}),
      OR: [{ slackInternalChannelId: { not: null } }, { slackChannelId: { not: null } }],
    },
    select: { name: true, slug: true, slackChannelId: true, slackInternalChannelId: true },
    orderBy: { updatedAt: "desc" },
    take: MAX_CHANNELS,
  });

  if (clients.length === 0) return { configured: true, reason: "no_channels", messages: [] };

  const auth = { Authorization: `Bearer ${token}` };

  // Fetch each channel's recent history concurrently (shared 2-min fetch cache).
  const perChannel = await Promise.all(
    clients.map(async (c) => {
      const channelId = (c.slackInternalChannelId ?? c.slackChannelId ?? "").trim();
      if (!channelId) return [];
      try {
        const res = await fetch(
          `${SLACK_API}/conversations.history?channel=${encodeURIComponent(channelId)}&limit=${PER_CHANNEL}`,
          { headers: auth, next: { revalidate: 120 } },
        );
        const data = (await res.json()) as { ok: boolean; messages?: SlackRawMsg[] };
        if (!data.ok) return [];
        return (data.messages ?? [])
          .filter((m) => m.type === "message" && !m.subtype && (m.text ?? "").trim().length > 0)
          .map((raw) => ({ raw, client: c }));
      } catch {
        return [];
      }
    }),
  );

  const flat = perChannel.flat();
  if (flat.length === 0) return { configured: true, reason: "empty", messages: [] };

  // Resolve display names once (authors + @-mentions), cached per user for an hour.
  const userIds = new Set<string>();
  for (const { raw } of flat) {
    if (raw.user) userIds.add(raw.user);
    for (const match of (raw.text ?? "").matchAll(/<@([A-Z0-9]+)/g)) userIds.add(match[1]);
  }
  const nameById = new Map<string, string>();
  await Promise.all(
    [...userIds].map(async (uid) => {
      try {
        const res = await fetch(`${SLACK_API}/users.info?user=${uid}`, {
          headers: auth,
          next: { revalidate: 3600 },
        });
        const data = (await res.json()) as {
          ok: boolean;
          user?: {
            name?: string;
            real_name?: string;
            profile?: { display_name?: string; real_name?: string };
          };
        };
        if (data.ok && data.user) {
          const name =
            data.user.profile?.display_name?.trim() ||
            data.user.profile?.real_name?.trim() ||
            data.user.real_name?.trim() ||
            data.user.name?.trim();
          if (name) nameById.set(uid, name);
        }
      } catch {
        /* leave unresolved */
      }
    }),
  );

  const messages: DeskSlackMessage[] = flat
    .map(({ raw, client }) => ({
      id: `${client.slug}:${raw.ts}`,
      author: (raw.user && nameById.get(raw.user)) || (raw.bot_id ? "Bot" : "Teammate"),
      text: formatSlackText(raw.text ?? "", nameById),
      ts: new Date(Math.floor(Number(raw.ts) * 1000)).toISOString(),
      clientName: client.name,
      clientSlug: client.slug,
    }))
    .sort((a, b) => (a.ts < b.ts ? 1 : -1)) // newest first
    .slice(0, MAX_MESSAGES);

  return { configured: true, reason: "ok", messages };
}

// ─── Needs you today: Slack @mentions of the current user ────────────────────

const MENTION_PER_CHANNEL = 40; // look a little deeper than the "what moved" feed
const MAX_MENTIONS = 10;

/**
 * Slack messages that @mention the caller, across the client channels they can
 * see. Resolves the caller's Slack user id from their email at runtime via
 * `users.lookupByEmail` (needs the `users:read.email` bot scope) — no stored
 * Slack↔Foundry mapping. Degrades cleanly: no token → not configured; email not
 * found in Slack → mapped:false (the UI can prompt), never throws.
 */
export async function getMyMentions(user: EffectiveUser): Promise<DeskMentionsResult> {
  const ws = await prisma.workspace.findUnique({
    where: { id: user.workspaceId },
    select: { slackBotToken: true, slackBotTokenEncrypted: true },
  });
  const token = getSlackBotToken(ws);
  if (!token) return { configured: false, mapped: false, items: [] };
  const authHeaders = { Authorization: `Bearer ${token}` };

  // Resolve the caller's Slack identity by email (+ team id for the deep link).
  let myId: string | null = null;
  let teamId: string | null = null;
  try {
    const res = await fetch(`${SLACK_API}/users.lookupByEmail?email=${encodeURIComponent(user.email)}`, {
      headers: authHeaders,
      next: { revalidate: 3600 },
    });
    const data = (await res.json()) as { ok: boolean; user?: { id?: string; team_id?: string } };
    if (data.ok && data.user?.id) {
      myId = data.user.id;
      teamId = data.user.team_id ?? null;
    }
  } catch {
    /* leave unmapped */
  }
  if (!myId) return { configured: true, mapped: false, items: [] };

  // Same scope as the "what moved" feed: whole workspace, or a restricted dev's
  // assigned clients — then only those with a linked channel.
  const scopeIds = canSeeAllClients(user) ? null : await assignedClientIds(user);
  const clients = await prisma.workspaceClient.findMany({
    where: {
      workspaceId: user.workspaceId,
      hidden: false,
      ...(scopeIds ? { id: { in: scopeIds.length ? scopeIds : ["__none__"] } } : {}),
      OR: [{ slackInternalChannelId: { not: null } }, { slackChannelId: { not: null } }],
    },
    select: { name: true, slug: true, slackChannelId: true, slackInternalChannelId: true },
    orderBy: { updatedAt: "desc" },
    take: MAX_CHANNELS,
  });
  if (clients.length === 0) return { configured: true, mapped: true, items: [] };

  const token_ = `<@${myId}>`;
  const perChannel = await Promise.all(
    clients.map(async (c) => {
      const channelId = (c.slackInternalChannelId ?? c.slackChannelId ?? "").trim();
      if (!channelId) return [];
      try {
        const res = await fetch(
          `${SLACK_API}/conversations.history?channel=${encodeURIComponent(channelId)}&limit=${MENTION_PER_CHANNEL}`,
          { headers: authHeaders, next: { revalidate: 120 } },
        );
        const data = (await res.json()) as { ok: boolean; messages?: SlackRawMsg[] };
        if (!data.ok) return [];
        return (data.messages ?? [])
          .filter((m) => m.type === "message" && !m.subtype && (m.text ?? "").includes(token_))
          .map((raw) => ({ raw, client: c, channelId }));
      } catch {
        return [];
      }
    }),
  );

  const flat = perChannel.flat();
  if (flat.length === 0) return { configured: true, mapped: true, items: [] };

  // Resolve author display names (skip the caller — they know who they are).
  const userIds = new Set<string>();
  for (const { raw } of flat) {
    if (raw.user && raw.user !== myId) userIds.add(raw.user);
    for (const match of (raw.text ?? "").matchAll(/<@([A-Z0-9]+)/g)) {
      if (match[1] !== myId) userIds.add(match[1]);
    }
  }
  const nameById = await resolveSlackNames(authHeaders, [...userIds]);

  const items: DeskMentionItem[] = flat
    .map(({ raw, client, channelId }) => ({
      id: `${client.slug}:${raw.ts}`,
      author: (raw.user && nameById.get(raw.user)) || (raw.bot_id ? "Bot" : "Teammate"),
      text: formatSlackText(raw.text ?? "", nameById),
      ts: new Date(Math.floor(Number(raw.ts) * 1000)).toISOString(),
      clientName: client.name,
      clientSlug: client.slug,
      link: teamId ? `https://app.slack.com/client/${teamId}/${channelId}` : null,
    }))
    .sort((a, b) => (a.ts < b.ts ? 1 : -1))
    .slice(0, MAX_MENTIONS);

  return { configured: true, mapped: true, items };
}

/** Resolve Slack user ids → display names (cached 1h per id). Shared helper. */
async function resolveSlackNames(
  authHeaders: { Authorization: string },
  ids: string[],
): Promise<Map<string, string>> {
  const nameById = new Map<string, string>();
  await Promise.all(
    ids.map(async (uid) => {
      try {
        const res = await fetch(`${SLACK_API}/users.info?user=${uid}`, {
          headers: authHeaders,
          next: { revalidate: 3600 },
        });
        const data = (await res.json()) as {
          ok: boolean;
          user?: { name?: string; real_name?: string; profile?: { display_name?: string; real_name?: string } };
        };
        if (data.ok && data.user) {
          const name =
            data.user.profile?.display_name?.trim() ||
            data.user.profile?.real_name?.trim() ||
            data.user.real_name?.trim() ||
            data.user.name?.trim();
          if (name) nameById.set(uid, name);
        }
      } catch {
        /* leave unresolved */
      }
    }),
  );
  return nameById;
}

// ─── Desk reminders — short personal "remember to do this" list ──────────────

/** Reminders live for 7 days, then drop off. Enforced on read (below) + an
 *  opportunistic purge so the table stays lean without a dedicated cron. */
export const REMINDER_TTL_DAYS = 7;

function reminderCutoff(): Date {
  return new Date(Date.now() - REMINDER_TTL_DAYS * 86_400_000);
}

function reminderToDTO(r: {
  id: string;
  body: string;
  done: boolean;
  createdAt: Date;
}): DeskReminderDTO {
  return { id: r.id, body: r.body, done: r.done, createdAt: r.createdAt.toISOString() };
}

export async function listDeskReminders(user: EffectiveUser): Promise<DeskReminderDTO[]> {
  const cutoff = reminderCutoff();
  const rows = await prisma.deskReminder.findMany({
    where: { workspaceId: user.workspaceId, userId: user.id, createdAt: { gte: cutoff } },
    orderBy: [{ done: "asc" }, { createdAt: "desc" }],
  });
  // Opportunistic cleanup of this user's expired reminders — best-effort.
  void prisma.deskReminder
    .deleteMany({ where: { userId: user.id, createdAt: { lt: cutoff } } })
    .catch(() => undefined);
  return rows.map(reminderToDTO);
}

export async function createDeskReminder(user: EffectiveUser, body: string): Promise<DeskReminderDTO> {
  const row = await prisma.deskReminder.create({
    data: { workspaceId: user.workspaceId, userId: user.id, body: body.trim() },
  });
  return reminderToDTO(row);
}

export async function updateDeskReminder(
  user: EffectiveUser,
  id: string,
  input: { done?: boolean; body?: string },
): Promise<DeskReminderDTO> {
  // Scope the update to the caller's own rows — updateMany returns a count, so a
  // mismatched id/owner touches nothing (no cross-user edits).
  const res = await prisma.deskReminder.updateMany({
    where: { id, userId: user.id, workspaceId: user.workspaceId },
    data: {
      ...(input.done !== undefined ? { done: input.done } : {}),
      ...(input.body !== undefined ? { body: input.body.trim() } : {}),
    },
  });
  if (res.count === 0) throw new Error("Reminder not found");
  const row = await prisma.deskReminder.findUniqueOrThrow({ where: { id } });
  return reminderToDTO(row);
}

export async function deleteDeskReminder(user: EffectiveUser, id: string): Promise<void> {
  await prisma.deskReminder.deleteMany({
    where: { id, userId: user.id, workspaceId: user.workspaceId },
  });
}

// ─── Broadcasts — workspace-wide announcement banner (admin/super-admin only) ─

function broadcastToDTO(b: {
  id: string;
  message: string;
  expiresAt: Date;
  createdAt: Date;
}): BroadcastDTO {
  return {
    id: b.id,
    message: b.message,
    expiresAt: b.expiresAt.toISOString(),
    createdAt: b.createdAt.toISOString(),
  };
}

/** The single live broadcast for the workspace, or null. Shown to everyone. */
export async function getActiveBroadcast(user: EffectiveUser): Promise<BroadcastDTO | null> {
  const row = await prisma.broadcast.findFirst({
    where: { workspaceId: user.workspaceId, active: true, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  return row ? broadcastToDTO(row) : null;
}

/** Post a new broadcast (admins/super-admins). Retires any current active one in
 *  the same transaction so there's only ever one live at a time. */
export async function postBroadcast(
  user: EffectiveUser,
  input: { message: string; durationDays: BroadcastDuration },
): Promise<BroadcastDTO> {
  assertAtLeastAdmin(user);
  const expiresAt = new Date(Date.now() + input.durationDays * 86_400_000);
  const [, created] = await prisma.$transaction([
    prisma.broadcast.updateMany({
      where: { workspaceId: user.workspaceId, active: true },
      data: { active: false },
    }),
    prisma.broadcast.create({
      data: {
        workspaceId: user.workspaceId,
        message: input.message.trim(),
        expiresAt,
        createdById: user.id,
      },
    }),
  ]);
  return broadcastToDTO(created);
}

/** Take down the current broadcast (admins/super-admins). */
export async function dismissActiveBroadcast(user: EffectiveUser): Promise<void> {
  assertAtLeastAdmin(user);
  await prisma.broadcast.updateMany({
    where: { workspaceId: user.workspaceId, active: true },
    data: { active: false },
  });
}

// ─── The Desk: next public holidays (UK + Pakistan) ──────────────────────────

/**
 * The next upcoming public/bank holiday for each hub country, for the Desk's
 * "Around the team" strip. Uses the bundled `date-holidays` (server-only, no API,
 * no AI) via `getHolidaysForCountry` — looks a full year ahead so the next holiday
 * is always found even when it's months out (the staffing-alerts window caps at 90d).
 */
export function getNextHolidays(): DeskHolidays {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const horizon = new Date(today);
  horizon.setUTCDate(horizon.getUTCDate() + 400);

  const pick = (cc: string): NextHoliday => {
    const hols = getHolidaysForCountry(cc, today, horizon); // sorted asc
    const next = hols.find((h) => h.type === "public" || h.type === "bank") ?? hols[0];
    if (!next) return null;
    const when = new Date(`${next.date}T00:00:00Z`);
    const inDays = Math.round((when.getTime() - today.getTime()) / 86_400_000);
    return { name: next.name, date: next.date, inDays };
  };

  return { gb: pick("GB"), pk: pick("PK") };
}

/** Turn Slack mrkdwn tokens into readable text (mentions, channels, links, entities). */
function formatSlackText(text: string, names: Map<string, string>): string {
  let t = text;
  t = t.replace(/<@([A-Z0-9]+)(?:\|([^>]+))?>/g, (_m, id: string, fb: string) =>
    "@" + (names.get(id) || fb || "someone"),
  );
  t = t.replace(/<#[A-Z0-9]+(?:\|([^>]+))?>/g, (_m, name: string) => "#" + (name || "channel"));
  t = t.replace(/<!subteam\^[A-Z0-9]+(?:\|([^>]+))?>/g, (_m, label: string) => label || "@group");
  t = t.replace(/<!(here|channel|everyone)>/g, (_m, k: string) => "@" + k);
  t = t.replace(/<((?:https?|mailto):[^>|]+)(?:\|([^>]+))?>/g, (_m, url: string, label: string) => label || url);
  t = t.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  return t;
}
