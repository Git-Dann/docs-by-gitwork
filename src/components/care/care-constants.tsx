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
  ReplyState,
} from "@/types/support";

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
  snoozed: "bg-purple-50 text-purple-700 border border-purple-200",
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
  normal: "bg-slate-50 text-slate-600 border border-slate-200",
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
  awaiting_reply: "Awaiting reply",
  replied: "Replied",
  no_inbound: "No customer message",
};

export const REPLY_STATE_TONE: Record<ReplyState, string> = {
  // Amber, not red: "someone must answer this" is not the same alarm as "urgent", and priority
  // already owns red. A board where everything is red communicates nothing.
  awaiting_reply: "bg-amber-50 text-amber-800 border border-amber-300",
  replied: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  no_inbound: "bg-[var(--surface-1)] text-[var(--text-4)] border border-[var(--border-2)]",
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

// Saved views are pure client-side predicates over the fetched conversation array.
export interface SavedView {
  id: string;
  label: string;
  predicate: (c: Conversation, currentUserId?: string) => boolean;
  /** Longest-waiting first instead of most-recent-first (see client-cockpit sorting). */
  oldestFirst?: boolean;
}

const isActive = (c: Conversation) => c.status === "new" || c.status === "open";
const isAwaiting = (c: Conversation) => isActive(c) && c.replyState === "awaiting_reply";

export const SAVED_VIEWS: SavedView[] = [
  // The default, and the only queue that matters for "has this been answered?". Sorted
  // longest-waiting first — a triage board that buries the oldest unanswered thread under
  // today's noise is how things fall through.
  { id: "awaiting-reply", label: "Awaiting reply", predicate: isAwaiting, oldestFirst: true },
  { id: "replied", label: "Replied", predicate: (c) => isActive(c) && c.replyState === "replied" },
  { id: "assigned-me", label: "Assigned to me", predicate: (c, me) => isActive(c) && !!me && c.assigneeId === me },
  { id: "unassigned", label: "Unassigned", predicate: (c) => isAwaiting(c) && !c.assigneeId },
  { id: "urgent", label: "Urgent", predicate: (c) => isActive(c) && c.priority === "urgent" },
  { id: "open", label: "All open", predicate: isActive },
  { id: "snoozed", label: "Snoozed", predicate: (c) => c.status === "snoozed" },
  { id: "closed", label: "Closed", predicate: (c) => c.status === "closed" || c.status === "ignored" },
  { id: "all", label: "All", predicate: () => true },
];

export const DEFAULT_VIEW_ID = "awaiting-reply";

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
