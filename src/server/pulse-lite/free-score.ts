/**
 * The score the FREE scan shows: on the widget, on its public report, and in our lead email.
 *
 * The free scan reads the page the server sends, without a browser. On a site that draws its
 * content with JavaScript that is close to nothing, so most checks about the page can't be
 * judged, and Pulse leaves those out of the score. Left alone that makes the score go UP the
 * less the scan could see: StayPay's free scan said 93 at 69% coverage, while the full scan,
 * which loads the page, found three real problems and said 83 (Nov 2026).
 *
 * Dan: "err on the side of a lower score, otherwise they come to us with an inflated idea of
 * perfect". So every check the free scan couldn't judge gets HALF MARKS: halfway between the
 * score from what it saw and the score if everything it couldn't see had failed
 * (`lowerBound`, already in the breakdown). A scan that saw everything is unchanged.
 * Below `PROVISIONAL_BELOW` coverage the score is also labelled provisional, with why.
 */
import { computeScoreBreakdown } from "@/server/pulse-checks/score-breakdown";
import type { PulseScanCheckInput } from "@/types/pulse";
import { PROVISIONAL_BELOW } from "@/lib/pulse-free-score";

export { PROVISIONAL_BELOW, provisionalNote } from "@/lib/pulse-free-score";

export interface FreeScanScore {
  /** What to show. */
  score: number;
  /** Seen too little of the site to call it more than a guide. */
  provisional: boolean;
  /** How much of what it set out to check it could judge, 0–100. */
  coverage: number;
  /** The score from what it saw alone, before the half marks. Kept for the corpus. */
  fromWhatItSaw: number;
}

/** Pure: the cautious score from a breakdown's numbers. */
export function cautiousScore(b: { finalScore: number; lowerBound: number; completeness: number }): FreeScanScore {
  const unseenPenalty = Math.max(0, b.finalScore - b.lowerBound) / 2;
  return {
    score: Math.max(0, Math.round(b.finalScore - unseenPenalty)),
    provisional: b.completeness < PROVISIONAL_BELOW,
    coverage: Math.round(b.completeness),
    fromWhatItSaw: b.finalScore,
  };
}

export function freeScanScore(checks: PulseScanCheckInput[]): FreeScanScore {
  return cautiousScore(computeScoreBreakdown(checks));
}
