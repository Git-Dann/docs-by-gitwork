/**
 * Is an extracted course name actually a course the provider can be sent?
 *
 * ## Why this is not left to the prompt
 *
 * The classifier is asked to pull a course name out of a golfer's feedback. When the
 * golfer never names one, it does not return empty — it **constructs** something. Three
 * real rows from the Wedge board, none of which named a course:
 *
 * | The golfer wrote | Filed as |
 * |---|---|
 * | "My home course has very incorrect information" | `home course` |
 * | "My home course was renovated due to hs2" | `HS2 Renovated Course (Home Course)` |
 * | "the scorecard for my home course is incorrect" (from `craig@ardlodge.co.uk`) | `Ardlodge` |
 *
 * All three are legitimate complaints about *some* course's data — and all three are
 * unactionable, because you cannot ask a data provider to fix "home course". The third is
 * the worst: the name was inferred from the sender's **email domain**, which makes it
 * plausible enough to send to a provider while being something the golfer never said.
 *
 * The prompt now forbids all of this, but a prompt instruction is a request, not a
 * guarantee (CLAUDE.md §35's discipline: do not let an unverified inference become a
 * confident assertion). These two checks are deterministic and cover the two shapes:
 *
 *   1. **Generic placeholder** — no course is called "home course".
 *   2. **Not present in what the golfer wrote** — if the distinctive part of the name
 *      appears nowhere in their message, it came from somewhere else (email domain,
 *      signature, the model's own knowledge). That is a fabrication regardless of whether
 *      it happens to be right.
 *
 * ⚠️ Deliberately biased toward **rejecting**. A wrongly-rejected request costs one
 * golfer's course going untracked, and the operator can still add it by hand from the
 * Care thread. A wrongly-accepted one puts a fabricated name in front of a client and
 * potentially sends it to a provider. Those are not symmetric.
 */

/** Words that carry no identity — every other course has them too. */
const GENERIC_TOKENS = new Set([
  "golf", "club", "course", "links", "gc", "cc", "the", "a", "and", "of", "at",
  "my", "our", "home", "local", "new", "old", "national", "park", "hill", "and",
]);

/**
 * Whole names that are placeholders rather than names. Matched after normalising, so
 * "My Home Course", "home course" and "HOME COURSE" all collapse to one entry.
 */
const PLACEHOLDER_NAMES = new Set([
  "home course", "my home course", "home club", "my home club", "my course",
  "my club", "our course", "our club", "the course", "the club", "local course",
  "local club", "course", "club", "golf course", "golf club", "unknown", "unknown course",
  "n/a", "na", "none", "no name", "not specified", "not given", "tbc", "tbd",
]);

/**
 * Phrases that disqualify a name wherever they appear inside it — the model stitches
 * these in when it is describing the course rather than naming it
 * ("HS2 Renovated Course (Home Course)").
 */
const DISQUALIFYING_PHRASES = ["home course", "home club", "my course", "my club"];

function normalise(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s/]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The golfer's own words, without the notification wrapper.
 *
 * ⚠️ This matters more than it looks: the raw body carries a `From:` / `Email:` header
 * block, so `craig@ardlodge.co.uk` is *in* the text. Checking the name against the whole
 * body would have accepted "Ardlodge" — the exact fabrication this is meant to catch.
 * Falls back to the whole text when the markers are absent, which is the permissive
 * direction and therefore the safe one: a format change loses the check, not the import.
 */
export function golferMessage(body: string): string {
  const start = body.search(/^\s*Message:\s*$/mi);
  if (start === -1) return body;
  const rest = body.slice(start).replace(/^\s*Message:\s*$/mi, "");
  const end = rest.search(/^\s*(Attachments\s*\(|This is an automated notification)/mi);
  return (end === -1 ? rest : rest.slice(0, end)).trim();
}

/** Tokens that actually identify a course — the name minus the words every course shares. */
export function distinctiveTokens(name: string): string[] {
  return normalise(name)
    .split(" ")
    .filter((t) => t.length >= 3 && !GENERIC_TOKENS.has(t));
}

export type CourseNameVerdict =
  | { usable: true }
  | { usable: false; reason: "empty" | "placeholder" | "not-in-message" };

/**
 * @param name  the classifier's extracted course name
 * @param body  the feedback the name was extracted FROM (raw body is fine — the
 *              notification wrapper is stripped internally)
 */
export function checkCourseName(name: string, body: string): CourseNameVerdict {
  const trimmed = name.trim();
  if (!trimmed) return { usable: false, reason: "empty" };

  const norm = normalise(trimmed);
  if (!norm) return { usable: false, reason: "empty" };
  if (PLACEHOLDER_NAMES.has(norm)) return { usable: false, reason: "placeholder" };
  if (DISQUALIFYING_PHRASES.some((p) => norm.includes(p))) {
    return { usable: false, reason: "placeholder" };
  }

  const tokens = distinctiveTokens(trimmed);
  // Nothing but generic words — "Golf Club", "The Course".
  if (tokens.length === 0) return { usable: false, reason: "placeholder" };

  // At least one distinctive token must appear in what the golfer actually wrote.
  // ⚠️ ONE, not all: the model routinely corrects spelling ("Iver Golf Vlub" →
  // "Iver Golf Club"), so requiring every token would reject genuine requests for the
  // sake of a typo. One anchor is enough to prove the name came from the message.
  const message = normalise(golferMessage(body));
  if (!tokens.some((t) => message.includes(t))) {
    return { usable: false, reason: "not-in-message" };
  }

  return { usable: true };
}
