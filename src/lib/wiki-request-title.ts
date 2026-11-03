/**
 * The longest a client request's title can be, and what the form does with a longer one.
 *
 * ⚠️ The limit lived only in the routes' zod schemas, so the "Log a request" box had no
 * idea it existed. A client typing a sentence or two into it — which is exactly what the
 * placeholder invites — got the bare words "Validation failed" and nothing saved. That is
 * how PollenIQ's wiki reached October 2026 with zero requests: its one client user's first
 * note was 258 characters long, and every attempt was refused.
 *
 * Rejecting the text is the wrong answer to a long title. The person has told us what
 * they need; the only problem is which box it sits in. So the form keeps ALL of it — the
 * first sentence (or a word-boundary cut) becomes the title, and the full text leads the
 * description. Nothing they wrote is dropped.
 *
 * Framework-free: the routes and the `"use client"` form both read the same limit.
 */

/** Longest request title the store accepts. */
export const REQUEST_MAX_TITLE = 180;

/** A first sentence shorter than this is too thin to stand as a title ("Hi."), so the
 *  word-boundary cut is used instead. */
const MIN_SENTENCE_TITLE = 20;

export type FittedRequest = {
  title: string;
  description: string | null;
  /** True when the title was shortened and the full text moved into the description. */
  moved: boolean;
};

/** Shorten an over-long title to one that will be accepted, without losing a word of it. */
export function fitRequestTitle(title: string, description?: string | null): FittedRequest {
  const full = title.trim();
  const desc = (description ?? "").trim();
  if (full.length <= REQUEST_MAX_TITLE) {
    return { title: full, description: desc || null, moved: false };
  }
  return {
    title: shortTitle(full),
    // The full text leads, so the description reads as what they wrote, in order.
    description: desc ? `${full}\n\n${desc}` : full,
    moved: true,
  };
}

function shortTitle(full: string): string {
  // The first sentence, when it is a real one and fits.
  const sentence = /^(.+?[.!?])(?:\s|$)/.exec(full)?.[1];
  if (sentence && sentence.length >= MIN_SENTENCE_TITLE && sentence.length <= REQUEST_MAX_TITLE) {
    return sentence;
  }
  // Otherwise cut at the last word boundary that leaves room for the ellipsis.
  const room = REQUEST_MAX_TITLE - 1;
  const slice = full.slice(0, room);
  const lastSpace = slice.lastIndexOf(" ");
  const cut = lastSpace > room / 2 ? slice.slice(0, lastSpace) : slice;
  return `${cut.replace(/[\s,;:–-]+$/, "")}…`;
}
