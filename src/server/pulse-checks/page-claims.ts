// ─────────────────────────────────────────────────────────────────────────────
// PAGE CLAIMS — what a page SAYS, read the way a visitor reads it.
//
// The checks that used this were regexes over raw HTML with unbounded `.*`, so a match
// could start in an SVG symbol id and end in minified JSON 300,000 characters later
// (linear.app: `remove.*member` ran from the CSS word 'Removed' to a JSON 'Member').
// A claim here has to sit inside ONE run of text a visitor can read: scripts, styles,
// SVG, comments and tag markup are gone, block elements end a run, inline elements
// (a, span, strong…) do not. A regex is tested against each run on its own, so a
// pattern can never reach across the page.
//
// What this does NOT establish: that a feature exists. A page saying "Bulk actions"
// is the site's own claim, and the detail says so. A page that does not say it says
// nothing about a product Pulse cannot sign in to, which is why the callers report
// absence as INCONCLUSIVE.
// ─────────────────────────────────────────────────────────────────────────────

import type { PulseScanCheckInput } from "@/types/pulse";
import type { CheckCategory } from "./categories";

const INLINE_TAGS = new Set([
  "a", "abbr", "b", "bdi", "bdo", "cite", "code", "data", "dfn", "em", "font", "i", "kbd",
  "label", "mark", "q", "s", "samp", "small", "span", "strong", "sub", "sup", "time", "u", "var", "wbr", "br",
]);

const ENTITIES: Record<string, string> = {
  amp: "&", nbsp: " ", quot: "\"", apos: "'", lt: "<", gt: ">", rsquo: "'", lsquo: "'",
  rdquo: "\"", ldquo: "\"", ndash: "-", mdash: "-", hellip: "...", pound: "£", euro: "€", copy: "©",
};

function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d{1,6});/g, (_, n: string) => safeChar(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]{1,6});/gi, (_, n: string) => safeChar(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name: string) => ENTITIES[name.toLowerCase()] ?? m);
}

function safeChar(code: number): string {
  try {
    return String.fromCodePoint(code);
  } catch {
    return " ";
  }
}

/** The page's readable text, one entry per block of text a visitor sees together. */
export function proseRuns(html: string): string[] {
  const stripped = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|template|noscript|svg|head|iframe|object|canvas|math)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "\n")
    .replace(/<\/?([a-z][a-z0-9-]*)\b[^>]*>/gi, (_, tag: string) => (INLINE_TAGS.has(tag.toLowerCase()) ? " " : "\n"));
  return decodeEntities(stripped)
    .split("\n")
    .map((run) => run.replace(/[ \t\r\f\v ]+/g, " ").trim())
    .filter((run) => run.length > 0);
}

/**
 * The first run the pattern matches, quoted around the match (at most ~140 characters),
 * or null. The pattern is tested against each run separately, so it cannot span blocks.
 */
export function findClaim(runs: readonly string[], pattern: RegExp): string | null {
  const re = new RegExp(pattern.source, pattern.flags.replace("g", ""));
  for (const run of runs) {
    const m = re.exec(run);
    if (!m) continue;
    const start = Math.max(0, m.index - 40);
    const end = Math.min(run.length, m.index + m[0].length + 60);
    return `${start > 0 ? "..." : ""}${run.slice(start, end).trim()}${end < run.length ? "..." : ""}`;
  }
  return null;
}

export type PageAnchor = { href: string; text: string };

/** Every real link on the page: its href and its readable text (or aria-label/title). */
export function pageAnchors(html: string): PageAnchor[] {
  const markup = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|template|svg)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ");
  const out: PageAnchor[] = [];
  const re = /<a\b([^>]*)>([\s\S]{0,2000}?)<\/a\s*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(markup)) !== null) {
    const attrs = m[1];
    const href = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(attrs);
    if (!href) continue;
    const label = /\b(?:aria-label|title)\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(attrs);
    const text = decodeEntities(m[2].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim()
      || decodeEntities(label?.[1] ?? label?.[2] ?? "").trim();
    out.push({ href: decodeEntities(href[1] ?? href[2] ?? "").trim(), text });
  }
  return out;
}

/** The base fields every caller passes through. */
type CheckBase = { category: CheckCategory; checkKey: string; label: string };

/** A claim found on the page: PASS, quoting what was read. */
export function claimSeen(base: CheckBase, what: string, quote: string): PulseScanCheckInput {
  return { ...base, status: "PASS", detail: `${what} The page says: "${quote}"` };
}

/**
 * Nothing on the scanned page speaks to the control. For a control that lives behind
 * sign-in or in a document the scan does not read, that is not evidence of absence.
 */
export function claimUnseen(base: CheckBase, detail: string): PulseScanCheckInput {
  return {
    ...base,
    status: "INCONCLUSIVE",
    confidence: "LOW",
    confidenceReason: "Absence on a public page does not show the control is missing.",
    detail,
  };
}

/** The control does not apply to what was scanned. */
export function claimNotApplicable(base: CheckBase, detail: string): PulseScanCheckInput {
  return { ...base, status: "NOT_APPLICABLE", detail };
}
