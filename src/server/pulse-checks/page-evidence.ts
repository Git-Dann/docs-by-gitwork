/**
 * The words a visitor can read on a page, and bounded phrase matching over them.
 *
 * The checks this replaces ran `.*` regexes over raw HTML. A minified page is a few very
 * long lines, so `role.*level` joined `role="navigation"` to "the next level" in a
 * paragraph, and `strong.*password` ran 174,344 characters from a `<strong>` tag to a
 * password field on linear.app (Oct 2026 audit). Reading the visible copy removes the
 * markup, scripts and JSON those spans ran through; every pattern used on it must still
 * keep its gaps short and inside one sentence (`[^.!?]{0,40}`), never `.*`.
 */
import { stripNonMarketContext } from "./jurisdictions";
import { findClaim, proseRuns } from "./page-claims";

/**
 * Visible text: scripts, styles, SVG, JSON payloads and comments removed, tags stripped,
 * common entities decoded, whitespace collapsed. With `withAltText`, an element's alt,
 * aria-label and title are kept in its place, so a badge that is only an image counts.
 */
export function visibleCopy(html: string, opts: { withAltText?: boolean } = {}): string {
  return stripNonMarketContext(html)
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg\s*>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript\s*>/gi, " ")
    .replace(/<[^>]+>/g, (tag) => opts.withAltText
      ? ` ${[...tag.matchAll(/\s(?:alt|aria-label|title)\s*=\s*["']([^"']*)["']/gi)].map((m) => m[1]).join(" ")} `
      : " ")
    .replace(/&nbsp;|&#160;|&#xa0;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;|&#x27;|&apos;|&rsquo;|&#8217;/gi, "'")
    .replace(/&quot;|&#34;/gi, "\"")
    .replace(/&pound;|&#163;|&#xa3;/gi, "£")
    .replace(/&euro;|&#8364;|&#x20ac;/gi, "€")
    .replace(/&dollar;|&#36;|&#x24;/gi, "$")
    .replace(/&yen;|&#165;/gi, "¥")
    .replace(/&#8377;|&#x20b9;/gi, "₹")
    .replace(/\s+/g, " ")
    .trim();
}

/** The first match of a bounded pattern, trimmed for quoting in a detail line. */
export function firstPhrase(text: string, re: RegExp): string | null {
  const m = re.exec(text);
  if (!m) return null;
  const s = m[0].replace(/\s+/g, " ").trim();
  return s.length > 90 ? `${s.slice(0, 87)}…` : s;
}

/**
 * Social proof a visitor can see: testimonials, customer stories, case studies, "trusted
 * by", ratings with a number, or Review / AggregateRating markup. Whole words only:
 * "review" is inside "preview" and "rating" inside "operating" and "migrating", and a
 * bare "Reviews" can be a product feature name (linear.app's code reviews).
 */
export function socialProofEvidence(html: string): string | null {
  return findClaim(proseRuns(html), /\btestimonials?\b|\b(?:customer|success) stor(?:y|ies)\b|\bcase stud(?:y|ies)\b|\btrusted by\b|\bloved by\b|\bused by (?:over |more than )?\d[\d,.]*\s*(?:k|m|million|thousand)?\+?\s*(?:teams|companies|customers|businesses|developers|people|users)\b|\b(?:customer|user|client|5-star|five-star) reviews?\b|\b\d[\d,.]*k?\+?\s+(?:reviews|ratings)\b|\breviews? (?:from|on) (?:G2|Capterra|Trustpilot|the App Store|Google)\b|\brated [1-5](?:\.\d)?\s*(?:\/\s*5|out of 5|stars?)\b|\b[1-5](?:\.\d)?\s*(?:\/\s*5|out of 5)\s*(?:stars?|rating)\b|\bwhat (?:our )?(?:customers|clients|users) (?:say|are saying)\b/i)
    ?? (/"@type"\s*:\s*"(?:AggregateRating|Review)"/.test(html) ? "AggregateRating / Review markup" : null);
}
