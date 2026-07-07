import type { DevSignalScoreBreakdown } from "./scoring";

/**
 * Client-facing presentation. Clients NEVER see raw scores, sub-scores, weights,
 * flags, or internal notes — only a best-match label + a short, safe summary.
 * The internal report may show the numbers; this is the redaction boundary.
 */

export type BestMatchLabel =
  | "BEST_MATCH"
  | "STRONG_MATCH"
  | "QUALIFIED_MATCH"
  | "REVIEW_RECOMMENDED"
  | "NOT_RECOMMENDED";

export const BEST_MATCH_DISPLAY: Record<BestMatchLabel, string> = {
  BEST_MATCH: "Best match",
  STRONG_MATCH: "Strong match",
  QUALIFIED_MATCH: "Qualified match",
  REVIEW_RECOMMENDED: "Review recommended",
  NOT_RECOMMENDED: "Not recommended at this stage",
};

const BEST = 85;
const STRONG = 70;
const QUALIFIED = 55;

export function toBestMatchLabel(breakdown: DevSignalScoreBreakdown): BestMatchLabel {
  // A blocking failure (e.g. identity) always reads as not recommended.
  if (breakdown.blockingFailures.length > 0) return "NOT_RECOMMENDED";
  // Unresolved human review takes precedence over a provisional number.
  if (breakdown.humanReviewRequired) return "REVIEW_RECOMMENDED";
  const s = breakdown.finalScore;
  if (s >= BEST) return "BEST_MATCH";
  if (s >= STRONG) return "STRONG_MATCH";
  if (s >= QUALIFIED) return "QUALIFIED_MATCH";
  return "REVIEW_RECOMMENDED";
}

export interface ClientFacingSummary {
  label: BestMatchLabel;
  labelDisplay: string;
  /** Short, non-numeric headline strengths (safe to show a client). */
  strengths: string[];
  /** True when this candidate has cleared the human gate into Code. */
  vetted: boolean;
}

/**
 * Build the ONLY object a client-facing endpoint may return for an assessment.
 * Deliberately omits finalScore, sub-scores, weights, flags, and notes.
 */
export function buildClientFacingSummary(args: {
  breakdown: DevSignalScoreBreakdown;
  strengths?: string[];
  promotedToCode: boolean;
}): ClientFacingSummary {
  const label = toBestMatchLabel(args.breakdown);
  return {
    label,
    labelDisplay: BEST_MATCH_DISPLAY[label],
    strengths: (args.strengths ?? []).slice(0, 3),
    vetted: args.promotedToCode,
  };
}
