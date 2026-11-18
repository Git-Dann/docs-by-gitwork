/**
 * The Board's card dialog (src/components/clients/wiki/wiki-board-card-dialog.tsx): the one place a
 * card is added, read and edited, on the team's wiki and the client's link (§126). Pure rules, so
 * the dialog and the tests agree.
 */

import { safeLaunchpadLink } from "@/lib/launchpad/field-types";
import { BOARD_LIMITS, clientMayActOn } from "@/lib/wiki-board";
import type { WikiBoardCard, WikiBoardFeedback } from "@/types/wiki-board";

export type CardAudience = "client" | "team";

/**
 * What the viewer may change on an open card, from the same rules as the Table (§127.1):
 *   - `fields`: every field but the column. Only on a card (a product card, or one the client
 *     added). A team dev task's fields are edited on the task board, never from here, and the
 *     client never edits a dev task at all.
 *   - `move`: the column. The team may move anything; the client only what they may act on.
 * Nothing while the team previews the client's view: a preview is for looking.
 */
export function cardEditing(
  card: Pick<WikiBoardCard, "isCard" | "addedByClient">,
  audience: CardAudience,
  previewing: boolean,
): { fields: boolean; move: boolean } {
  if (previewing) return { fields: false, move: false };
  const actable = clientMayActOn(card);
  return { fields: actable, move: audience === "team" || actable };
}

/**
 * Who works on a card is the team's business: the client never sees the people on it in the
 * dialog (the old detail printed them in its meta line), and the team doesn't while previewing.
 */
export function showsPeople(audience: CardAudience, previewing: boolean): boolean {
  return audience === "team" && !previewing;
}

export type ActivityItem =
  | { kind: "feedback"; at: number; feedback: WikiBoardFeedback }
  | { kind: "stage"; at: number; label: string; date: string };

/**
 * The card's activity, oldest first: the thread (feedback, sign-offs, change entries) and the
 * stage dates imported from the client's planning tool, on one line of time. A stage date with no
 * readable date sorts first rather than vanishing.
 */
export function cardActivity(feedback: readonly WikiBoardFeedback[], stages: ReadonlyArray<{ label: string; date: string }>): ActivityItem[] {
  const items: ActivityItem[] = [
    ...stages.map((s) => ({ kind: "stage" as const, at: timeOf(s.date), label: s.label, date: s.date })),
    ...feedback.map((f) => ({ kind: "feedback" as const, at: timeOf(f.createdAt), feedback: f })),
  ];
  // Stable: equal times keep stages before the thread, and each in its own order.
  return items.map((item, i) => ({ item, i })).sort((a, b) => a.item.at - b.item.at || a.i - b.i).map((x) => x.item);
}

function timeOf(iso: string): number {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

/**
 * Add a link to a card's list, or say why not: a web link only (the Launchpad allow-list, so no
 * `javascript:`), not one it already has, and no more than the board allows.
 */
export function addCardLink(links: readonly string[], raw: string): { ok: true; links: string[] } | { ok: false; error: string } {
  const value = raw.trim();
  if (!value) return { ok: false, error: "Paste a link first." };
  const safe = safeLaunchpadLink(value);
  if (!safe) return { ok: false, error: `“${value}” isn't a web link. Links need to start with https://` };
  if (links.includes(safe)) return { ok: false, error: "That link is already on the card." };
  if (links.length >= BOARD_LIMITS.links) return { ok: false, error: `A card holds up to ${BOARD_LIMITS.links} links.` };
  return { ok: true, links: [...links, safe] };
}

/** "example.com/path" for a link's label: what a person recognises, not the whole URL. */
export function linkLabel(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname === "/" ? "" : u.pathname;
    return `${u.hostname.replace(/^www\./, "")}${path}`;
  } catch {
    return url;
  }
}

export const CARD_IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"] as const;

/**
 * Which picked files can go on a card, or why one can't: images the board takes (the server checks
 * the bytes again), under the size cap, within the card's room.
 */
export function pickCardImages(
  existing: number,
  queued: number,
  files: ReadonlyArray<{ name: string; type: string; size: number }>,
): { ok: true } | { ok: false; error: string } {
  if (existing + queued + files.length > BOARD_LIMITS.images) {
    return { ok: false, error: `A card holds up to ${BOARD_LIMITS.images} images${existing ? ` (this one has ${existing})` : ""}.` };
  }
  const wrong = files.find((f) => !(CARD_IMAGE_TYPES as readonly string[]).includes(f.type) || f.size > BOARD_LIMITS.imageBytes);
  if (wrong) return { ok: false, error: `“${wrong.name}” isn't a PNG, JPEG, GIF or WebP image under 10 MB.` };
  return { ok: true };
}

/**
 * Which sub-item an add created: the one in the parent's list after the add that wasn't there
 * before. Null when the server's answer doesn't show it (the popup then just stays on the parent).
 */
export function addedSubItemId(beforeIds: ReadonlySet<string>, after: Pick<WikiBoardCard, "subtasks">): string | null {
  return after.subtasks.find((s) => s.isItem && !beforeIds.has(s.id))?.id ?? null;
}

/**
 * Where the lightbox goes after an image is removed: the same position (the next image slides into
 * it), the new last one if it was the last, or closed when none are left.
 */
export function indexAfterRemoval(index: number, remaining: number): number | null {
  if (remaining <= 0) return null;
  return Math.min(index, remaining - 1);
}
