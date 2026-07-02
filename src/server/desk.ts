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
import { canSeeAllClients, type EffectiveUser } from "@/server/auth/effective-user";
import { assignedClientIds } from "@/server/tasks";
import { getHolidaysForCountry } from "@/server/backstage-holidays";
import type { DeskSlackMessage, DeskSlackResult, DeskHolidays, NextHoliday } from "@/types/desk";

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
