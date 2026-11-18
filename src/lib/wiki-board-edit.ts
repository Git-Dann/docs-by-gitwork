/**
 * Editing a card on the client's Board: the rules the server, the demo and the dialog share.
 * Pure, so every rule here is tested without a database.
 *
 *   - What changed is written into the card's thread as one plain sentence ("Luke changed the
 *     priority from Medium to High"), never as data. The team reads the thread; JSON would be
 *     unreadable and a field name would mean nothing to them.
 *   - Links live in the description as the markdown block `cardDescription` writes, so the team's
 *     task drawer shows them with no extra field. `splitCardDescription` reads that block back
 *     out for the edit form, and anything it doesn't recognise stays in the text.
 *   - Screenshots are checked by their first bytes, never by the name or the type the browser
 *     claims. SVG is refused: it is a document that can run script, not a picture.
 */

import { sniffImage, type ImageMime } from "@/lib/forge-import/images";
import { ITEM_TYPE_LABELS, TIER_LABELS, isItemType, isTier } from "@/lib/tasks/product-cards";
import { BOARD_LIMITS } from "@/lib/wiki-board";
import { TASK_PRIORITY_LABELS, type TaskPriority } from "@/types/tasks";

/** The fields of a card that can be changed from the board. Assignees are deliberately absent. */
export interface CardFields {
  title: string;
  itemType: string | null;
  tier: string | null;
  area: string | null;
  priority: TaskPriority;
  estimateHours: number | null;
  /** YYYY-MM-DD, or null. */
  dueDate: string | null;
  releaseId: string | null;
  description: string | null;
  links: string[];
  dependsOn: string[];
}

function plainDay(day: string | null): string | null {
  if (!day) return null;
  const d = new Date(`${day.slice(0, 10)}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return day;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

function hours(h: number | null): string | null {
  if (h === null) return null;
  return `${Number.isInteger(h) ? h : h.toFixed(1)}h`;
}

const typeLabel = (v: string | null) => (v && isItemType(v) ? ITEM_TYPE_LABELS[v] : v);
const tierLabel = (v: string | null) => (v && isTier(v) ? TIER_LABELS[v] : v);

function change(what: string, from: string | null, to: string | null): string | null {
  if ((from ?? "") === (to ?? "")) return null;
  if (!from) return `set the ${what} to ${to}`;
  if (!to) return `cleared the ${what}`;
  return `changed the ${what} from ${from} to ${to}`;
}

function plural(n: number, one: string): string {
  return `${n} ${one}${n === 1 ? "" : "s"}`;
}

/**
 * What changed between two versions of a card, as short phrases. Empty when nothing did.
 * `releaseLabel` turns a release id into what the client calls it.
 */
export function describeCardChanges(
  before: CardFields,
  after: CardFields,
  releaseLabel: (id: string) => string | null = () => null,
): string[] {
  const out: Array<string | null> = [];
  if (before.title.trim() !== after.title.trim()) out.push(`renamed it to “${after.title.trim()}”`);
  out.push(change("type", typeLabel(before.itemType), typeLabel(after.itemType)));
  out.push(change("tier", tierLabel(before.tier), tierLabel(after.tier)));
  out.push(change("area", before.area, after.area));
  out.push(change("priority", TASK_PRIORITY_LABELS[before.priority], TASK_PRIORITY_LABELS[after.priority]));
  out.push(change("estimate", hours(before.estimateHours), hours(after.estimateHours)));
  out.push(change("due date", plainDay(before.dueDate), plainDay(after.dueDate)));
  if ((before.releaseId ?? null) !== (after.releaseId ?? null)) {
    if (!after.releaseId) out.push("took it out of its release");
    else out.push(`moved it to ${releaseLabel(after.releaseId) ?? "another release"}`);
  }
  if ((before.description ?? "").trim() !== (after.description ?? "").trim()) out.push("edited the description");
  const added = after.links.filter((l) => !before.links.includes(l)).length;
  const removed = before.links.filter((l) => !after.links.includes(l)).length;
  if (added) out.push(`added ${plural(added, "link")}`);
  if (removed) out.push(`removed ${plural(removed, "link")}`);
  const depsBefore = [...before.dependsOn].sort().join(",");
  const depsAfter = [...after.dependsOn].sort().join(",");
  if (depsBefore !== depsAfter) out.push(after.dependsOn.length ? "changed what it depends on" : "cleared what it depends on");
  return out.filter((p): p is string => Boolean(p));
}

/** "Luke changed the priority from Medium to High and edited the description." */
export function changeSentence(name: string, phrases: readonly string[]): string {
  if (!phrases.length) return "";
  const list = phrases.length === 1 ? phrases[0] : `${phrases.slice(0, -1).join(", ")} and ${phrases[phrases.length - 1]}`;
  return `${name} ${list}.`;
}

/**
 * Split a stored description back into its text and its links: the inverse of `cardDescription`.
 * Only the exact block `cardDescription` writes is read as links; anything else is left as text,
 * so an imported or hand-written description is never mangled.
 */
export function splitCardDescription(stored: string | null | undefined): { body: string; links: string[] } {
  const text = stored ?? "";
  const m = /(?:^|\n\n)Links:\n((?:- \[[^\]\n]*\]\([^)\s]+\)\n?)+)\s*$/.exec(text);
  if (!m) return { body: text.trim(), links: [] };
  const links = [...m[1].matchAll(/- \[[^\]\n]*\]\(([^)\s]+)\)/g)].map((x) =>
    x[1].replace(/%28/g, "(").replace(/%29/g, ")").replace(/%20/g, " "),
  );
  return { body: text.slice(0, m.index).trim(), links };
}

/** Why a card can't be a sub-item of this parent, or null when it can. One level only. */
export function subItemParentRefusal(parent: { itemType: string | null; parentId: string | null } | null): string | null {
  if (!parent) return "Pick the feature this sub-item belongs to.";
  if (parent.parentId) return "A sub-item goes under a feature card, not under another sub-item.";
  if (parent.itemType !== "feature") return "A sub-item goes under a feature card.";
  return null;
}

/** Why this "depends on" list can't be saved, or null. Every id must be a card the caller found. */
export function dependsOnRefusal(selfId: string | null, ids: readonly string[], found: ReadonlySet<string>): string | null {
  if (ids.length > BOARD_LIMITS.dependsOn) return `A card can depend on up to ${BOARD_LIMITS.dependsOn} others.`;
  if (selfId && ids.includes(selfId)) return "A card can't depend on itself.";
  if (ids.some((id) => !found.has(id))) return "One of the cards it depends on isn't on this board.";
  return null;
}

/** A file offered as a screenshot: its size and its first bytes (12 is enough to tell). */
export interface OfferedImage {
  name: string;
  size: number;
  head: Uint8Array;
}

/**
 * Check screenshots before anything is stored. Returns the type of each, or the first problem as
 * a sentence. The type comes from the bytes, so a renamed file can't pass as an image.
 */
export function checkBoardImages(
  existing: number,
  files: readonly OfferedImage[],
): { ok: true; mimes: ImageMime[] } | { ok: false; error: string } {
  if (!files.length) return { ok: false, error: "Choose an image to add." };
  if (existing + files.length > BOARD_LIMITS.images) {
    const room = Math.max(0, BOARD_LIMITS.images - existing);
    return {
      ok: false,
      error: room
        ? `A card holds up to ${BOARD_LIMITS.images} images; there's room for ${room} more.`
        : `This card already has ${BOARD_LIMITS.images} images, the most it holds.`,
    };
  }
  const mimes: ImageMime[] = [];
  for (const f of files) {
    if (f.size > BOARD_LIMITS.imageBytes) return { ok: false, error: `“${f.name}” is over 10 MB.` };
    const mime = sniffImage(f.head);
    if (!mime) return { ok: false, error: `“${f.name}” isn't a PNG, JPEG, GIF or WebP image.` };
    mimes.push(mime);
  }
  return { ok: true, mimes };
}

/** How the thread records added screenshots. */
export function imagesSentence(name: string, n: number): string {
  return `${name} added ${plural(n, "screenshot")}.`;
}
