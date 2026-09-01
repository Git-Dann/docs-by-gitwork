/**
 * Small, best-effort Slack pings into a client's own internal channel for
 * three wiki events: a changelog entry is added and awaiting approval, a
 * changelog entry gets approved, and a new request comes in from a client
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

/** A new changelog entry was added and is waiting to be approved. */
export async function notifyClientSlackChangelogPending(
  wikiId: string,
  entry: { version: string; title: string },
): Promise<void> {
  const target = await resolveClientSlackTarget(wikiId);
  if (!target) return;
  await postMessage(target.botToken, {
    channel: target.channel,
    text: `:memo: *${target.clientName}* changelog *v${entry.version}* added — "${entry.title}" is awaiting approval.`,
  }).catch(() => undefined);
}

/** A changelog entry moved from PENDING to APPROVED. */
export async function notifyClientSlackChangelogApproved(
  wikiId: string,
  entry: { version: string; title: string },
): Promise<void> {
  const target = await resolveClientSlackTarget(wikiId);
  if (!target) return;
  await postMessage(target.botToken, {
    channel: target.channel,
    text: `:white_check_mark: *${target.clientName}* changelog *v${entry.version}* approved — "${entry.title}"`,
  }).catch(() => undefined);
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
