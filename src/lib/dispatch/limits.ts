/**
 * Dispatch's limits, in one place so the engine, the routes, the panel and the tests agree.
 * They exist for cost (a $200 pot shared with every AI feature) and to stop a runaway loop.
 */

/** Model rounds per question: each round may call several tools at once. */
export const MAX_TOOL_ROUNDS = 6;

/** Output tokens per model call. Answers are short by instruction; drafts fit easily. */
export const MAX_OUTPUT_TOKENS = 4000;

/** Characters one tool result may hand the model (~1,500 tokens). Longer results are cut, and say so. */
export const RESULT_CHAR_CAP = 6000;

/** Characters of a code file one read may hand the model. */
export const CODE_CHAR_CAP = 8000;

/** A chat longer than this (stored messages, or ~characters/4 as tokens) is closed for new
 *  questions; the panel offers a fresh one. Keeps every question's resend cheap. */
export const MAX_CHAT_MESSAGES = 40;
export const MAX_CHAT_TOKENS = 60_000;

/** Questions one person may ask in a rolling hour: a guard against loops, not a budget. */
export const QUESTIONS_PER_HOUR = 60;

/** Most tasks one proposal may create at once. */
export const MAX_PROPOSED_TASKS = 20;

/** A question's maximum length. */
export const MAX_QUESTION_CHARS = 8000;

/** Rough token count of stored content, for the chat-length cap. Chars/4 is close enough. */
export function roughTokens(value: unknown): number {
  return Math.ceil(JSON.stringify(value ?? "").length / 4);
}
