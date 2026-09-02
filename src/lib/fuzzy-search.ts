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

/**
 * How much misspelling to forgive, by how much the user typed.
 *
 * Two edits are only allowed from seven characters up. Allowing two on a
 * six-letter token means a third of it can be wrong, which is loose enough to be
 * coincidence: on the live table it made "horley" match forty rows, and it left
 * "dokring" as good a match for "Bowring" as for the "Dorking" that was meant.
 * One edit on four characters is kept deliberately — it is what finds the real row
 * "Iver Golf Vlub" when someone types "club".
 */
function tolerance(token: string): number {
  if (token.length <= 3) return 0; // "ard" must be a real prefix, or everything matches
  if (token.length <= 6) return 1;
  return 2;
}

/** Characters two strings agree on from the start. */
function sharedPrefix(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
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
 * How much longer than the query a text may be and still count as a subsequence
 * match, and the shortest query the rule applies to at all.
 *
 * This bound is the whole rule, not a tuning knob. A subsequence is only evidence
 * when the text is about as long as what was typed — "wtsn" inside "watson" means
 * something; the same nine letters spread across a 600-character support email
 * mean nothing, because in a text that long almost any ordinary sequence of
 * letters can be found in order.
 *
 * Without this bound, searching the live table for "Jamestown" — a course that is
 * not in it — returned 33 rows, every one scoring 400 against the `notes` field
 * and none of them containing the word. The fallback had become a near-universal
 * match on any row with a long note.
 */
const SUBSEQ_MAX_TEXT_RATIO = 2.5;
const SUBSEQ_MIN_TOKEN = 4;

/**
 * The longest a field may be and still be matched FUZZILY (typo or subsequence).
 *
 * Same principle as the subsequence bound, one tier up. A name is short and
 * identity-bearing, so "ardlodg" being one letter off "ardlodge" is real evidence.
 * A 600-character support email is prose: it contains hundreds of words, so one of
 * them is nearly always within edit distance 2 of whatever was typed. Searching the
 * live table for "St Andrews" matched an unrelated row because "andrews" was
 * within two edits of some word buried in its note.
 *
 * Long fields are still searched — they just have to match on solid evidence: an
 * exact word, a word prefix, or a literal substring. That is what makes searching
 * "antrim" find the row whose note reads "Antrim, Allen Park, 18 holes".
 */
const FUZZY_MAX_FIELD = 120;

/** Below this length a token must match a word's START, never its middle. */
const MIN_TOKEN_FOR_MIDWORD = 3;

/** A subsequence match, but only where the text is short enough to mean it. */
function subsequenceMatch(
  token: string,
  words: string[],
  whole: string,
): boolean {
  if (token.length < SUBSEQ_MIN_TOKEN) return false;
  const limit = token.length * SUBSEQ_MAX_TEXT_RATIO;
  // Spanning several words ("iverglf" for "Iver Golf Vlub") is legitimate, so the
  // whole field is eligible — but only while the whole field is itself short.
  if (whole.length <= limit && isSubsequence(token, whole)) return true;
  return words.some((w) => w.length <= limit && isSubsequence(token, w));
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
  // Fuzzy tiers are only meaningful against a short, identity-bearing field.
  const fuzzy = whole.length <= FUZZY_MAX_FIELD;

  if (fuzzy) {
    const tol = tolerance(token);
    if (tol > 0) {
      // A misspelled whole word — "ardlodg" for "ardlodge", "vlub" for "club".
      // Ranked ABOVE a mid-word substring: a word that is one letter off what was
      // typed is stronger evidence than the letters turning up inside a longer
      // word. Ranking these the other way round made "iver golf club" return
      // "Dodge Riverside Golf Club" ahead of the actual "Iver Golf Vlub", because
      // "iver" sits inside "riverside".
      let bestTypo = 0;
      for (const w of words) {
        const d = editDistance(token, w, tol);
        if (d > tol) continue;
        // Break ties on how far the two agree from the start. Two words can sit
        // the same edit distance away while only one of them plausibly began the
        // way the user typed: "dokring" is two edits from both "dorking" and
        // "bowring", and only the first shares an opening.
        const score = 840 - d * 60 + sharedPrefix(token, w) * 2;
        if (score > bestTypo) bestTypo = score;
      }
      if (bestTypo > 0) return bestTypo;
    }
  }

  // A literal substring somewhere in the middle of a word or field. Weak on its
  // own, so a very short token is not allowed to match this way: "st" appears
  // inside "Wyboston", which is how an unrelated row surfaced for "St Andrews".
  const at = token.length >= MIN_TOKEN_FOR_MIDWORD ? whole.indexOf(token) : -1;
  if (at >= 0) return 700 - Math.min(at, 99);

  if (fuzzy) {
    const tol = tolerance(token);
    // A misspelling that spans the name, e.g. "iver golf club" vs "iver golf vlub".
    if (tol > 0 && editDistance(token, whole, tol) <= tol) return 560;
    // Last resort: the letters are all there in order ("wtsn" → "watson"), in a
    // text short enough for that to be evidence rather than coincidence.
    if (subsequenceMatch(token, words, whole)) return 400;
  }
  return 0;
}

/**
 * Score a query against one item's searchable fields.
 *
 * EVERY token must match something, so adding a word narrows rather than widens —
 * typing more should never bring back more rows. Field order matters: earlier
 * fields are weighted higher, so a name match beats a note match.
 */
export function fuzzyScore(
  query: string,
  fields: (string | null | undefined)[],
): number {
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
      const weighted =
        scoreToken(token, field.words, field.whole) * (1 - index * 0.15);
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
    .map((item, index) => ({
      item,
      index,
      score: fuzzyScore(query, getFields(item)),
    }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((row) => row.item);
}
