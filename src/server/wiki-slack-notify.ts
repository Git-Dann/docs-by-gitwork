/**
 * Small, best-effort Slack pings into a client's own internal channel for
 * three wiki events: a changelog version is added and awaiting approval, a
 * changelog version gets approved (one message per version, however many platforms), and a new request comes in from a client
 * (public wiki page or the external intake API). Distinct from
 * dispatchNotification's in-app/push notifications to Gitwork staff — this
 * posts to the CLIENT's linked Slack channel, when one exists.
 *
 * Fire-and-forget and silent on any missing piece (no linked channel, no bot
 * token, a Slack API error) — that's the normal case for most clients, not a
 * failure worth surfacing to whoever triggered the event.
 */

import { prisma } from "@/lib/prisma";
import { getSlackBotToken, postMessage } from "@/server/slack/client";
import { effectiveInternalChannel } from "@/server/slack/provisioning";

async function resolveClientSlackTarget(
  wikiId: string,
): Promise<{ botToken: string; channel: string; clientName: string; clientSlug: string } | null> {
  const wiki = await prisma.clientWiki.findUnique({
    where: { id: wikiId },
    select: {
      client: {
        select: {
          name: true,
          slug: true,
          workspaceId: true,
          slackChannelId: true,
          slackInternalChannelId: true,
        },
      },
    },
  });
  const client = wiki?.client;
  if (!client) return null;
  const channel = effectiveInternalChannel(client);
  if (!channel) return null;

  const workspace = await prisma.workspace.findUnique({
    where: { id: client.workspaceId },
    select: { slackBotToken: true, slackBotTokenEncrypted: true },
  });
  const botToken = getSlackBotToken(workspace);
  if (!botToken) return null;

  return { botToken, channel, clientName: client.name, clientSlug: client.slug };
}

// ─── Changelog: one message per VERSION, not per platform ────────────────────
//
// A changelog version is stored as one row per platform, and the editor saves them as
// parallel requests, so "v2.0.1 for iOS and Android" arrived as two identical Slack messages
// (and approving it sent two more). Pings for the same wiki + version that land within
// CHANGELOG_PING_WINDOW_MS are collected and sent as one message naming the platforms.
//
// In-process on purpose: production is one long-running server, the requests come from one
// save in one browser, and a restart inside the window costs one best-effort ping — the same
// failure mode these pings already accept.

export const CHANGELOG_PING_WINDOW_MS = 3000;

const PLATFORM_NAMES: Record<string, string> = {
  IOS: "iOS",
  ANDROID: "Android",
  FIRESTICK: "Fire TV",
  WEB: "Web",
  ALL: "all platforms",
};

/** "iOS", "iOS and Android", "iOS, Android and Web" — in the order given, duplicates dropped. */
export function platformList(platforms: string[]): string {
  const names = [...new Set(platforms)].map((p) => PLATFORM_NAMES[p] ?? p);
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export interface ChangelogPing {
  id: string;
  wikiId: string;
  version: string;
  title: string;
  platform: string;
}

/**
 * Collect items by key; flush each key ONCE, `windowMs` after its first item. A fixed window
 * from the first item, not a sliding one, so a steady trickle can never hold a ping back.
 */
export function createCoalescer<T>(
  windowMs: number,
  flush: (key: string, items: T[]) => Promise<void> | void,
): (key: string, item: T) => void {
  const pending = new Map<string, T[]>();
  return (key, item) => {
    const items = pending.get(key);
    if (items) {
      items.push(item);
      return;
    }
    const batch = [item];
    pending.set(key, batch);
    setTimeout(() => {
      pending.delete(key);
      void Promise.resolve()
        .then(() => flush(key, batch))
        .catch(() => undefined);
    }, windowMs);
  };
}

export function changelogPendingText(clientName: string, pings: ChangelogPing[]): string {
  const { version, title } = pings[0];
  const on = platformList(pings.map((p) => p.platform));
  return `:memo: *${clientName}* changelog *v${version}* added${on ? ` for ${on}` : ""} — "${title}" is awaiting approval.`;
}

export function changelogApprovedText(clientName: string, pings: ChangelogPing[]): string {
  const { version, title } = pings[0];
  const on = platformList(pings.map((p) => p.platform));
  return `:white_check_mark: *${clientName}* changelog *v${version}* approved${on ? ` for ${on}` : ""} — "${title}"`;
}

const pingKey = (p: ChangelogPing) => `${p.wikiId}\u0000${p.version}`;

const queuePending = createCoalescer<ChangelogPing>(CHANGELOG_PING_WINDOW_MS, async (_key, pings) => {
  const { wikiId, version } = pings[0];
  // A version that already had other platform rows was announced when it was added; adding
  // a platform to it later in the editor is an edit, not a new release.
  const rows = await prisma.clientChangelogEntry.findMany({
    where: { wikiId, version },
    select: { id: true },
  });
  const batch = new Set(pings.map((p) => p.id));
  if (rows.some((r) => !batch.has(r.id))) return;
  const target = await resolveClientSlackTarget(wikiId);
  if (!target) return;
  await postMessage(target.botToken, {
    channel: target.channel,
    text: changelogPendingText(target.clientName, pings),
  });
});

const queueApproved = createCoalescer<ChangelogPing>(CHANGELOG_PING_WINDOW_MS, async (_key, pings) => {
  const target = await resolveClientSlackTarget(pings[0].wikiId);
  if (!target) return;
  await postMessage(target.botToken, {
    channel: target.channel,
    text: changelogApprovedText(target.clientName, pings),
  });
});

/** A new changelog entry (one platform of a version) was added and is waiting to be approved. */
export function notifyClientSlackChangelogPending(entry: ChangelogPing): void {
  queuePending(pingKey(entry), entry);
}

/** A changelog entry (one platform of a version) moved to APPROVED. */
export function notifyClientSlackChangelogApproved(entry: ChangelogPing): void {
  queueApproved(pingKey(entry), entry);
}

/** One or more new requests landed in the wiki's Requests (intake) list. */
export async function notifyClientSlackNewRequests(
  wikiId: string,
  items: { title: string }[],
): Promise<void> {
  if (items.length === 0) return;
  const target = await resolveClientSlackTarget(wikiId);
  if (!target) return;
  const text =
    items.length === 1
      ? `:inbox_tray: New request on *${target.clientName}*'s wiki: "${items[0].title}"`
      : `:inbox_tray: ${items.length} new requests on *${target.clientName}*'s wiki, incl. "${items[0].title}"`;
  await postMessage(target.botToken, { channel: target.channel, text }).catch(() => undefined);
}
