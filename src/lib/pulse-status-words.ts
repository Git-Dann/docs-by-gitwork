/**
 * The words Pulse uses for a check's status, everywhere a person reads one: the scan
 * page, the shared report, the lead popup. Before this, one scan said "Failed",
 * "Failing" and "Fail", and "Warnings" next to "Not assessed" next to "Inconclusive",
 * for the same four ideas. Plain words, chosen for someone who is not a developer.
 */
import type { PulseCheckStatus } from "@/types/pulse";

export const STATUS_WORDS: Record<PulseCheckStatus, string> = {
  FAIL: "Fix",
  WARN: "Worth fixing",
  PASS: "Passing",
  INCONCLUSIVE: "Couldn't check",
  ERROR: "Couldn't check",
  NOT_TESTED: "Couldn't check",
  EVIDENCE_REQUIRED: "Needs evidence",
  NOT_APPLICABLE: "Doesn't apply",
  SKIPPED: "Doesn't apply",
};

/** One line per word, in the order a reader meets them. Shown beside the check list. */
export const STATUS_LEGEND: Array<{ status: "FAIL" | "WARN" | "INCONCLUSIVE" | "NOT_APPLICABLE"; word: string; meaning: string }> = [
  { status: "FAIL", word: STATUS_WORDS.FAIL, meaning: "A real problem Pulse saw. These count against the score." },
  { status: "WARN", word: STATUS_WORDS.WARN, meaning: "Not broken, but worth doing before or soon after launch." },
  { status: "INCONCLUSIVE", word: STATUS_WORDS.INCONCLUSIVE, meaning: "Pulse could not see enough to say. Not counted either way." },
  { status: "NOT_APPLICABLE", word: STATUS_WORDS.NOT_APPLICABLE, meaning: "Not relevant to this kind of product. Not counted." },
];
