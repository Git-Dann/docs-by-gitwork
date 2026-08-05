/**
 * Outbound webhook for client-intake changes — the other half of two-way sync.
 *
 * The intake API lets a client push requests IN and update them. This tells them
 * when something changes on OUR side (triaged, promoted to a task, closed), so
 * their tracker can follow without polling `?items=1` on a timer.
 *
 * ── Three things this gets right on purpose ─────────────────────────────────
 *
 * 1. SSRF. The destination is a URL a client supplied, so posting to it blindly
 *    would let them aim our server at our own network — cloud metadata, the
 *    Postgres container, anything on the VPS. Every delivery re-resolves the
 *    host through `assertPublicHost` (the same guard the public Pulse scanner
 *    uses), not just the URL as saved: DNS can be repointed at 127.0.0.1 after
 *    the fact, so validating only at save time is not enough.
 *
 * 2. Signed. Deliveries carry `X-Foundry-Signature: sha256=<hmac>` over the raw
 *    body, keyed by a per-client secret. Without it a receiver cannot distinguish
 *    our POST from anyone else's who learned the URL, which would make the
 *    webhook a way to inject fake status changes into a client's tracker.
 *
 * 3. Never blocks the team. Delivery is fire-and-forget with a short timeout and
 *    swallowed errors: a client's webhook endpoint being down must not make
 *    closing a request fail, or slow the UI, for a Gitwork user.
 */

import { createHmac, randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { assertPublicHost } from "@/server/pulse-lite/url-guard";
import { loggerFor } from "@/lib/logger";

const log = loggerFor("wiki-intake-webhook");

/** Short — this runs inside a user's request, and we never wait on a slow client. */
const TIMEOUT_MS = 4000;

export type IntakeWebhookEvent =
  | "request.updated"
  | "request.promoted"
  | "request.closed"
  | "request.deleted";

export interface IntakeWebhookConfig {
  url: string | null;
  /** Present only immediately after minting — never re-read for display. */
  secret: string | null;
}

/**
 * Set or clear the webhook for a client. Validates the host up front so a
 * mistake surfaces to the operator now rather than as silent delivery failures,
 * and mints a signing secret whenever the URL changes.
 */
export async function setIntakeWebhook(
  clientId: string,
  rawUrl: string | null,
): Promise<IntakeWebhookConfig> {
  if (!rawUrl?.trim()) {
    await prisma.clientWiki.update({
      where: { clientId },
      data: { intakeWebhookUrl: null, intakeWebhookSecret: null },
    });
    return { url: null, secret: null };
  }

  const url = rawUrl.trim();
  const parsed = new URL(url); // throws → caller maps to 400
  if (parsed.protocol !== "https:") {
    // Status changes name client work; http would put that on the wire in clear.
    throw Object.assign(new Error("The webhook URL must use https."), { status: 400 });
  }
  await assertPublicHost(parsed.hostname);

  const secret = randomBytes(32).toString("base64url");
  await prisma.clientWiki.update({
    where: { clientId },
    data: { intakeWebhookUrl: url, intakeWebhookSecret: secret },
  });
  return { url, secret };
}

export async function getIntakeWebhook(clientId: string): Promise<{ url: string | null; hasSecret: boolean }> {
  const wiki = await prisma.clientWiki.findUnique({
    where: { clientId },
    select: { intakeWebhookUrl: true, intakeWebhookSecret: true },
  });
  return {
    url: wiki?.intakeWebhookUrl ?? null,
    // The secret itself is never returned after minting — only whether one exists.
    hasSecret: Boolean(wiki?.intakeWebhookSecret),
  };
}

export function signWebhookBody(body: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(body, "utf8").digest("hex")}`;
}

/**
 * Deliver one change. Fire-and-forget: call WITHOUT awaiting from a request
 * handler. Resolves to whether it was delivered, for tests and logging; never
 * throws.
 */
export async function deliverIntakeWebhook(input: {
  wikiId: string;
  event: IntakeWebhookEvent;
  item: {
    id: string;
    externalRef: string | null;
    title: string;
    type: string;
    status: string;
    priority: string;
    taskId: string | null;
  };
}): Promise<boolean> {
  try {
    const wiki = await prisma.clientWiki.findUnique({
      where: { id: input.wikiId },
      select: {
        intakeWebhookUrl: true,
        intakeWebhookSecret: true,
        client: { select: { slug: true } },
      },
    });
    const url = wiki?.intakeWebhookUrl;
    const secret = wiki?.intakeWebhookSecret;
    if (!url || !secret) return false; // not configured — the normal case

    // Re-check the host on EVERY delivery, not just at save time: a hostname
    // that resolved publicly when saved can be repointed at 127.0.0.1 later.
    const parsed = new URL(url);
    await assertPublicHost(parsed.hostname);

    const body = JSON.stringify({
      event: input.event,
      client: wiki.client.slug,
      // The client's own reference first — it's what they key on their side.
      externalRef: input.item.externalRef,
      id: input.item.id,
      title: input.item.title,
      type: input.item.type,
      status: input.item.status,
      priority: input.item.priority,
      /** Set once we've turned it into work; null while it's still a request. */
      promotedToTask: Boolean(input.item.taskId),
      sentAt: new Date().toISOString(),
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Foundry-Event": input.event,
          "X-Foundry-Signature": signWebhookBody(body, secret),
          "User-Agent": "Foundry-by-Gitwork-Webhook/1",
        },
        body,
        signal: controller.signal,
        cache: "no-store",
      });
      if (!res.ok) {
        log.warn("delivery rejected", { status: res.status, event: input.event });
        return false;
      }
      return true;
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    // Includes the SSRF guard rejecting the host, a timeout, DNS failure, and a
    // dead endpoint. All are the client's problem to fix and none may surface to
    // the Gitwork user who just closed a request.
    log.warn("delivery failed", { event: input.event, error: String(err) });
    return false;
  }
}
