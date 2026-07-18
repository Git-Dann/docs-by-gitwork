/**
 * imap.ts — generic IMAP (read) + SMTP (reply) mailbox connector.
 *
 * Unlike the GMAIL connector (workspace service account + domain-wide delegation, which only
 * reaches gitwork.co.uk mailboxes), this connects ANY mailbox with per-connection credentials
 * — no client Google admin, no domain-wide delegation. The operator pastes host + username +
 * app password; Care reads over IMAP and replies over SMTP *as that address*.
 *
 * Only viable on a long-running host (the Fasthosts VPS) — IMAP needs a live socket, which the
 * serverless runtime couldn't hold.
 *
 * Read path rides the shared ingest core via `fetchItems` (upsert + dedup + lastSyncedAt live
 * in `runChannelSync`). We deliberately return NO configPatch so the core never rewrites
 * scraperConfig — that keeps the encrypted password encrypted at rest. Incremental fetch is by
 * IMAP `SINCE` (day-granular) with a 2-day overlap; the core dedups messages by Message-ID.
 */

import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import nodemailer from "nodemailer";
import type {
  ChannelAdapter,
  ChannelFetchResult,
  RawConversationItem,
  RawMessageItem,
  SyncContext,
  FilterReasons,
} from "./types";

export interface ImapConnectionConfig {
  imapHost?: string;
  imapPort?: number;
  imapSecure?: boolean;
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  username?: string;
  password?: string;
  fromName?: string;
  fromAddress?: string;
  folder?: string;
}

const MAX_MESSAGES_PER_RUN = 300;

/** First id in a References/In-Reply-To chain → the thread root; else the message's own id. */
function threadKeyFor(
  messageId: string | undefined,
  inReplyTo: string | undefined,
  references: string | string[] | undefined,
): string {
  const refs = Array.isArray(references) ? references : references ? [references] : [];
  const root = refs[0] ?? inReplyTo ?? messageId ?? "";
  return root.trim() || messageId || `imap:${Date.now()}`;
}

function firstAddress(text: string | undefined): string {
  if (!text) return "";
  // "Name <email>" or "email" — a lightweight extraction, no address parsing needed here.
  const match = text.match(/<([^>]+)>/);
  return (match ? match[1] : text).trim().toLowerCase();
}

export async function fetchImapItems(ctx: SyncContext): Promise<ChannelFetchResult> {
  const cfg = (ctx.connection.scraperConfig ?? {}) as ImapConnectionConfig;
  const reasons: FilterReasons = { empty: 0, duplicate: 0 };
  const errors: string[] = [];
  const hints: string[] = [];

  if (!cfg.imapHost || !cfg.username || !cfg.password) {
    return {
      items: [],
      diagnostics: {
        fetched: 0,
        filterReasons: reasons,
        hints: [],
        errors: ["IMAP not configured — set host, username and app password on this connector."],
      },
    };
  }

  const ownAddress = (cfg.fromAddress ?? cfg.username).toLowerCase();
  const folder = cfg.folder?.trim() || "INBOX";

  // Incremental: SINCE is day-granular, so subtract 2 days and let the core dedup by Message-ID.
  const since = ctx.connection.lastSyncedAt
    ? new Date(ctx.connection.lastSyncedAt.getTime() - 2 * 24 * 3600 * 1000)
    : new Date(Date.now() - 30 * 24 * 3600 * 1000);

  const client = new ImapFlow({
    host: cfg.imapHost,
    port: cfg.imapPort ?? 993,
    secure: cfg.imapSecure ?? true,
    auth: { user: cfg.username, pass: cfg.password },
    logger: false,
  });

  const byThread = new Map<string, RawConversationItem>();
  let fetched = 0;

  try {
    await client.connect();
    const lock = await client.getMailboxLock(folder);
    try {
      const uids = (await client.search({ since }, { uid: true })) || [];
      // Newest N only, so a huge mailbox can't blow the run; older mail backfills over runs.
      const slice = uids.slice(-MAX_MESSAGES_PER_RUN);

      if (slice.length > 0) {
        // `source: true` uses BODY.PEEK[] — reading never sets the \Seen flag (leaves the
        // client's inbox exactly as we found it).
        for await (const msg of client.fetch(slice, { source: true, uid: true }, { uid: true })) {
          fetched++;
          try {
            const parsed = await simpleParser(msg.source as Buffer);
            const body = (parsed.text ?? parsed.html ?? "").toString().trim();
            const subject = parsed.subject?.trim() || "(no subject)";
            if (!body && subject === "(no subject)") {
              reasons.empty = (reasons.empty ?? 0) + 1;
              continue;
            }

            const messageId = parsed.messageId ?? `imap:${msg.uid}`;
            const references = parsed.references;
            const key = threadKeyFor(messageId, parsed.inReplyTo, references);
            const fromText = parsed.from?.text ?? "unknown";
            const fromAddr = firstAddress(fromText);
            const receivedAt = parsed.date ?? new Date();
            const isOutbound = fromAddr === ownAddress;

            const message: RawMessageItem = {
              externalId: messageId,
              direction: isOutbound ? "outbound" : "inbound",
              authorLabel: fromText.replace(/<[^>]+>/g, "").trim() || fromText,
              body: (body || subject).slice(0, 8000),
              createdAt: receivedAt,
            };

            const existing = byThread.get(key);
            if (existing) {
              existing.messages.push(message);
              if (receivedAt > existing.receivedAt) {
                existing.receivedAt = receivedAt;
                existing.preview = body.slice(0, 150);
              }
            } else {
              byThread.set(key, {
                externalId: key,
                customerLabel: fromText,
                subject: subject.replace(/^(re|fwd?):\s*/i, "").trim() || subject,
                preview: body.slice(0, 150),
                receivedAt,
                tags: ["email"],
                messages: [message],
              });
            }
          } catch (err) {
            errors.push(`Parse failed for one message: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      }
    } finally {
      lock.release();
    }
    await client.logout();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Common, actionable failure: auth rejected (usually app-password / IMAP-disabled).
    if (/auth|login|credential|invalid/i.test(msg)) {
      hints.push(
        "IMAP login failed — check the username and app password, and that IMAP + app passwords are enabled on the mailbox.",
      );
    }
    try { await client.logout(); } catch { /* already down */ }
    return { items: [], diagnostics: { fetched: 0, filterReasons: reasons, hints, errors: [`IMAP: ${msg}`] } };
  }

  // Order messages oldest→newest within each thread.
  const items = [...byThread.values()].map((item) => ({
    ...item,
    messages: item.messages.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
  }));

  return { items, diagnostics: { fetched, filterReasons: reasons, hints, errors } };
  // NOTE: no configPatch — keeps the core from rewriting (and thus plaintext-persisting) the
  // encrypted scraperConfig. Incrementality is handled by lastSyncedAt + Message-ID dedup.
}

/** Send a reply over SMTP, threaded onto the original message. */
export async function sendImapReply(ctx: SyncContext, externalId: string, body: string): Promise<void> {
  const cfg = (ctx.connection.scraperConfig ?? {}) as ImapConnectionConfig;
  if (!cfg.smtpHost || !cfg.username || !cfg.password) {
    throw new Error("SMTP not configured on this connector (host / username / password).");
  }

  // Resolve the recipient + subject from the conversation this externalId belongs to.
  const { prisma } = await import("@/lib/prisma");
  const conv = await prisma.supportConversation.findFirst({
    where: { clientId: ctx.client.id, source: "IMAP", externalId },
    select: { subject: true, customerLabel: true },
  });
  if (!conv) throw new Error("Conversation not found for this reply.");
  const to = conv.customerLabel?.trim();
  if (!to) throw new Error("Could not resolve a recipient for this conversation.");

  const fromAddress = cfg.fromAddress ?? cfg.username;
  const from = cfg.fromName ? `${cfg.fromName} <${fromAddress}>` : fromAddress;
  const subject = conv.subject.toLowerCase().startsWith("re:") ? conv.subject : `Re: ${conv.subject}`;

  const transport = nodemailer.createTransport({
    host: cfg.smtpHost,
    port: cfg.smtpPort ?? 465,
    secure: cfg.smtpSecure ?? (cfg.smtpPort ?? 465) === 465,
    auth: { user: cfg.username, pass: cfg.password },
  });

  await transport.sendMail({
    from,
    to,
    subject,
    text: body,
    // Thread the reply onto the conversation root so it lands in the same client-side thread.
    inReplyTo: externalId,
    references: externalId,
  });
}

export const imapAdapter: ChannelAdapter = {
  key: "IMAP",
  fetchItems: fetchImapItems,
  sendReply: sendImapReply,
};
