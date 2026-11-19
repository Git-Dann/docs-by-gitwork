/**
 * client-notifications.ts — what a client's phone is allowed to be told, and when.
 *
 * Two things: the developers' daily standup, and a reply that @mentions the client
 * person by name on one of their requests. The Slack half of this
 * already works — `tasks-standup.ts` posts each dev's card to the client's Slack
 * Connect channel when one is linked — so this is for the clients who live in the
 * app instead of in a shared channel.
 */

import { prisma } from "@/lib/prisma";
import { isApnsConfigured, type ApnsPayload } from "./apns";
import {
  clientDeviceStore,
  listActiveClientDevices,
  listActiveClientDevicesForUser,
} from "./client-devices";
import { clientMentionRecipients } from "@/lib/wiki-intake-reply-notify";
import type { StoredMention } from "@/lib/wiki-mentions";
import { fanOutToDevices } from "./transport";
import { fitTitle, shrinkToFit } from "./notifications";

export type StandupPhase = "AM" | "PM";

/**
 * When a client's phone may ring, in the hours below.
 *
 * ⚠️ THIS IS NOT OPTIONAL POLISH. The developers are in Islamabad (UTC+5) and the
 * clients are in the UK, so a developer pushing their morning standup at 09:00
 * their time is pushing it at 04:00 or 05:00 in the client's. Fanning that straight
 * out would wake people up, and a notification that wakes someone up once is a
 * notification they switch off forever.
 */
const QUIET_HOURS_START = 21; // 21:00 and later is too late
const QUIET_HOURS_END = 7; // before 07:00 is too early

/**
 * ⚠️ A workspace-level assumption, not a per-client fact: there is no timezone on
 * `WorkspaceClient`, and inventing one from a website's TLD would be a guess wearing
 * the costume of a setting. Every current client is UK-based, which is the only
 * reason this is safe — the day one is not, this needs a real column rather than a
 * better default.
 */
const CLIENT_TIMEZONE = "Europe/London";

/** The hour of `at` in the client's timezone, 0–23. */
export function clientLocalHour(at: Date, timeZone: string = CLIENT_TIMEZONE): number {
  const hour = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "numeric",
    hour12: false,
  }).format(at);
  return Number.parseInt(hour, 10);
}

/** Whether a client's phone may be rung at this moment. */
export function isWithinClientPushHours(at: Date, timeZone: string = CLIENT_TIMEZONE): boolean {
  const hour = clientLocalHour(at, timeZone);
  return hour >= QUIET_HOURS_END && hour < QUIET_HOURS_START;
}

/** `standup:AM:2026-10-21` — the receipt key, and therefore the dedupe unit. */
export function standupReceiptKey(phase: StandupPhase, workDate: Date): string {
  return `standup:${phase}:${workDate.toISOString().slice(0, 10)}`;
}

export type ClientStandupPushResult =
  | { status: "sent"; devices: number }
  | { status: "already_sent" }
  | { status: "quiet_hours" }
  | { status: "no_devices" }
  | { status: "apns_unconfigured" };

/**
 * Tells one client's phones that their team has posted an update.
 *
 * ⚠️ ONE PUSH PER CLIENT PER PHASE PER DAY, and the dedupe is the reason this
 * feature is usable. Every developer pushes their own standup, so Wedge — five
 * active developers — would otherwise send ten alerts a day. The first developer to
 * push a phase takes the receipt and sends the digest; the rest find the unique key
 * taken and send nothing.
 *
 * ⚠️ The receipt is written BEFORE the send, so the insert itself is the lock. A
 * check-then-send would let two developers pushing within the same second both pass
 * the check. The cost of this ordering is the honest one: if APNs then fails, that
 * phase is not retried — a missed update is better than a duplicated one, and the
 * Slack post is unaffected either way.
 *
 * Best-effort, like every other sender here. It never throws, because a developer's
 * standup must never fail on account of a client's phone.
 */
export async function sendClientStandupPush(args: {
  wikiId: string;
  clientName: string;
  phase: StandupPhase;
  workDate: Date;
  now?: Date;
}): Promise<ClientStandupPushResult> {
  const now = args.now ?? new Date();

  if (!isApnsConfigured()) return { status: "apns_unconfigured" };

  // Checked BEFORE the receipt is claimed, on purpose. Out of hours we write
  // nothing at all, so a later developer pushing the same phase inside the window
  // still gets to deliver it. Claiming first would silently burn the day's only
  // chance on a push that was never sent.
  if (!isWithinClientPushHours(now)) return { status: "quiet_hours" };

  const key = standupReceiptKey(args.phase, args.workDate);
  try {
    await prisma.clientPushReceipt.create({ data: { wikiId: args.wikiId, key } });
  } catch {
    // Unique violation — another developer's standup got here first. That is the
    // mechanism working, not an error.
    return { status: "already_sent" };
  }

  const devices = await listActiveClientDevices(args.wikiId);
  if (devices.length === 0) {
    // Nobody on this client has the app. Extremely common, and not a failure —
    // recorded so the receipt reflects what actually happened.
    return { status: "no_devices" };
  }

  const copy = standupPushCopy(args.phase);
  const payload: ApnsPayload = {
    aps: {
      alert: { title: fitTitle(copy.title), body: copy.body },
      sound: "default",
      "thread-id": key,
    },
    // The app reads `kind` to decide how to open. A client build has no Foundry
    // session, so it must never be handed a staff `path` — this carries a wiki
    // SECTION instead, which is all a client surface can act on.
    kind: "client-standup",
    section: "roundup",
  };

  const result = await fanOutToDevices(
    devices.map((d) => ({
      id: d.id,
      token: d.token,
      environment: d.environment,
      ownerId: d.clientWikiUserId,
    })),
    clientDeviceStore,
    shrinkToFit(payload),
    key,
  );
  await prisma.clientPushReceipt
    .updateMany({ where: { wikiId: args.wikiId, key }, data: { deviceCount: result.sent } })
    .catch(() => {});

  return { status: "sent", devices: result.sent };
}

/**
 * What the alert says.
 *
 * ⚠️ No numbers. The push fires on the FIRST developer of the phase, so any count
 * taken here ("3 updates") is already wrong by the time the client opens it, and a
 * figure that contradicts the screen behind it is worse than no figure. The app
 * shows the real thing.
 */
export function standupPushCopy(phase: StandupPhase): { title: string; body: string } {
  return phase === "AM"
    ? {
        title: "This morning's update",
        body: "Your team has posted what they're working on today.",
      }
    : {
        title: "Today's update",
        body: "Your team has posted what they moved today.",
      };
}

/**
 * Fans the standup digest out to every involved client that has a wiki.
 *
 * ⚠️ Fire-and-forget, and it never throws. A developer's standup is the thing
 * that must succeed; a client's phone is a courtesy on top of it. The Slack post
 * has always been best-effort for the same reason, and this must not be the one
 * part of the path that can fail a dev's push.
 *
 * ⚠️ Takes THIS PHASE's clients, not the day's merged set. The merged list unions
 * what an earlier phase already recorded, so passing it would push an afternoon
 * update to a client this developer did no afternoon work for.
 */
export async function notifyClientsOfStandup(args: {
  workspaceId: string;
  clientIds: string[];
  phase: StandupPhase;
  workDate: Date;
}): Promise<void> {
  if (args.clientIds.length === 0) return;
  if (!isApnsConfigured()) return;

  const clients = await prisma.workspaceClient.findMany({
    where: { workspaceId: args.workspaceId, id: { in: args.clientIds } },
    select: { id: true, name: true, wiki: { select: { id: true } } },
  });

  await Promise.all(
    clients.map(async (client) => {
      // No wiki means no portal, so there is nobody to tell.
      if (!client.wiki) return;
      try {
        await sendClientStandupPush({
          wikiId: client.wiki.id,
          clientName: client.name,
          phase: args.phase,
          workDate: args.workDate,
        });
      } catch (err) {
        console.error(`[push] client standup push failed for client ${client.id}`, err);
      }
    }),
  );
}

// MARK: - A client @mentioned on one of their requests

/** Replies that mention the same person on the same request inside this window ring once. */
export const MENTION_PUSH_WINDOW_MS = 10 * 60_000;
/** The most mention alerts one client person gets in an hour, across all requests. */
export const MENTION_PUSH_HOURLY_CAP = 10;
/** The longest reply excerpt on a lock screen. */
export const MENTION_EXCERPT_MAX = 120;

/**
 * `mention:<wikiUserId>:<requestId>:<window>` — the receipt key, and therefore the
 * dedupe unit. The person comes first so one person's alerts in the last hour can be
 * counted by prefix, which is how the hourly cap is enforced.
 */
export function mentionReceiptKey(wikiUserId: string, itemId: string, at: Date): string {
  return `mention:${wikiUserId}:${itemId}:${Math.floor(at.getTime() / MENTION_PUSH_WINDOW_MS)}`;
}

/**
 * What the alert says. Who mentioned them, and a short excerpt of the reply — which the
 * client can already read on their own request, so nothing on the lock screen is
 * something they could not see. Never a Foundry path, a staff name they cannot see in
 * the thread, or anything about other requests.
 */
export function mentionPushCopy(authorName: string, body: string): { title: string; body: string } {
  const clean = body.replace(/\s+/g, " ").trim();
  const excerpt =
    clean.length > MENTION_EXCERPT_MAX ? `${clean.slice(0, MENTION_EXCERPT_MAX - 1).trimEnd()}…` : clean;
  return {
    title: `${authorName.trim() || "Someone"} mentioned you`,
    body: excerpt || "They mentioned you on one of your requests.",
  };
}

export type ClientMentionPushResult = {
  status: "sent" | "no_recipients" | "apns_unconfigured" | "quiet_hours" | "nothing_to_send";
  /** Devices actually reached. */
  devices: number;
  /** People skipped because they had already been told about this request just now,
   *  or had hit the hourly cap. */
  throttled: number;
};

/**
 * Rings the phone of each of the client's own people named in a reply on one of their
 * requests.
 *
 * ⚠️ The rules, each a way this goes wrong:
 *   • ONLY a `client:` mention that resolves to a client user OF THIS WIKI. Ids are
 *     already re-checked against the wiki's directory when the reply is saved
 *     (`resolveMentions`); this re-checks against the table so a stale or foreign id
 *     can never reach another client's phone.
 *   • ONE PERSON'S DEVICES, never the wiki's (see `listActiveClientDevicesForUser`).
 *   • NEVER STAFF. Gitwork people are `team:` mentions and already get
 *     `wiki.request_mention` in Foundry; nothing here looks at them.
 *   • THE AUTHOR IS NEVER RUNG.
 *   • QUIET HOURS, as for the standup. Out of hours nothing is sent and nothing is
 *     claimed — the reply is still on their request and in their email.
 *   • ONE ALERT PER PERSON PER REQUEST PER 10 MINUTES, and at most 10 an hour per
 *     person. A back-and-forth must not buzz a phone for every line.
 *   • A client's opt-out is their phone's: turning notifications off for the app, or
 *     signing out, unregisters the device, and no device means no alert.
 *
 * Best-effort and never throws: a reply must not fail because a phone could not be
 * reached.
 */
export async function notifyClientMentionsOnRequest(args: {
  wikiId: string;
  itemId: string;
  /** Who wrote the reply, as the client sees it in the thread. */
  authorName: string;
  /** The author's wiki user id when the author is a client — never rung. */
  authorWikiUserId: string | null;
  body: string;
  mentions: readonly StoredMention[];
  now?: Date;
}): Promise<ClientMentionPushResult> {
  const result: ClientMentionPushResult = { status: "no_recipients", devices: 0, throttled: 0 };
  try {
    const named = clientMentionRecipients(args.mentions, args.authorWikiUserId);
    if (named.length === 0) return result;
    if (!isApnsConfigured()) return { ...result, status: "apns_unconfigured" };
    const now = args.now ?? new Date();
    if (!isWithinClientPushHours(now)) return { ...result, status: "quiet_hours" };

    // Only people who really are client users of THIS wiki.
    const users = await prisma.clientWikiUser.findMany({
      where: { wikiId: args.wikiId, id: { in: named } },
      select: { id: true },
    });
    if (users.length === 0) return result;

    const copy = mentionPushCopy(args.authorName, args.body);
    const hourAgo = new Date(now.getTime() - 60 * 60_000);
    let devices = 0;
    let throttled = 0;

    for (const { id: userId } of users) {
      const recent = await prisma.clientPushReceipt.count({
        where: { wikiId: args.wikiId, key: { startsWith: `mention:${userId}:` }, sentAt: { gte: hourAgo } },
      });
      if (recent >= MENTION_PUSH_HOURLY_CAP) {
        throttled += 1;
        continue;
      }
      const key = mentionReceiptKey(userId, args.itemId, now);
      try {
        // The insert is the lock, as for the standup: two replies a second apart
        // cannot both pass a check and both send.
        await prisma.clientPushReceipt.create({ data: { wikiId: args.wikiId, key, sentAt: now } });
      } catch {
        throttled += 1;
        continue;
      }

      const own = await listActiveClientDevicesForUser(args.wikiId, userId);
      if (own.length === 0) continue;

      const payload: ApnsPayload = {
        aps: {
          alert: { title: fitTitle(copy.title), body: copy.body },
          sound: "default",
          // Replies on one request collapse together rather than stacking.
          "thread-id": `request:${args.itemId}`,
        },
        // ⚠️ A SECTION and the request id, never a staff `path`: a client build has
        // no Foundry session and cannot act on an `/app/...` link.
        kind: "client-mention",
        section: "intake",
        requestId: args.itemId,
      };
      const sent = await fanOutToDevices(
        own.map((d) => ({ id: d.id, token: d.token, environment: d.environment, ownerId: d.clientWikiUserId })),
        clientDeviceStore,
        shrinkToFit(payload),
        key,
      );
      devices += sent.sent;
      await prisma.clientPushReceipt
        .updateMany({ where: { wikiId: args.wikiId, key }, data: { deviceCount: sent.sent } })
        .catch(() => {});
    }
    return { status: devices > 0 ? "sent" : "nothing_to_send", devices, throttled };
  } catch (err) {
    console.error("[client-push] mention notify failed", err);
    return { ...result, status: "nothing_to_send" };
  }
}
