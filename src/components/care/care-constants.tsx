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

export function SourceIcon({ source, className }: { source: SupportSource; className?: string }) {
  const cls = cn("h-4 w-4", className);
  switch (source) {
    case "gmail":
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

export const STATUS_TONE: Record<ConversationStatus, string> = {
  new: "bg-[var(--brand-50)] text-[var(--brand-700)] border border-[var(--brand-200)]",
  open: "bg-amber-50 text-amber-700 border border-amber-200",
  snoozed: "bg-[var(--surface-2)] text-[var(--text-3)] border border-[var(--border-2)]",
  closed: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  ignored: "bg-[var(--surface-1)] text-[var(--text-4)] border border-[var(--border-2)]",
};

export const PRIORITY_LABEL: Record<ConversationPriority, string> = {
  urgent: "Urgent",
  high: "High",
  normal: "Normal",
  low: "Low",
};

export const PRIORITY_TONE: Record<ConversationPriority, string> = {
  urgent: "bg-red-50 text-red-700 border border-red-200",
  high: "bg-amber-50 text-amber-700 border border-amber-200",
  // normal vs low were both flat grey and read as identical — give normal a slate tint + border
  // so the four priorities land as a visible scale.
  normal: "bg-[var(--surface-1)] text-[var(--text-3)] border border-[var(--border-2)]",
  low: "bg-[var(--surface-1)] text-[var(--text-4)] border border-[var(--border-2)]",
};

export const PRIORITY_DOT: Record<ConversationPriority, string> = {
  urgent: "bg-red-500",
  high: "bg-amber-500",
  normal: "bg-[var(--text-4)]",
  low: "bg-[var(--border-1)]",
};

export const SENTIMENT_DOT: Record<Conversation["sentiment"], string> = {
  positive: "bg-emerald-500",
  neutral: "bg-[var(--text-4)]",
  negative: "bg-red-500",
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
  counts: keyof Omit<ConversationViewCounts, "oldestAwaitingAt">;
}

const ACTIVE = ["new", "open"];

export const SAVED_VIEWS: SavedView[] = [
  // The default, and the only queue that answers "has this been dealt with?". Sorted
  // longest-waiting first — a triage board that buries the oldest unanswered message under
  // today's noise is how things fall through.
  {
    id: "awaiting-reply",
    label: "Awaiting reply",
    params: { status: ACTIVE, replyState: "awaiting_reply", sort: "oldest_inbound" },
    counts: "awaiting",
  },
  { id: "replied", label: "Replied", params: { status: ACTIVE, replyState: "replied" }, counts: "replied" },
  { id: "assigned-me", label: "Assigned to me", params: { status: ACTIVE, assigneeId: "me" }, counts: "assignedMe" },
  {
    id: "unassigned",
    label: "Unassigned",
    // Unassigned means unowned WORK: a thread nobody owns but that has already been answered is
    // not sitting on anyone's desk, so it does not belong in this queue.
    params: { status: ACTIVE, replyState: "awaiting_reply", unassigned: true, sort: "oldest_inbound" },
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

/**
 * A wait longer than this reads as a problem rather than a queue. Not an SLA — Care has no
 * per-client SLA config — just the point at which the chip stops being informational and
 * starts being a flag.
 */
export const LONG_WAIT_HOURS = 24;

export function isLongWait(iso: string, now: number = Date.now()): boolean {
  return now - new Date(iso).getTime() >= LONG_WAIT_HOURS * 3600_000;
}

/** Compact "3h", "2d", "just now" age from an ISO timestamp. */
export function formatAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "now";
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  return `${Math.floor(days / 30)}mo`;
}
