import {
  EnvelopeIcon,
  ChatBubbleLeftRightIcon,
  BoltIcon,
  StarIcon,
  ArrowUpTrayIcon,
  ChartBarIcon,
  KeyIcon,
} from "@heroicons/react/24/outline";
import { cn } from "@/lib/format";
import type {
  SupportSource,
  ConversationStatus,
  ConversationPriority,
  Conversation,
  ConversationViewCounts,
  ReplyState,
} from "@/types/support";
import type { ConversationListParams } from "@/lib/api";

/**
 * The one Care source icon.
 *
 * ⚠️ `imap` used to be missing here and fell through to the default bolt — so every Fellas row,
 * whose mailbox is connected over IMAP, showed a lightning bolt where it meant an envelope. The
 * bug survived because a SECOND `SourceIcon` lived in `care-shared.tsx` that DID handle `imap`,
 * so whichever screen you looked at decided whether the icon was right. There is one now.
 */
export function SourceIcon({ source, className }: { source: SupportSource; className?: string }) {
  const cls = cn("h-4 w-4", className);
  switch (source) {
    case "gmail":
    case "imap":
      return <EnvelopeIcon className={cls} />;
    case "reddit":
    case "instagram":
    case "discord":
      return <ChatBubbleLeftRightIcon className={cls} />;
    case "youtube":
      return <BoltIcon className={cls} />;
    case "stripe":
      return <KeyIcon className={cls} />;
    case "analytics":
      return <ChartBarIcon className={cls} />;
    case "app_reviews":
      return <StarIcon className={cls} />;
    case "webhook":
      return <ArrowUpTrayIcon className={cls} />;
    default:
      return <BoltIcon className={cls} />;
  }
}

export const SOURCE_LABEL: Record<SupportSource, string> = {
  gmail: "Gmail",
  imap: "Email",
  reddit: "Reddit",
  instagram: "Instagram",
  youtube: "YouTube",
  discord: "Discord",
  stripe: "Stripe",
  analytics: "Analytics API",
  app_reviews: "App Reviews",
  webhook: "Webhook",
};

export const STATUS_LABEL: Record<ConversationStatus, string> = {
  new: "New",
  open: "Open",
  snoozed: "Snoozed",
  closed: "Closed",
  ignored: "Ignored",
};


export const PRIORITY_LABEL: Record<ConversationPriority, string> = {
  urgent: "Urgent",
  high: "High",
  normal: "Normal",
  low: "Low",
};




// ─── Reply state ──────────────────────────────────────────────────────────────
// Derived server-side (src/server/support-reply-state.ts) — the UI only presents it.
// Deliberately louder than `status`: whether a customer is waiting on us is the single most
// important fact on the board, and it used to be invisible.

export const REPLY_STATE_LABEL: Record<ReplyState, string> = {
  awaiting_reply: "Needs reply",
  replied: "Replied",
  // Only reachable for a thread WE started (or one reconstructed from the Sent folder). A
  // conversation with no captured message rows is stamped from its arrival time instead, so
  // this no longer lands on threads that plainly have customer content — see
  // backfillConversationActivity.
  no_inbound: "Sent by us",
};

/**
 * Row state is a mono READOUT, not a pill.
 *
 * The list previously stacked a reply chip, a status chip, a priority dot and a sentiment dot on
 * every row — four bordered/filled objects competing at the same visual weight, on rows where
 * two of them ("New", neutral sentiment) were the default and therefore said nothing. Colour on
 * uppercase mono is the house data-label voice (DESIGN.md {typography.data-label}), reads as an
 * instrument readout rather than decoration, and lets the state carry real colour because
 * nothing around it is competing for attention.
 */
export const REPLY_STATE_READOUT: Record<ReplyState, string> = {
  // Amber, never red: "someone must answer this" is not the same alarm as "urgent", and priority
  // owns red. A board where everything is red communicates nothing.
  awaiting_reply: "text-amber-600",
  replied: "text-emerald-600",
  no_inbound: "text-[var(--text-4)]",
};

export const REPLY_STATE_DOT: Record<ReplyState, string> = {
  awaiting_reply: "bg-amber-500",
  replied: "bg-emerald-500",
  no_inbound: "bg-[var(--border-1)]",
};

/** How long the customer has been waiting, or null when nobody is. */
export function waitingSince(c: Conversation): string | null {
  return c.replyState === "awaiting_reply" && c.lastInboundAt ? c.lastInboundAt : null;
}

/** Latest activity either way — the timestamp the list is ordered and aged by. */
export function lastActivityAt(c: Conversation): string {
  return c.lastMessageAt ?? c.receivedAt;
}

/**
 * A saved view is a SERVER query, not a client-side predicate.
 *
 * It used to be a predicate over whatever page had been fetched, which meant every view was
 * silently "…among the 100 most recent conversations" — so an old unanswered thread could sit
 * outside the page and the queue would look empty when it wasn't. Pushing the filter into SQL
 * is what makes a 50-row page safe: the page is 50 rows *of the view*, and "Load more" walks
 * the rest.
 *
 * `counts` names the field on ConversationViewCounts that badges this view, so the number in
 * the rail is a true total rather than a tally of loaded rows.
 */
export interface SavedView {
  id: string;
  label: string;
  params: ConversationListParams;
  /** Which field on ConversationViewCounts badges this view. Only the numeric ones qualify. */
  counts: keyof Omit<ConversationViewCounts, "oldestAwaitingAt" | "sources">;
}

const ACTIVE = ["new", "open"];

export const SAVED_VIEWS: SavedView[] = [
  // The default, and the only queue that answers "has this been dealt with?".
  //
  // ⚠️ Opens NEWEST first, not longest-waiting first. That was the original call and it was wrong
  // on real data: a client whose whole backlog is two months old shows a wall of identical `2mo`
  // rows, and the mail that arrived this morning — the only thing anyone can still respond to
  // usefully — is at the bottom of it. The longest wait is still stated, in the client header's
  // `LONGEST 2mo` readout, and the WAITING column header flips the order in one click. So the
  // readout tells you the worst wait while the list shows you what is new.
  {
    id: "awaiting-reply",
    label: "Awaiting reply",
    params: { status: ACTIVE, replyState: "awaiting_reply" },
    counts: "awaiting",
  },
  { id: "replied", label: "Replied", params: { status: ACTIVE, replyState: "replied" }, counts: "replied" },
  { id: "assigned-me", label: "Assigned to me", params: { status: ACTIVE, assigneeId: "me" }, counts: "assignedMe" },
  {
    id: "unassigned",
    label: "Unassigned",
    // Unassigned means unowned WORK: a thread nobody owns but that has already been answered is
    // not sitting on anyone's desk, so it does not belong in this queue. Newest first for the same
    // reason as the awaiting queue above.
    params: { status: ACTIVE, replyState: "awaiting_reply", unassigned: true },
    counts: "unassigned",
  },
  { id: "urgent", label: "Urgent", params: { status: ACTIVE, priority: "urgent" }, counts: "urgent" },
  { id: "open", label: "All open", params: { status: ACTIVE }, counts: "open" },
  { id: "snoozed", label: "Snoozed", params: { status: "snoozed" }, counts: "snoozed" },
  { id: "closed", label: "Closed", params: { status: ["closed", "ignored"] }, counts: "closed" },
  { id: "all", label: "All", params: {}, counts: "all" },
];

export const DEFAULT_VIEW_ID = "awaiting-reply";

/**
 * The rail splits into QUEUES (work to pick up) and EVERYTHING ELSE (browsing). Without the
 * break, "Awaiting reply" and "Closed" sat in one undifferentiated list of nine, which is what
 * made the rail read as a filter dropdown rather than a place to start the day.
 */
export const VIEW_GROUPS: Array<{ label: string; ids: string[] }> = [
  { label: "Queues", ids: ["awaiting-reply", "unassigned", "assigned-me", "urgent"] },
  { label: "Browse", ids: ["replied", "open", "snoozed", "closed", "all"] },
];

/**
 * What the row's state slot should say. Status WINS over reply state when it is snoozed or
 * closed, because a snoozed thread is not in anyone's queue no matter who spoke last — showing
 * both was the double-chip problem. Everything else reads its reply state.
 */
export function rowState(c: Conversation): { label: string; tone: string; since?: string } {
  if (c.status === "snoozed") return { label: "Snoozed", tone: "text-[var(--text-3)]" };
  if (c.status === "closed") return { label: "Closed", tone: "text-[var(--text-4)]" };
  if (c.status === "ignored") return { label: "Ignored", tone: "text-[var(--text-4)]" };
  return {
    label: REPLY_STATE_LABEL[c.replyState],
    tone: REPLY_STATE_READOUT[c.replyState],
    since:
      c.replyState === "awaiting_reply"
        ? (c.lastInboundAt ?? undefined)
        : c.replyState === "replied"
          ? (c.lastOutboundAt ?? undefined)
          : undefined,
  };
}

/** Initials for the assignee marker — two letters max, so the column stays a fixed width. */
export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

/*
 * A wait longer than this reads as a problem rather than a queue. Not an SLA — Care has no
 * per-client SLA config — just the point at which the chip stops being informational and starts
 * being a flag.
 *
 * ⚠️ Declared in `src/lib/care-alerts.ts` and re-exported here. The alert that fires on it runs
 * on the jobs worker, and this file imports Heroicons and JSX, so reaching for the threshold
 * from there would pull React into a cron path. Re-exporting keeps every existing caller
 * unchanged and keeps the number in one place — two copies of a threshold is how a screen and
 * an alert come to disagree about what "too long" means.
 */
export { LONG_WAIT_HOURS, isLongWait } from "@/lib/care-alerts";


export { formatAge, formatWhen } from "@/lib/care-alerts";
