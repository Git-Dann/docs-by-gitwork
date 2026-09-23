/**
 * The client summary board — one card per client, so the whole portfolio can be read
 * in one pass rather than by opening thirteen pages.
 *
 * Pure: the arithmetic and the ordering live here so they can be proved without a
 * database. `src/server/client-summary.ts` does the fetching.
 *
 * ## What this is, and what it deliberately is not
 *
 * It is a place to WRITE a summary of each project, with a few figures beside it for
 * reference. It is **not** a status board. It carried a derived attention level —
 * red/amber dots, "NEEDS ATTENTION", `HEALTH RED · 1 BLOCKED ON CLIENT` — and that was
 * removed at Dan's instruction: the page exists to carry a person's own account of a
 * client, and a machine's verdict sitting beside it competes with the thing it is for.
 *
 * ⚠️ Don't reintroduce a derived judgement here. If a signal is genuinely worth
 * showing, it belongs beside the other figures as a **number**, not as a colour or a
 * label — "3 blocked" is a fact, "HEALTH RED" is an opinion.
 *
 * ## The one rule that remains
 *
 * **A typed note must carry its age.** The board mixes prose somebody wrote by hand
 * with figures that updated this morning. A three-week-old "all on track" reads as
 * current, and that is the most misleading thing a page like this can do. Every note
 * is stamped, and one past `NOTE_STALE_DAYS` is marked stale rather than shown quietly.
 */

/** A note older than this is shown as stale. Two weeks: longer than a holiday, shorter
 *  than a sprint, so "nobody has looked at this recently" is a fair reading. */
export const NOTE_STALE_DAYS = 14;

export interface SummaryClientInput {
  id: string;
  slug: string;
  name: string;
  hidden: boolean;
  devCount: number;
  /** Tasks completed in the last 7 days. */
  deliveredThisWeek: number;
  /** Started and not finished. */
  inFlight: number;
  /** Not started. */
  planned: number;
  /** The short line the card shows. */
  note: string | null;
  /** The fuller account — detail view only, never on the card. */
  detail: string | null;
  noteAt: string | null;
}

export interface SummaryCard extends SummaryClientInput {
  noteAgeDays: number | null;
  noteStale: boolean;
}

const DAY = 86_400_000;

function ageInDays(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  // ⚠️ An unparseable stamp is "unknown age", never 0 — 0 would read as written today.
  if (Number.isNaN(t)) return null;
  return Math.floor((now.getTime() - t) / DAY);
}

export function assessClient(input: SummaryClientInput, now: Date): SummaryCard {
  const noteAgeDays = ageInDays(input.noteAt, now);
  // ⚠️ Either field counts as "written about". Marking a card stale while a long
  // update sits under it, unread, would be the same lie in the other direction.
  const written = input.note !== null || input.detail !== null;
  const noteStale = written && (noteAgeDays === null || noteAgeDays > NOTE_STALE_DAYS);
  return { ...input, noteAgeDays, noteStale };
}

/**
 * Alphabetical, so the board is in the order a person can predict and find things in.
 *
 * ⚠️ It used to sort worst-first off the derived attention level. With that judgement
 * gone from the page, ordering by an invisible signal would mean the cards moved for
 * reasons nobody could see — worse than either alternative.
 */
export function buildSummaryBoard(
  clients: readonly SummaryClientInput[],
  now: Date,
): {
  cards: SummaryCard[];
  /**
   * The hidden ones, assessed the same way.
   *
   * ⚠️ Returned, not just counted. A board that reports "4 hidden" with no way to see
   * or restore them is a dead end — the first version of the UI had a "manage in
   * Portal" link that called nothing, which is the §40.1 unreachable-state defect.
   */
  hiddenCards: SummaryCard[];
  hidden: number;
} {
  const byName = (a: SummaryCard, b: SummaryCard) => a.name.localeCompare(b.name);
  const cards = clients
    .filter((c) => !c.hidden)
    .map((c) => assessClient(c, now))
    .sort(byName);
  const hiddenCards = clients
    .filter((c) => c.hidden)
    .map((c) => assessClient(c, now))
    .sort(byName);
  return { cards, hiddenCards, hidden: hiddenCards.length };
}
