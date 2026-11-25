/**
 * Dispatch's limits, in one place so the engine, the routes, the panel and the tests agree.
 * They exist for cost (a $200 pot shared with every AI feature) and to stop a runaway loop.
 * Tightened on 25 Nov 2026 (Dan: as cheap as possible): every follow-up resends the whole chat,
 * so a shorter chat and smaller tool results are the biggest savings after the model (model.ts).
 */

/** Model rounds per question: each round may call several tools at once. */
export const MAX_TOOL_ROUNDS = 5;

/** Output tokens per model call. Answers are short by instruction; drafts fit easily. */
export const MAX_OUTPUT_TOKENS = 2500;

/** Characters one tool result may hand the model (~1,100 tokens). Longer results are cut, and say so. */
export const RESULT_CHAR_CAP = 4500;

/** Characters of a code file one read may hand the model. */
export const CODE_CHAR_CAP = 6000;

/** A chat longer than this (stored messages, or ~characters/4 as tokens) is closed for new
 *  questions; the panel offers a fresh one. Keeps every question's resend cheap. */
export const MAX_CHAT_MESSAGES = 24;
export const MAX_CHAT_TOKENS = 30_000;

/** Questions one person may ask in a rolling hour: a guard against loops, not a budget. */
export const QUESTIONS_PER_HOUR = 60;

/** Most tasks one proposal may create at once. */
export const MAX_PROPOSED_TASKS = 20;

/** A question's maximum length. */
export const MAX_QUESTION_CHARS = 8000;

/** Pictures one question may bring in: attached by the person plus Figma frames and page
 *  screenshots. Each costs about as much as a page of text (~1,600 tokens at 1200px). */
export const MAX_IMAGES_PER_QUESTION = 3;

/** Pictures a person may attach to one question, and the largest one after it is shrunk. */
export const MAX_ATTACHMENTS = 3;
export const MAX_ATTACHMENT_BYTES = 1_500_000;

/** What one picture counts as against the chat-length cap. */
export const IMAGE_TOKENS = 1600;

/**
 * Rough token count of stored content, for the chat-length cap. Chars/4 is close enough for
 * text; a picture's base64 data would be counted as tens of thousands, so it counts as
 * IMAGE_TOKENS instead.
 */
export function roughTokens(value: unknown): number {
  let images = 0;
  const json = JSON.stringify(value ?? "", (key, v) => {
    if (key === "source" && v && typeof v === "object" && (v as { type?: string }).type === "base64") {
      images += 1;
      return "[image]";
    }
    return v;
  });
  return Math.ceil(json.length / 4) + images * IMAGE_TOKENS;
}
