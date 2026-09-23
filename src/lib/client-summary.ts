/**
 * The client summary board — one card per client, so the whole portfolio can be read
 * in one pass rather than by opening thirteen pages.
 *
 * Pure: the arithmetic and the ordering live here so they can be proved without a
 * database. `src/server/client-summary.ts` does the fetching.
 *
 * ## Two rules this file exists to enforce
 *
 * 1. **A typed note must carry its age.** The board mixes live derived figures with
 *    prose somebody wrote by hand. A three-week-old "all on track" sitting beside a
 *    figure that updated this morning reads as current, and that is the most
 *    misleading thing a page like this can do. Every note is stamped, and one past
 *    `NOTE_STALE_DAYS` is marked stale rather than quietly shown.
 * 2. **Silence is not health.** A client with no tasks, no timeline and no note is not
 *    "fine" — it is unmeasured. `attention` separates "we looked and it is good" from
 *    "we have nothing to look at", because the second needs a person and the first
 *    does not.
 */

/** A note older than this is shown as stale. Two weeks: longer than a holiday, shorter
 *  than a sprint, so "nobody has looked at this recently" is a fair reading. */
export const NOTE_STALE_DAYS = 14;

export type SummaryAttention = "critical" | "watch" | "ok" | "unmeasured";

export interface SummaryClientInput {
  id: string;
  slug: string;
  name: string;
  hidden: boolean;
  /** Composite health from client-metrics: "red" | "amber" | "green" | null. */
  health: string | null;
  devCount: number;
  /** Open blockers — work we cannot move until the client answers. */
  waitingOnClient: number;
  /** Care conversations awaiting our reply. */
  awaitingReply: number;
  /** Tasks completed in the last 7 days. */
  deliveredThisWeek: number;
  /** Started and not finished. */
  inFlight: number;
  /** Not started. */
  planned: number;
  note: string | null;
  noteAt: string | null;
}

export interface SummaryCard extends SummaryClientInput {
  attention: SummaryAttention;
  /**
   * Why it needs attention, worst first.
   *
   * ⚠️ Deliberately SHORT — these are flags on a strip, not sentences. Three stacked
   * derived sentences dominated the card and buried the thing a person had actually
   * written, which is the content the board exists to carry.
   */
  reasons: string[];
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

/**
 * Whether a client needs looking at, and why.
 *
 * ⚠️ `unmeasured` is not a worse `ok`. A client with nothing to measure has no signal
 * at all, and colouring that green tells Harry it is fine when nobody has checked.
 */
export function assessClient(input: SummaryClientInput, now: Date): SummaryCard {
  const reasons: string[] = [];

  if (input.health === "red") reasons.push("Health red");
  if (input.awaitingReply > 0) reasons.push(`${input.awaitingReply} awaiting reply`);
  if (input.waitingOnClient > 0) reasons.push(`${input.waitingOnClient} blocked on client`);
  if (input.health === "amber") reasons.push("Health amber");

  const hasWork = input.deliveredThisWeek + input.inFlight + input.planned > 0;
  // ⚠️ "Nothing shipped" only means something when there IS work to ship. On a client
  // with no tasks at all it is not a finding, it is the absence of a board.
  if (hasWork && input.deliveredThisWeek === 0 && input.inFlight === 0) {
    reasons.push("Stalled");
  }

  const noteAgeDays = ageInDays(input.noteAt, now);
  const noteStale = input.note !== null && (noteAgeDays === null || noteAgeDays > NOTE_STALE_DAYS);

  const measured = hasWork || input.health !== null || input.awaitingReply > 0;
  // ⚠️ An unmeasured card is otherwise four zeros and nothing else, which reads as
  // "quiet" rather than "we cannot see this". Say which it is — §35's rule, on a card.
  if (!measured) reasons.push("Nothing to read");

  const attention: SummaryAttention = !measured
    ? "unmeasured"
    : input.health === "red" || input.awaitingReply > 0
      ? "critical"
      : reasons.length > 0
        ? "watch"
        : "ok";

  return { ...input, attention, reasons, noteAgeDays, noteStale };
}

const RANK: Record<SummaryAttention, number> = {
  critical: 0,
  watch: 1,
  unmeasured: 2,
  ok: 3,
};

/**
 * Worst first, so a board that is mostly fine puts the exceptions at the top.
 *
 * ⚠️ `unmeasured` sorts ABOVE `ok`: a client nobody can see the state of is a job for
 * a person, and burying it under the healthy ones is how it stays invisible.
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
  counts: Record<SummaryAttention, number>;
} {
  const visible = clients.filter((c) => !c.hidden);
  const hiddenCards = clients
    .filter((c) => c.hidden)
    .map((c) => assessClient(c, now))
    .sort((a, b) => a.name.localeCompare(b.name));
  const cards = visible
    .map((c) => assessClient(c, now))
    .sort(
      (a, b) =>
        RANK[a.attention] - RANK[b.attention] ||
        b.reasons.length - a.reasons.length ||
        a.name.localeCompare(b.name),
    );
  const counts: Record<SummaryAttention, number> = {
    critical: 0,
    watch: 0,
    ok: 0,
    unmeasured: 0,
  };
  for (const c of cards) counts[c.attention] += 1;
  return { cards, hiddenCards, hidden: hiddenCards.length, counts };
}
