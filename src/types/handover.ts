/**
 * Handover — what someone hands over when they go away.
 *
 * Two halves, and keeping them apart is the whole design:
 *
 *   AUTHORED  the items below. Human sentences, dated, attributed. Nothing in
 *             Foundry knows a retainer is unsigned or that someone watches
 *             Discord every morning, so none of it can be derived.
 *   DERIVED   `HandoverClientState`. Recomputed on every read, so it cannot go
 *             stale underneath the reader.
 *
 * The page renders them side by side and labels which is which. A week-old
 * judgement read as today's fact is the failure this shape exists to prevent.
 */

export const HANDOVER_ITEM_KINDS = ["DECISION", "RISK", "DUTY", "CLIENT"] as const;
export type HandoverItemKind = (typeof HANDOVER_ITEM_KINDS)[number];

export const HANDOVER_ITEM_STATUSES = ["OPEN", "DONE", "BLOCKED"] as const;
export type HandoverItemStatus = (typeof HANDOVER_ITEM_STATUSES)[number];

export const HANDOVER_STATUSES = ["DRAFT", "ACTIVE", "ENDED"] as const;
export type HandoverStatus = (typeof HANDOVER_STATUSES)[number];

/** What each section is for, in the words shown at the top of it. */
export const HANDOVER_KIND_META: Record<
  HandoverItemKind,
  { label: string; blurb: string; empty: string }
> = {
  DECISION: {
    label: "Waiting on a decision",
    blurb: "Blocked by the standing rule — someone has to decide, and it isn't the person covering.",
    empty: "Nothing is waiting on a decision.",
  },
  RISK: {
    label: "Open and unclosed",
    blurb: "Live incidents and anything not confirmed done. Tick it when it's closed.",
    empty: "Nothing open.",
  },
  DUTY: {
    label: "Standing duties",
    blurb:
      "Recurring work with no ticket behind it. Foundry cannot see any of this, so it simply stops unless someone picks it up.",
    empty: "No standing duties recorded — which usually means they haven't been written down yet.",
  },
  CLIENT: {
    label: "Client by client",
    blurb: "Where each one stands, in the author's own words.",
    empty: "No client notes.",
  },
};

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

/**
 * Live client state, recomputed every read. Deliberately thin: a handover is a
 * document about judgement, and a wall of derived figures buries the sentences
 * that carry it.
 */
export interface HandoverClientState {
  clientId: string;
  clientName: string;
  slug: string;
  openTasks: number;
  overdueTasks: number;
  careAwaiting: number;
  /** Oldest unanswered customer message, ISO. Null = nothing waiting. */
  careOldestAwaitingAt: string | null;
  /**
   * True when Foundry holds essentially nothing on this client — no open tasks
   * and no Care queue. It does NOT mean the client is quiet: Echo has a shipped
   * app and zero tasks, YourGroop tracks on a shared sheet, Freeway runs over
   * WhatsApp. Rendering those as healthy is the lie this flag exists to stop.
   */
  thin: boolean;
}

export interface HandoverDTO {
  id: string;
  userId: string;
  userName: string | null;
  title: string;
  startsOn: string;
  endsOn: string;
  standingRule: string | null;
  notes: string | null;
  status: HandoverStatus;
  createdAt: string;
  updatedAt: string;
  items: HandoverItemDTO[];
  /** Derived, as of `asOf`. Never stored. */
  clientState: HandoverClientState[];
  asOf: string;
}

export interface HandoverSummaryDTO {
  id: string;
  userId: string;
  userName: string | null;
  title: string;
  startsOn: string;
  endsOn: string;
  status: HandoverStatus;
  openDecisions: number;
  openRisks: number;
  duties: number;
}

export interface HandoverInput {
  userId?: string;
  title: string;
  startsOn: string;
  endsOn: string;
  standingRule?: string | null;
  notes?: string | null;
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
  status?: HandoverItemStatus;
  orderKey?: number;
}
