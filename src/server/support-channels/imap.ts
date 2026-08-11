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
 * in `runChannelSync`). Incremental fetch is by IMAP `SINCE` (day-granular) with a 2-day overlap;
 * the core dedups messages by Message-ID.
 *
 * This adapter needs no cursor of its own: how far back to read Sent is derived from the data
 * (see resolveScanWindows + oldestUnansweredInboundAt), not stored. Emitting a `configPatch` is
 * now safe if a future need arises — the core re-encrypts on write — but not needing one is
 * better still.
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
  /** Override the Sent mailbox. Leave unset — it is auto-discovered by its \Sent special-use flag. */
  sentFolder?: string;
  /** Set false to stop reading Sent (replies made outside Care then stay invisible to Care). */
  readSentFolder?: boolean;
  /** How far back the FIRST sync reaches (days). Default 30. Also used by "Re-sync history". */
  lookbackDays?: number;
  /**
   * One-off deep catch-up for the Sent folder, in days.
   *
   * Steady state, Sent rides the same incremental window as the inbox — cheap, and enough to
   * catch a reply typed minutes ago. But that window is `lastSyncedAt − 2 days`, so on a mailbox
   * that has been syncing all along it reaches back exactly two days — while the replies that
   * left threads wrongly marked "awaiting" may be weeks or months old. Reading Sent then finds
   * nothing and the queue stays wrong, which looks identical to the feature not working.
   *
   * Set this once (e.g. 90) to reconcile that history, then clear it. Cost is bounded either
   * way: the scan keeps only the newest SENT_MESSAGES_PER_RUN uids, and anything already stored
   * is dropped by Message-ID dedup.
   */
  sentBackfillDays?: number;
}

const MAX_MESSAGES_PER_RUN = 300;
/**
 * Sent is capped lower than the inbox. It is a reconciliation read, not the source of new
 * conversations, and each message still costs a full BODY.PEEK[] fetch + MIME parse.
 */
const SENT_MESSAGES_PER_RUN = 150;
const DEFAULT_LOOKBACK_DAYS = 30;
/**
 * Ceiling on the automatic Sent catch-up. Fetch volume is already bounded by
 * SENT_MESSAGES_PER_RUN; this bounds the IMAP SINCE *search* so a single ancient unanswered thread
 * can't make every run scan years of mail.
 */
const SENT_AUTO_BACKFILL_MAX_DAYS = 180;
const DAY_MS = 24 * 3600 * 1000;

/**
 * The IMAP `SINCE` floor for each mailbox.
 *
 * Pure so the windows can be reasoned about in tests — getting this wrong is silent: the sync
 * succeeds, reports no errors, and simply never sees the mail it was supposed to reconcile.
 */
export function resolveScanWindows(
  cfg: Pick<ImapConnectionConfig, "lookbackDays" | "sentBackfillDays">,
  lastSyncedAt: Date | null | undefined,
  now: Date = new Date(),
  /**
   * Oldest customer message still believed unanswered for this client (see
   * oldestUnansweredInboundAt). Null when nothing is waiting.
   */
  oldestUnansweredAt: Date | null = null,
): { inboxSince: Date; sentSince: Date } {
  const lookbackDays = cfg.lookbackDays && cfg.lookbackDays > 0 ? cfg.lookbackDays : DEFAULT_LOOKBACK_DAYS;
  // Incremental with a 2-day overlap (SINCE is day-granular); full lookback on a first sync or
  // after "Re-sync history", which nulls lastSyncedAt.
  const inboxSince = lastSyncedAt
    ? new Date(lastSyncedAt.getTime() - 2 * DAY_MS)
    : new Date(now.getTime() - lookbackDays * DAY_MS);

  // An explicit backfill wins outright — it ignores lastSyncedAt, which is its whole point.
  if (cfg.sentBackfillDays && cfg.sentBackfillDays > 0) {
    return { inboxSince, sentSince: new Date(now.getTime() - cfg.sentBackfillDays * DAY_MS) };
  }

  /**
   * Otherwise the data decides. Reading Sent exists to answer one question — "were these threads
   * actually replied to?" — so the window only has to reach the OLDEST thread we still believe is
   * unanswered. Nothing older can be affected, and nothing newer is enough: a mailbox that syncs
   * hourly has an incremental window of ~2 days, so replies sent weeks ago stay invisible and the
   * queue stays wrong. That is how 226 Fellas threads sat "awaiting" while every one had an answer.
   *
   * Self-limiting by construction: as threads flip to Replied they leave the set, the window
   * narrows on its own, and steady state returns to the cheap incremental read. No flag to set and
   * — more importantly — no flag to remember to clear.
   */
  const floor = new Date(now.getTime() - SENT_AUTO_BACKFILL_MAX_DAYS * DAY_MS);
  const candidate =
    oldestUnansweredAt && oldestUnansweredAt < inboxSince ? oldestUnansweredAt : inboxSince;
  // Only ever widen, never narrow, and never past the cap — one ancient unanswered thread must not
  // turn every run into a two-year IMAP search.
  const sentSince = candidate < floor ? floor : candidate;

  return { inboxSince, sentSince };
}

/**
 * Locate the Sent mailbox.
 *
 * Its name is not standardised — "Sent", "Sent Items", "[Gmail]/Sent Mail", "INBOX.Sent" — and
 * it is localised on many hosts, so guessing by name fails silently on exactly the mailboxes we
 * care about. RFC 6154 gives every modern server a `\Sent` special-use flag; that is what we
 * match, falling back to a name only if the server advertises no flag.
 */
async function findSentMailbox(
  client: ImapFlow,
  override?: string,
): Promise<string | null> {
  if (override?.trim()) return override.trim();
  try {
    const boxes = await client.list();
    const flagged = boxes.find((b) => b.specialUse === "\\Sent");
    if (flagged) return flagged.path;
    const named = boxes.find((b) => /^(sent|sent items|sent mail)$/i.test(b.name));
    return named ? named.path : null;
  } catch {
    return null;
  }
}

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

/** mailparser types `to` as one address object OR an array of them; flatten to a display string. */
function addressText(field: { text?: string } | Array<{ text?: string }> | undefined): string {
  if (!field) return "";
  const parts = Array.isArray(field) ? field : [field];
  return parts.map((p) => p.text ?? "").filter(Boolean).join(", ").trim();
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

  // How far back Sent must reach is a question about the data, not the config: the oldest thread we
  // still believe is unanswered. Imported dynamically (as sendImapReply does for prisma) to keep
  // this adapter out of support.ts's import chain at load time. Never fail the sync over it — a
  // failure here just means the Sent read falls back to the incremental window.
  let oldestUnansweredAt: Date | null = null;
  try {
    const { oldestUnansweredInboundAt } = await import("@/server/support");
    oldestUnansweredAt = await oldestUnansweredInboundAt(ctx.client.id);
  } catch {
    /* fall back to the incremental window */
  }

  const { inboxSince, sentSince } = resolveScanWindows(
    cfg,
    ctx.connection.lastSyncedAt,
    new Date(),
    oldestUnansweredAt,
  );

  const client = new ImapFlow({
    host: cfg.imapHost,
    port: cfg.imapPort ?? 993,
    secure: cfg.imapSecure ?? true,
    auth: { user: cfg.username, pass: cfg.password },
    logger: false,
  });

  const byThread = new Map<string, RawConversationItem>();
  let fetched = 0;

  /**
   * Scan one mailbox into `byThread`.
   *
   * `forceOutbound` is set for the Sent mailbox: a message sitting in Sent is ours by virtue of
   * WHERE IT IS, which is strictly more reliable than comparing the From address — a mailbox
   * that sends from an alias (support@ vs app@) would otherwise have its own replies classified
   * inbound, marking the thread unread and leaving it in the awaiting-reply queue forever. That
   * is a false positive in the one direction this work exists to eliminate.
   */
  async function scanMailbox(mailbox: string, forceOutbound: boolean): Promise<void> {
    const since = forceOutbound ? sentSince : inboxSince;
    const cap = forceOutbound ? SENT_MESSAGES_PER_RUN : MAX_MESSAGES_PER_RUN;
    const lock = await client.getMailboxLock(mailbox);
    try {
      const uids = (await client.search({ since }, { uid: true })) || [];
      // Newest N only, so a huge mailbox can't blow the run; older mail backfills over runs.
      const slice = uids.slice(-cap);
      if (slice.length === 0) return;

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

          const messageId = parsed.messageId ?? `imap:${mailbox}:${msg.uid}`;
          const references = parsed.references;
          const key = threadKeyFor(messageId, parsed.inReplyTo, references);
          const fromText = parsed.from?.text ?? "unknown";
          const receivedAt = parsed.date ?? new Date();
          const isOutbound = forceOutbound || firstAddress(fromText) === ownAddress;

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
            // A thread first seen in Sent is labelled with the recipient; if the customer's own
            // message turns up later, prefer their real From line.
            if (!isOutbound && firstAddress(existing.customerLabel) === ownAddress) {
              existing.customerLabel = fromText;
            }
          } else {
            byThread.set(key, {
              externalId: key,
              // For an outbound message WE are the sender, so the counterparty is the recipient.
              // Labelling a Sent-discovered thread with our own address would show the operator
              // as the customer on their own board.
              customerLabel: isOutbound ? (addressText(parsed.to) || fromText) : fromText,
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
    } finally {
      lock.release();
    }
  }

  try {
    await client.connect();

    await scanMailbox(folder, false);

    // ── Sent ──────────────────────────────────────────────────────────────────
    // Without this, a reply typed in Apple Mail / Outlook / the webmail UI is invisible to
    // Care, so the thread reads "awaiting reply" forever and the board cannot be trusted as
    // the source of truth. Reading Sent is what closes the "sometimes we just go straight to
    // the email" gap: however the reply was sent, Care sees it and marks the thread Replied.
    // Message-ID dedup and References threading already merge it onto the right conversation.
    if (cfg.readSentFolder !== false) {
      const sentBox = await findSentMailbox(client, cfg.sentFolder);
      if (sentBox && sentBox !== folder) {
        try {
          await scanMailbox(sentBox, true);
        } catch (err) {
          // Never fail the whole sync over Sent — the inbox read is the critical half.
          errors.push(`Sent folder "${sentBox}" unreadable: ${err instanceof Error ? err.message : String(err)}`);
        }
      } else if (!sentBox) {
        hints.push(
          "No Sent mailbox found, so replies sent outside Care won't be detected and those threads will keep showing as awaiting reply. Set 'sentFolder' on this connector to its exact name.",
        );
      }
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
  // No configPatch needed: incrementality is lastSyncedAt + Message-ID dedup, and the Sent window
  // is derived from the data rather than a stored cursor.
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
