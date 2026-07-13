// Native Web Push (VAPID) — no third party. Sends browser push notifications to
// a user's registered subscriptions via the `web-push` library, so devs get
// alerted even when Foundry isn't open. Mirrors the APNs path (DeviceToken) but
// for the web app. Wired as the dispatcher's `push` channel (see notifications.ts).
//
// Dormant until VAPID keys are set in the env — isWebPushEnabled() gates every
// path, so nothing runs (and no UI prompts) on a workspace without keys.
//
// Generate a keypair once with:  npx web-push generate-vapid-keys
// then set VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY (+ optional VAPID_SUBJECT) in .env.

import webpush from "web-push";
import { prisma } from "@/lib/prisma";

const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY?.trim() ?? "";
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY?.trim() ?? "";
// The VAPID "subject" must be a mailto: or https: URL identifying the sender.
const SUBJECT = process.env.VAPID_SUBJECT?.trim() || "mailto:dan@gitwork.co.uk";

/** Push is live only when both VAPID keys are configured. */
export function isWebPushEnabled(): boolean {
  return PUBLIC_KEY.length > 0 && PRIVATE_KEY.length > 0;
}

/** The public key the browser needs to create a subscription. Empty when disabled. */
export function webPushPublicKey(): string {
  return isWebPushEnabled() ? PUBLIC_KEY : "";
}

let configured = false;
function ensureConfigured(): boolean {
  if (!isWebPushEnabled()) return false;
  if (!configured) {
    webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);
    configured = true;
  }
  return true;
}

export interface WebPushPayload {
  title: string;
  body?: string | null;
  url?: string | null;
  /** Coalesces same-topic notifications in the OS tray (we reuse the groupKey). */
  tag?: string | null;
}

/**
 * Send a push to every browser subscription a user has. Best-effort and never
 * throws — dead subscriptions (404/410 from the push service) are pruned so the
 * table self-cleans. Returns the number of successful sends.
 */
export async function sendWebPushToUser(userId: string, payload: WebPushPayload): Promise<number> {
  if (!ensureConfigured()) return 0;

  const subs = await prisma.webPushSubscription.findMany({
    where: { userId, failedAt: null },
    select: { id: true, endpoint: true, p256dh: true, auth: true },
  });
  if (subs.length === 0) return 0;

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body ?? "",
    url: payload.url ?? "/app",
    tag: payload.tag ?? undefined,
  });

  let sent = 0;
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body,
          { TTL: 60 * 60 * 24, urgency: "normal" },
        );
        sent += 1;
        await prisma.webPushSubscription.update({
          where: { id: sub.id },
          data: { lastUsedAt: new Date() },
        });
      } catch (err) {
        const statusCode = (err as { statusCode?: number })?.statusCode;
        // 404 (Not Found) / 410 (Gone) → the subscription is permanently dead.
        if (statusCode === 404 || statusCode === 410) {
          await prisma.webPushSubscription
            .update({ where: { id: sub.id }, data: { failedAt: new Date() } })
            .catch(() => undefined);
        } else {
          console.warn("[web-push] send failed", statusCode ?? (err as Error).message);
        }
      }
    }),
  );
  return sent;
}
