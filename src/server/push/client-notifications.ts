/**
 * client-notifications.ts — what a client's phone is allowed to be told, and when.
 *
 * Today that is one thing: the developers' daily standup. The Slack half of this
 * already works — `tasks-standup.ts` posts each dev's card to the client's Slack
 * Connect channel when one is linked — so this is for the clients who live in the
 * app instead of in a shared channel.
 */

import { prisma } from "@/lib/prisma";
import { isApnsConfigured, type ApnsPayload } from "./apns";
import { clientDeviceStore, listActiveClientDevices } from "./client-devices";
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
