/**
 * Matching an outside planning tool's item titles to Foundry task titles.
 *
 * Ported from the read-only comparison of Big Wedge's Forge plan against the Wedge board
 * (Nov 2026), whose rules were checked by hand against real pairs. The two lists sit at
 * different levels — the client plans features ("Bag Management"), the team splits the work
 * ("Bag management Updates - IOS") — so only an EXACT match is ever acted on without a person
 * looking. Everything looser is a suggestion for review.
 */

const PLATFORM = "(?:ios|android|wedge android|web|admin|backend|api|both|ios and android|android and ios|ios & android)";
const TRAILING_PLATFORM = new RegExp(`\\s*[-–—|(]+\\s*${PLATFORM}\\s*[).]*\\s*$`);
const PREFIX = /^(review item|subtask \d+(\.\d+)?|bug|feedback|backend|frontend|qa|task|feature|deployment|\d+(\.\d+)?)\s*[:.-]\s*/i;
const STOP = new Set(
  "a an the and or of to for in on at with by from is be as it its this that into via per new add update updated updates create make fix fixes fixed feature features page screen should will can our your user users app big wedge".split(
    " ",
  ),
);

/**
 * Case, punctuation, spacing, "&" and a trailing platform tag (" - IOS") don't count.
 * With `keepPlatform`, the platform tag DOES count: that's the form an exact match uses, because
 * "Bag Management - iOS" is one platform's slice of the work, not the feature itself.
 */
export function normaliseTitle(s: string | null | undefined, opts: { keepPlatform?: boolean } = {}): string {
  let t = (s ?? "").normalize("NFKC").toLowerCase();
  t = t.replace(/&/g, " and ").replace(/[’‘]/g, "'");
  if (!opts.keepPlatform) t = t.replace(TRAILING_PLATFORM, "");
  t = t.replace(/[^a-z0-9' ]+/g, " ").replace(/'/g, "");
  return t.replace(/\s+/g, " ").trim();
}

/** As normaliseTitle, after dropping the team's prefixes ("Review Item:", "Subtask 4.2:", "Backend:"). */
export function strippedTitle(s: string | null | undefined): string {
  let t = (s ?? "").trim();
  for (let i = 0; i < 3; i++) {
    const n = t.replace(PREFIX, "").trim();
    if (n === t) break;
    t = n;
  }
  return normaliseTitle(t);
}

/** Distinctive words, lightly stemmed ("leaderboards" → "leaderboard", "stories" → "story"). */
export function titleTokens(normalised: string): Set<string> {
  const out = new Set<string>();
  for (const raw of normalised.split(" ")) {
    if (raw.length < 2 || STOP.has(raw)) continue;
    out.add(raw.replace(/ies$/, "y").replace(/(?<=[a-z]{3})s$/, ""));
  }
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  const union = new Set([...a, ...b]);
  if (union.size === 0) return 0;
  let shared = 0;
  for (const x of a) if (b.has(x)) shared++;
  return shared / union.size;
}

/**
 * Python's difflib.SequenceMatcher(None, a, b).ratio(): 2 × matched characters ÷ total length,
 * matching blocks found by repeatedly taking the longest common substring. (No autojunk: the
 * titles here are far shorter than the 200 characters where difflib would apply it.)
 */
export function sequenceRatio(a: string, b: string): number {
  const total = a.length + b.length;
  if (total === 0) return 1;
  const matched = (aLo: number, aHi: number, bLo: number, bHi: number): number => {
    if (aLo >= aHi || bLo >= bHi) return 0;
    let bestI = aLo;
    let bestJ = bLo;
    let bestK = 0;
    let prev = new Array<number>(bHi - bLo + 1).fill(0);
    for (let i = aLo; i < aHi; i++) {
      const cur = new Array<number>(bHi - bLo + 1).fill(0);
      for (let j = bLo; j < bHi; j++) {
        if (a[i] === b[j]) {
          const k = prev[j - bLo] + 1;
          cur[j - bLo + 1] = k;
          // difflib keeps the earliest longest block (smallest i, then smallest j).
          if (k > bestK) {
            bestK = k;
            bestI = i - k + 1;
            bestJ = j - k + 1;
          }
        }
      }
      prev = cur;
    }
    if (bestK === 0) return 0;
    return bestK + matched(aLo, bestI, bLo, bestJ) + matched(bestI + bestK, aHi, bestJ + bestK, bHi);
  };
  return (2 * matched(0, a.length, 0, b.length)) / total;
}

export type MatchKind = "exact" | "probable";

/** Longest title spelling similarity is computed for (see compareTitles). */
const SPELLING_CAP = 160;

export interface TitleMatch {
  kind: MatchKind;
  score: number;
  why: string;
}

export interface Titled {
  /** Normalised, platform tag kept: the only form an exact match may use. */
  x: string;
  /** Normalised, platform tag dropped. */
  n: string;
  ns: string;
  tk: Set<string>;
}

/**
 * Matching compares every feed item with every task (n × m), and the cost of comparing two
 * titles grows with the product of their lengths. Feed titles are capped at parse time
 * (FEED_LIMITS.title); task titles are capped at 200 by the validator. This cap holds the
 * comparison bounded whatever reaches it.
 */
export const MATCH_TITLE_CAP = 500;

export function titled(title: string): Titled {
  const t = title.slice(0, MATCH_TITLE_CAP);
  const ns = strippedTitle(t);
  return { x: normaliseTitle(t, { keepPlatform: true }), n: normaliseTitle(t), ns, tk: titleTokens(ns) };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Exact, probable, or no match at all. Only "exact" is ever acted on without review. */
export function compareTitles(a: Titled, b: Titled): TitleMatch | null {
  if (a.x && a.x === b.x) return { kind: "exact", score: 1, why: "same title" };
  // Equal only once a platform tag is dropped: one platform's slice of the work, so a person
  // decides, never the importer.
  if (a.n && a.n === b.n) return { kind: "probable", score: 0.995, why: "same title apart from a platform tag" };
  if (a.ns && a.ns === b.ns) return { kind: "probable", score: 0.99, why: 'same title once a prefix like "Review Item:" is removed' };
  const j = jaccard(a.tk, b.tk);
  // Spelling similarity is for titles; past a paragraph it's both meaningless and slow.
  const r = a.ns.length <= SPELLING_CAP && b.ns.length <= SPELLING_CAP ? sequenceRatio(a.ns, b.ns) : 0;
  const union = new Set([...a.tk, ...b.tk]).size;
  if ((j >= 0.85 && union >= 2) || (r >= 0.85 && Math.min(a.ns.length, b.ns.length) >= 8)) {
    const why = j >= 0.85 && union >= 2 ? "the same key words" : `similar spelling (${Math.round(r * 100)}%)`;
    return { kind: "probable", score: Math.round(Math.max(j, r) * 1000) / 1000, why };
  }
  let shared = 0;
  for (const x of a.tk) if (b.tk.has(x)) shared++;
  if (a.ns && b.ns && shared >= 3) {
    const aInB = new RegExp(`\\b${escapeRegExp(a.ns)}\\b`).test(b.ns);
    const bInA = new RegExp(`\\b${escapeRegExp(b.ns)}\\b`).test(a.ns);
    if (aInB || bInA) return { kind: "probable", score: Math.round(j * 1000) / 1000, why: `one title contains the other (${shared} shared words)` };
  }
  return null;
}
