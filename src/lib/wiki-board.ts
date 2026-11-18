/**
 * The client's Board in their wiki: a Kanban of their product cards, grouped by release, that
 * they can move, add to and sign off. Pure: the server, the client and the demo use these rules.
 *
 * Big Wedge planned on their own site (Luke's "Forge" board, Nov 2026) and wanted Foundry to be
 * the single place the plan lives. The board is the same task board the team works from, so a
 * card the client adds is a real task the devs see at once: nothing to copy across, nothing lost.
 *
 * Three rules worth knowing:
 *   - Sign-off is DERIVED from the latest Approved / Changes needed entry, never stored on the
 *     task. A later "Changes needed" therefore replaces an earlier "Approved" with no flag to
 *     forget to clear, and a plain comment never changes it.
 *   - The client has full control of their cards (Dan, Nov 2026): move them anywhere, Done
 *     included, edit every field, delete them. The ONE thing they can never do is choose who
 *     works on a card: assignees are the team's (src/server/validators.ts `boardCardEditSchema`
 *     is .strict() and has no assignee field). The team's own dev tasks stay the team's.
 *   - The client adds cards only to the early lanes (Backlog and To do stages), so a card they
 *     add is always something waiting to be looked at, never work claimed to be in progress.
 */

import type { TaskStatus } from "@/types/tasks";

export const FEEDBACK_KINDS = ["comment", "approved", "changes_requested"] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

export function isFeedbackKind(v: unknown): v is FeedbackKind {
  return typeof v === "string" && (FEEDBACK_KINDS as readonly string[]).includes(v);
}

/** The item types a card can be created as from the board. A sub-item needs a parent feature card. */
export const CLIENT_CARD_TYPES = ["feature", "subitem", "bug", "feedback"] as const;
export type ClientCardType = (typeof CLIENT_CARD_TYPES)[number];

export function isClientCardType(v: unknown): v is ClientCardType {
  return typeof v === "string" && (CLIENT_CARD_TYPES as readonly string[]).includes(v);
}

/** What a top-level card can be changed to. A sub-item lives inside its feature card, not on the board. */
export const BOARD_EDIT_TYPES = ["feature", "bug", "feedback"] as const;
export type BoardEditType = (typeof BOARD_EDIT_TYPES)[number];

export const BOARD_LIMITS = {
  title: 200,
  description: 10_000,
  feedback: 4_000,
  links: 10,
  area: 80,
  estimateHours: 1_000,
  /** Cards one card can depend on. */
  dependsOn: 20,
  /** Screenshots on one card. */
  images: 10,
  imageBytes: 10 * 1024 * 1024,
  /**
   * One upload request. nginx refuses bodies over 25 MB (deploy/nginx/foundry.conf), so the form
   * sends larger selections in several requests, each under this.
   */
  uploadRequestBytes: 24 * 1024 * 1024,
  /** Width × height an uploaded image may declare. Above this it isn't decoded at all. */
  imagePixels: 40_000_000,
  /** Done lanes show the newest this-many cards, then "+N more". */
  doneLaneCards: 50,
} as const;

export type SignOff = "approved" | "changes_requested" | null;

/**
 * A card's sign-off: the most recent Approved or Changes needed entry wins. Comments don't
 * count, so a client saying "thanks" after approving doesn't un-approve it.
 */
export function deriveSignOff(entries: ReadonlyArray<{ kind: string; createdAt: Date | string }>): SignOff {
  let latest: { kind: string; t: number } | null = null;
  for (const e of entries) {
    if (e.kind !== "approved" && e.kind !== "changes_requested") continue;
    const t = new Date(e.createdAt).getTime();
    if (!latest || t >= latest.t) latest = { kind: e.kind, t };
  }
  return (latest?.kind as SignOff) ?? null;
}

export const SIGN_OFF_LABELS: Record<Exclude<SignOff, null>, string> = {
  approved: "Approved",
  changes_requested: "Changes needed",
};

/** Lanes a client may add a card to: the early stages, where new work waits to be looked at. */
export function clientCanAddToStage(stage: TaskStatus): boolean {
  return stage === "BACKLOG" || stage === "TODO";
}

/**
 * Whether the client may move, comment on or sign off this task: their product cards and the
 * cards they added. The team's own dev tasks are the team's: when the team chooses to show them
 * (`boardShowAllTasks`), the client sees their titles and nothing more.
 */
export function clientMayActOn(card: { isCard: boolean; addedByClient: boolean }): boolean {
  return card.isCard || card.addedByClient;
}

/**
 * What the feedback composer needs before it can send. A comment needs words; "Changes needed"
 * needs to say what to change, or the team has nothing to act on; "Approved" can stand alone.
 */
export function feedbackRefusal(kind: FeedbackKind, body: string | null | undefined): string | null {
  const text = body?.trim() ?? "";
  if (text.length > BOARD_LIMITS.feedback) return `Keep it under ${BOARD_LIMITS.feedback.toLocaleString("en-GB")} characters.`;
  if (kind === "comment" && !text) return "Write something first.";
  if (kind === "changes_requested" && !text) return "Say what needs changing, so the team knows what to do.";
  return null;
}

/** "Hassaan B." — what the client sees of who's on a card. Never an email or full surname. */
export function shortPersonName(name: string | null | undefined): string | null {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return null;
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

/**
 * Links a client attaches to a card are stored as markdown lines under the description, so they
 * render with the same safe renderer as the rest of it. Only http(s) links are kept.
 */
export function cardDescription(description: string | null | undefined, links: readonly string[]): string | null {
  const text = description?.trim() ?? "";
  // `[label](url)`: the one link form the shared renderer (src/lib/markdown.tsx) draws. A `]` or
  // `)` in the label would end it early, so they're dropped from the label (the URL is intact).
  // The URL itself can't contain `)` or whitespace there either, so those are percent-encoded.
  const lines = links.map((l) => {
    const href = l.replace(/\(/g, "%28").replace(/\)/g, "%29").replace(/\s/g, "%20");
    return `- [${l.replace(/^https?:\/\//, "").replace(/[\]()]/g, "")}](${href})`;
  });
  const out = [text, lines.length ? `Links:\n${lines.join("\n")}` : ""].filter(Boolean).join("\n\n");
  return out || null;
}
