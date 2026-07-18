/**
 * support-reply.ts — per-source reply dispatcher for Care
 *
 * `sendReply(convId, clientId, body)` looks up the conversation source and
 * dispatches to the right channel:
 *  - DISCORD: existing bot-token helper
 *  - GMAIL:   Google service-account + gmail.send (same auth as ingest)
 *  - others:  manual — returns { sent: false, manual: true } so the UI can
 *             show a copy-to-clipboard fallback rather than silently failing
 */

import { prisma } from "@/lib/prisma";
import { google } from "googleapis";
import { sendDiscordMessage } from "./discord-sync";
import { decryptScraperConfig } from "./support";

export type ReplyResult =
  | { sent: true; manual: false }
  | { sent: false; manual: true; reason: string };

/** Sources the UI should offer a real Send button for. */
export const SENDABLE_SOURCES = new Set(["discord", "gmail", "app_reviews", "imap"]);

/** Google Play caps a developer reply at 350 characters (AndroidPublisher API). */
export const PLAY_REPLY_MAX_CHARS = 350;

export async function sendReply(
  convId: string,
  clientId: string,
  body: string,
): Promise<ReplyResult> {
  const conv = await prisma.supportConversation.findUnique({
    where: { id: convId },
    select: { source: true, externalId: true, subject: true, customerLabel: true },
  });
  if (!conv?.externalId) {
    return { sent: false, manual: true, reason: "No external ID on conversation" };
  }

  switch (conv.source) {
    case "DISCORD":     return discordReply(clientId, conv.externalId, body);
    case "GMAIL":       return gmailReply(clientId, conv.externalId, conv.subject, conv.customerLabel, body);
    case "APP_REVIEWS": return appReviewReply(clientId, conv.externalId, body);
    case "IMAP":        return imapReplyDispatch(clientId, conv.externalId, body);
    default:
      return { sent: false, manual: true, reason: `${conv.source} requires a manual reply` };
  }
}

// ─── IMAP / SMTP ───────────────────────────────────────────────────────────────

async function imapReplyDispatch(
  clientId: string,
  externalId: string,
  body: string,
): Promise<ReplyResult> {
  const conn = await prisma.accountConnection.findFirst({
    where: { clientId, source: "IMAP", health: "CONNECTED" },
    select: { id: true },
  });
  if (!conn) {
    return { sent: false, manual: true, reason: "No connected email (IMAP/SMTP) mailbox for this client" };
  }
  try {
    const { buildSyncContext } = await import("./support-sync");
    const { sendImapReply } = await import("./support-channels/imap");
    const ctx = await buildSyncContext(conn.id);
    await sendImapReply(ctx, externalId, body);
    return { sent: true, manual: false };
  } catch (err) {
    return { sent: false, manual: true, reason: `Email reply failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// ─── App reviews (Google Play reply supported; App Store needs Connect API creds) ─

async function appReviewReply(
  clientId: string,
  externalId: string,
  body: string,
): Promise<ReplyResult> {
  // App Store responses require the App Store Connect API (issuer ID + key ID + .p8
  // private key with JWT auth) — credentials we don't capture on this connector yet.
  if (externalId.startsWith("appstore:")) {
    return {
      sent: false,
      manual: true,
      reason: "App Store responses need App Store Connect API credentials (not yet configured) — reply in App Store Connect",
    };
  }

  if (!externalId.startsWith("playstore:")) {
    return { sent: false, manual: true, reason: "Unrecognised app-review id" };
  }

  // externalId = "playstore:<packageName>:<reviewId>". Package names never contain a
  // colon, but Play reviewIds do (e.g. "gp:AOqp…"), so split only on the first colon.
  const rest = externalId.slice("playstore:".length);
  const firstColon = rest.indexOf(":");
  if (firstColon === -1) {
    return { sent: false, manual: true, reason: "Malformed Play review id" };
  }
  const packageName = rest.slice(0, firstColon);
  const reviewId = rest.slice(firstColon + 1);

  const trimmed = body.trim();
  if (trimmed.length > PLAY_REPLY_MAX_CHARS) {
    return {
      sent: false,
      manual: true,
      reason: `Google Play replies are limited to ${PLAY_REPLY_MAX_CHARS} characters (yours is ${trimmed.length}).`,
    };
  }

  const conn = await prisma.accountConnection.findFirst({
    where: { clientId, source: "APP_REVIEWS", health: "CONNECTED" },
    select: { scraperConfig: true },
  });
  const cfg = decryptScraperConfig(conn?.scraperConfig as Record<string, unknown> | null) as { serviceAccountJson?: string } | null;
  if (!cfg?.serviceAccountJson) {
    return { sent: false, manual: true, reason: "Play Store service account not configured on the connector" };
  }

  try {
    const credentials = JSON.parse(cfg.serviceAccountJson) as Record<string, unknown>;
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/androidpublisher"],
    });
    const authClient = await auth.getClient();
    const publisher = google.androidpublisher({
      version: "v3",
      auth: authClient as Parameters<typeof google.androidpublisher>[0]["auth"],
    });

    await publisher.reviews.reply({
      packageName,
      reviewId,
      requestBody: { replyText: trimmed },
    });

    return { sent: true, manual: false };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { sent: false, manual: true, reason: `Play reply failed: ${msg}` };
  }
}

// ─── Discord ─────────────────────────────────────────────────────────────────

async function discordReply(
  clientId: string,
  channelId: string,
  body: string,
): Promise<ReplyResult> {
  const conn = await prisma.accountConnection.findFirst({
    where: { clientId, source: "DISCORD", health: "CONNECTED" },
    select: { scraperConfig: true },
  });
  const cfg = decryptScraperConfig(conn?.scraperConfig as Record<string, unknown> | null) as { botToken?: string } | null;
  if (!cfg?.botToken) {
    return { sent: false, manual: true, reason: "Discord bot token not configured" };
  }
  await sendDiscordMessage(channelId, cfg.botToken, body);
  return { sent: true, manual: false };
}

// ─── Gmail ───────────────────────────────────────────────────────────────────

async function gmailReply(
  clientId: string,
  threadId: string,
  subject: string,
  customerLabel: string,
  body: string,
): Promise<ReplyResult> {
  // Resolve workspace service account + impersonation email via the client relation
  const supportClient = await prisma.supportClient.findUnique({
    where: { id: clientId },
    select: {
      workspace: {
        select: { googleServiceAccountJson: true, googleSubjectEmail: true },
      },
    },
  });
  const ws = supportClient?.workspace;
  if (!ws?.googleServiceAccountJson) {
    return { sent: false, manual: true, reason: "Gmail service account not configured on workspace" };
  }

  // Check GMAIL connection for per-connection impersonation override
  const conn = await prisma.accountConnection.findFirst({
    where: { clientId, source: "GMAIL", health: "CONNECTED" },
    select: { scraperConfig: true },
  });
  const connCfg = decryptScraperConfig(conn?.scraperConfig as Record<string, unknown> | null) as { impersonateEmail?: string; intakeAddress?: string } | null;
  const fromEmail =
    connCfg?.impersonateEmail ??
    connCfg?.intakeAddress ??
    ws.googleSubjectEmail ??
    null;

  if (!fromEmail) {
    return { sent: false, manual: true, reason: "No Gmail inbox configured (set 'Inbox to read' on the connector)" };
  }

  // customerLabel for Gmail is "Name <email>" or just "email" from the From header
  const toEmail = customerLabel;

  try {
    const credentials = JSON.parse(ws.googleServiceAccountJson) as Record<string, unknown>;
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: [
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/gmail.send",
      ],
      clientOptions: { subject: fromEmail },
    });
    const gmailAuth = (await auth.getClient()) as Parameters<typeof google.gmail>[0]["auth"];
    const gmail = google.gmail({ version: "v1", auth: gmailAuth });

    const replySubject = subject.startsWith("Re:") ? subject : `Re: ${subject}`;
    const mime = [
      `From: ${fromEmail}`,
      `To: ${toEmail}`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=utf-8",
      `Subject: ${replySubject}`,
      "",
      body,
    ].join("\r\n");

    await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw: Buffer.from(mime).toString("base64url"), threadId },
    });

    return { sent: true, manual: false };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { sent: false, manual: true, reason: `Gmail send failed: ${msg}` };
  }
}
