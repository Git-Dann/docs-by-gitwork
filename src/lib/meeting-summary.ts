/**
 * Scribe summary failures (CLAUDE.md §14). A meeting is only ever marked ERROR after its Gemini
 * notes were read from Drive and stored: the failure is always the AI summary step, never the
 * read. So the reason is about the AI, and the stored notes can be summarised again without
 * touching Drive. Pure, so the server, the cron and the tests share one rule.
 */

import { describeAiError } from "@/lib/ai-error-words";

export type SummaryFailureKind = "no_ai_key" | "ai_failed" | "unparsable";

/** Automatic retries stop after this many failed attempts; Retry on the page always works. */
export const SUMMARY_RETRY_MAX = 6;
const HOUR_MS = 3_600_000;

/** One plain sentence for a failure. Never the provider's raw text. */
export function summaryFailureReason(kind: SummaryFailureKind, raw?: string | null): string {
  if (kind === "unparsable") {
    return "The AI's answer couldn't be read, so the summary wasn't saved. Retry writes it again.";
  }
  if (kind === "no_ai_key") return describeAiError("no api key");
  return describeAiError(raw);
}

/** Wait before the next automatic retry: 1h, 2h, 4h … capped at a day. */
export function summaryRetryDelayMs(attempts: number): number {
  if (attempts <= 0) return 0;
  return Math.min(24 * HOUR_MS, HOUR_MS * 2 ** (attempts - 1));
}

/**
 * Should the cron re-summarise this meeting now? Only failed summaries (the notes are stored),
 * fewer than SUMMARY_RETRY_MAX attempts, and the back-off has passed. Rows from before attempts
 * were tracked (0 attempts) are due at once.
 */
export function summaryRetryDue(m: {
  status: string;
  hasNotes: boolean;
  attempts: number;
  attemptedAt: Date | null;
  now: Date;
}): boolean {
  if (m.status !== "ERROR" || !m.hasNotes) return false;
  if (m.attempts >= SUMMARY_RETRY_MAX) return false;
  if (!m.attemptedAt) return true;
  return m.now.getTime() - m.attemptedAt.getTime() >= summaryRetryDelayMs(m.attempts);
}
