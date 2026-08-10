/**
 * support-reply-state.ts — is the customer waiting on us?
 *
 * PURE. No Prisma, no I/O, no framework — so it is unit-testable and can be imported by the
 * server, the API serializers and (via the DTO) trusted by every client.
 *
 * ── Why this is derived and not a stored flag ────────────────────────────────────────────
 * Care's job is to be the source of truth for "has this been answered?". A stored
 * `repliedAt` / `isReplied` column can only be right if every reply passes through Care —
 * and they demonstrably do not: people reply from Gmail, from a mail client, from their
 * phone. A flag nobody updated reads exactly like a conversation nobody answered, which is
 * the failure that made the board untrustworthy.
 *
 * So we store only FACTS the connectors can observe (`lastInboundAt` / `lastOutboundAt`) and
 * derive the judgement here. The moment a sync sees an outbound message — wherever it was
 * sent from — the state flips on its own. Nothing to mark, nothing to drift.
 *
 * This mirrors the call made for Docs cover contents (CLAUDE.md §41.6): derive what describes
 * current state, snapshot only what records a moment.
 */

/** What the conversation is waiting on. Derived — never persisted. */
export type ReplyState =
  /** The customer spoke last. WE OWE THEM A REPLY. */
  | "awaiting_reply"
  /** We spoke last (in Care or outside it). Ball is in their court. */
  | "replied"
  /** No customer message captured at all (empty thread, or one we started). Nothing owed. */
  | "no_inbound";

export interface ReplyActivity {
  lastInboundAt?: Date | string | null;
  lastOutboundAt?: Date | string | null;
}

function toMs(v: Date | string | null | undefined): number | null {
  if (!v) return null;
  const ms = v instanceof Date ? v.getTime() : new Date(v).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/**
 * The one place "has this been replied to?" is decided.
 *
 * ⚠️ `replied` requires the outbound message to be STRICTLY newer than the inbound one. On an
 * exact tie we return `awaiting_reply`, deliberately: the two errors are not symmetric. A false
 * "replied" hides a customer who is actually waiting — the exact failure this module exists to
 * prevent — while a false "awaiting" costs someone a glance at a thread. Ties are vanishingly
 * rare in real mail; when one happens, fail toward being seen.
 */
export function deriveReplyState(activity: ReplyActivity): ReplyState {
  const inbound = toMs(activity.lastInboundAt);
  const outbound = toMs(activity.lastOutboundAt);

  // No customer message → nothing is owed, whatever we may have sent.
  if (inbound === null) return "no_inbound";
  if (outbound === null) return "awaiting_reply";
  return outbound > inbound ? "replied" : "awaiting_reply";
}

/**
 * How long the customer has been waiting, in ms — the number that makes a triage board
 * trustworthy ("waiting 3 days" is actionable; "received 3 days ago" is not, because it says
 * nothing about whether anyone answered).
 *
 * Null unless the state is `awaiting_reply` — there is no waiting time when nobody is waiting.
 * Clamped at 0 so a clock skew between the mail host and this server can never render a
 * negative age.
 */
export function waitingMs(activity: ReplyActivity, now: Date = new Date()): number | null {
  if (deriveReplyState(activity) !== "awaiting_reply") return null;
  const inbound = toMs(activity.lastInboundAt);
  if (inbound === null) return null;
  return Math.max(0, now.getTime() - inbound);
}

/**
 * Fold a batch of freshly-ingested messages into a conversation's activity stamps.
 *
 * Returns only the fields that actually move forward, so a re-sync of already-seen mail is a
 * no-op write, and an out-of-order fetch (IMAP reads INBOX and Sent separately, and a backfill
 * can surface older mail than the newest row) can never drag a timestamp backwards.
 *
 * `sawInbound` is what the caller should gate `unread` on. Marking a thread unread because our
 * OWN reply synced back is why Care's unread counters only ever grew.
 */
export function foldMessageActivity(
  messages: Array<{ direction: string; createdAt: Date }>,
  current: { lastInboundAt?: Date | null; lastOutboundAt?: Date | null } = {},
): {
  lastInboundAt?: Date;
  lastOutboundAt?: Date;
  lastMessageAt?: Date;
  sawInbound: boolean;
} {
  let inbound = current.lastInboundAt ?? null;
  let outbound = current.lastOutboundAt ?? null;
  let sawInbound = false;

  for (const m of messages) {
    if (m.direction === "outbound") {
      if (!outbound || m.createdAt > outbound) outbound = m.createdAt;
    } else {
      sawInbound = true;
      if (!inbound || m.createdAt > inbound) inbound = m.createdAt;
    }
  }

  const patch: { lastInboundAt?: Date; lastOutboundAt?: Date; lastMessageAt?: Date; sawInbound: boolean } = {
    sawInbound,
  };
  if (inbound && inbound !== current.lastInboundAt) patch.lastInboundAt = inbound;
  if (outbound && outbound !== current.lastOutboundAt) patch.lastOutboundAt = outbound;

  const latest = [inbound, outbound].filter((d): d is Date => d instanceof Date).sort((a, b) => b.getTime() - a.getTime())[0];
  if (latest) patch.lastMessageAt = latest;

  return patch;
}
