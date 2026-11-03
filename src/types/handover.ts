/**
 * Handover — what someone hands over when they go away.
 *
 * ── Authored, entirely ───────────────────────────────────────────────────────
 * Every field here is a human sentence. Nothing in Foundry knows that a retainer
 * is unsigned, that a key has not been rotated, or that someone watches Discord
 * every morning, and those are the facts the reader needs.
 *
 * ⚠️ An earlier cut also carried DERIVED client state — live overdue and Care
 * counts printed beside each item. It was removed on 24 Sep: read against real
 * data it was noise (`86 open · 17 overdue · 240 awaiting reply` on a single
 * line), it competed with the sentence it sat under, and it cost five extra
 * queries on every read. Don't reintroduce it here without a reason to render
 * it — the client's live numbers already have a home in Portal and Care.
 */

export const HANDOVER_ITEM_KINDS = ["DECISION", "RISK", "DUTY", "CLIENT", "ROUTE"] as const;
export type HandoverItemKind = (typeof HANDOVER_ITEM_KINDS)[number];

/**
 * The kinds that render as sections, in order. `ROUTE` is deliberately absent:
 * it is the "who to go to" card in the header, not a list you scroll to.
 */
export const HANDOVER_SECTION_KINDS = ["DECISION", "RISK", "DUTY", "CLIENT"] as const;
export type HandoverSectionKind = (typeof HANDOVER_SECTION_KINDS)[number];

export const HANDOVER_ITEM_STATUSES = ["OPEN", "DONE", "BLOCKED"] as const;
export type HandoverItemStatus = (typeof HANDOVER_ITEM_STATUSES)[number];

export const HANDOVER_STATUSES = ["DRAFT", "ACTIVE", "ENDED"] as const;
export type HandoverStatus = (typeof HANDOVER_STATUSES)[number];

/** What each section is for, in the words shown at the top of it. */
export const HANDOVER_KIND_META: Record<
  HandoverItemKind,
  { label: string; tab: string; blurb: string; empty: string }
> = {
  DECISION: {
    label: "Waiting on a decision",
    tab: "Decisions",
    blurb: "Someone has to decide these, and it isn't the person covering.",
    empty: "Nothing is waiting on a decision.",
  },
  RISK: {
    label: "Open and unclosed",
    tab: "Open",
    blurb: "Live incidents and anything not confirmed done. Tick it when it's closed.",
    empty: "Nothing open.",
  },
  DUTY: {
    label: "Standing duties",
    tab: "Duties",
    blurb:
      "Recurring work with no ticket behind it. Foundry cannot see any of this, so it simply stops unless someone picks it up.",
    empty: "No standing duties recorded — which usually means they haven't been written down yet.",
  },
  CLIENT: {
    label: "Client by client",
    tab: "Clients",
    blurb: "Where each one stands, in the author's own words.",
    empty: "No client notes.",
  },
  ROUTE: {
    label: "Who to go to",
    tab: "Routing",
    blurb: "What each person can decide while you're away.",
    empty: "Nobody named yet.",
  },
};

/**
 * A client entry — the unit Harry and Syed open.
 *
 * Three paragraphs, all authored. Deliberately no task counts, no Care queue,
 * no Foundry status: this page is one person's account of the work, and a
 * derived figure beside it either repeats what Portal already shows or
 * contradicts it.
 */
export interface HandoverClientDTO {
  /** The underlying HandoverItem id. */
  id: string;
  clientId: string | null;
  clientName: string;
  /** Where the client is. */
  summary: string | null;
  /** What somebody has to keep doing. */
  duties: string | null;
  /** Anything else — decisions pending, risks, context. */
  other: string | null;
  orderKey: number;
}

export interface HandoverItemDTO {
  id: string;
  kind: HandoverItemKind;
  clientId: string | null;
  clientName: string | null;
  title: string;
  detail: string | null;
  ownerUserId: string | null;
  ownerName: string | null;
  cadence: string | null;
  channel: string | null;
  status: HandoverItemStatus;
  orderKey: number;
  resolvedAt: string | null;
  resolvedByName: string | null;
}

export interface HandoverDTO {
  id: string;
  userId: string;
  userName: string | null;
  title: string;
  startsOn: string;
  endsOn: string;
  /** Free prose the author types — the "here's the shape of it" paragraph. */
  notes: string | null;
  /** Card 02 — anything not about one client. */
  details: string | null;
  status: HandoverStatus;
  createdAt: string;
  updatedAt: string;
  clients: HandoverClientDTO[];
}

export interface HandoverSummaryDTO {
  id: string;
  userId: string;
  userName: string | null;
  title: string;
  startsOn: string;
  endsOn: string;
  status: HandoverStatus;
  /** How many clients have an entry. */
  clientCount: number;
  /** …and how many of those actually say something. */
  writtenCount: number;
}

export interface HandoverInput {
  userId?: string;
  title: string;
  startsOn: string;
  endsOn: string;
  notes?: string | null;
  details?: string | null;
  status?: HandoverStatus;
}

export interface HandoverItemInput {
  kind: HandoverItemKind;
  title: string;
  detail?: string | null;
  clientId?: string | null;
  ownerUserId?: string | null;
  cadence?: string | null;
  channel?: string | null;
  duties?: string | null;
  other?: string | null;
  status?: HandoverItemStatus;
  orderKey?: number;
}

/** What the client popup edits. */
export interface HandoverClientInput {
  summary?: string | null;
  duties?: string | null;
  other?: string | null;
}
