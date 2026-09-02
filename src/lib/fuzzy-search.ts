/**
 * Forgiving text search, for finding a known thing in a long list.
 *
 * Built for the Wedge course requests: ~750 rows across New / Sent / Added /
 * Rejected, where the question is almost always "did we already add this course?"
 * and the person asking has half the name and no idea how it was spelled when it
 * came in ("Iver Golf Vlub" is a real row).
 *
 * So it must tolerate: partial words, wrong order, missing letters, transposed
 * letters and outright misspellings — while still ranking the obvious match
 * first. Pure and dependency-free: it runs on every keystroke over a list already
 * in memory, so there is nothing to wait for and no library to pull in.
 */

/** Lowercase, strip accents, and flatten punctuation to spaces. */
export function normalise(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Levenshtein distance, capped.
 *
 * Bailing out once the best possible score exceeds `max` keeps this cheap enough
 * to run against every row on every keystroke — the full matrix over 750 rows
 * would be wasted work when we only care about "within 1 or 2".
 */
export function editDistance(a: string, b: string, max = 3): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
      if (row[j] < best) best = row[j];
    }
    if (best > max) return max + 1;
    prev = row;
  }
  return prev[b.length];
}

/** How much misspelling to forgive, by how much the user typed. */
function tolerance(token: string): number {
  if (token.length <= 3) return 0; // "ard" must be a real prefix, or everything matches
  if (token.length <= 5) return 1;
  return 2;
}

/** True when every character of `token` appears in `text`, in order. */
function isSubsequence(token: string, text: string): boolean {
  let i = 0;
  for (const ch of text) {
    if (ch === token[i]) i++;
    if (i === token.length) return true;
  }
  return false;
}

/**
 * Score one token against one field. Higher is better; 0 means no match.
 *
 * The tiers are ordered by how confident we are that the user meant this row, so
 * an exact name always outranks a lucky subsequence.
 */
function scoreToken(token: string, words: string[], whole: string): number {
  if (!token) return 0;
  if (whole === token) return 1000;
  if (whole.startsWith(token)) return 900;
  for (const w of words) {
    if (w === token) return 880;
    if (w.startsWith(token)) return 850;
  }
  const at = whole.indexOf(token);
  if (at >= 0) return 800 - Math.min(at, 99);

  const tol = tolerance(token);
  if (tol > 0) {
    // A misspelled whole word — "ardlodg" for "ardlodge", "vlub" for "club".
    for (const w of words) {
      const d = editDistance(token, w, tol);
      if (d <= tol) return 700 - d * 60;
    }
    // A misspelling that spans the name, e.g. "iver golf club" vs "iver golf vlub".
    const d = editDistance(token, whole, tol);
    if (d <= tol) return 650 - d * 60;
  }

  // Last resort: the letters are all there in order ("wtsn" → "watson").
  if (token.length >= 3 && isSubsequence(token, whole)) return 400;
  return 0;
}

/**
 * Score a query against one item's searchable fields.
 *
 * EVERY token must match something, so adding a word narrows rather than widens —
 * typing more should never bring back more rows. Field order matters: earlier
 * fields are weighted higher, so a name match beats a note match.
 */
export function fuzzyScore(query: string, fields: (string | null | undefined)[]): number {
  const q = normalise(query);
  if (!q) return 0;
  const tokens = q.split(" ").filter(Boolean);
  const prepared = fields
    .map((f) => normalise(f ?? ""))
    .map((whole) => ({ whole, words: whole.split(" ").filter(Boolean) }));

  let total = 0;
  for (const token of tokens) {
    let best = 0;
    prepared.forEach((field, index) => {
      if (!field.whole) return;
      // 15% off per field position: name, then country, then notes.
      const weighted = scoreToken(token, field.words, field.whole) * (1 - index * 0.15);
      if (weighted > best) best = weighted;
    });
    if (best === 0) return 0; // one unmatched token disqualifies the row
    total += best;
  }
  return total / tokens.length;
}

/** Filter + rank in one pass. Ties keep the input order, so it's stable. */
export function fuzzySearch<T>(
  items: readonly T[],
  query: string,
  getFields: (item: T) => (string | null | undefined)[],
): T[] {
  if (!normalise(query)) return [...items];
  return items
    .map((item, index) => ({ item, index, score: fuzzyScore(query, getFields(item)) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((row) => row.item);
}
