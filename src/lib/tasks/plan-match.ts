/**
 * Plan-first task entry: recognise a new task as work that is ALREADY on the plan, and
 * suggest which category a genuinely new task belongs in.
 *
 * Why this exists (October 2026): developers were completing ~700 tasks a month, but 583
 * of them were created and closed the same day and almost none sat in a category. The
 * daily update asks "what are you working on today?" and a fresh task was the quickest
 * answer — so the planned tasks never moved and every project looked stalled while the
 * work was really happening. Nothing asked "is this one of the tasks we already planned?".
 *
 * Pure and framework-free, so the task form, My Day and the board's sort tool all rank
 * with ONE rule and can never disagree.
 *
 * The method is deliberately small: IDF-weighted word overlap with light stemming and a
 * one-edit typo allowance. Task titles are short, so heavier machinery (embeddings, an LLM)
 * would cost money on every keystroke for no measurable gain. Two properties matter more
 * than recall:
 *
 *  - **Generic words carry no weight.** "Fix", "add", "update", "screen" appear in half the
 *    board. Matching on them is how a suggestion box becomes noise that people learn to
 *    ignore, which is worse than no suggestion box.
 *  - **Quiet when unsure.** A suggestion has to clear a threshold; below it nothing is
 *    shown. A wrong "this is already on the plan" sends someone to the wrong task.
 */

/** Words that say nothing about WHICH piece of work a task is. */
const STOPWORDS = new Set([
  // grammar
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "has", "have", "in",
  "into", "is", "it", "its", "of", "on", "or", "so", "than", "that", "the", "their",
  "them", "then", "there", "these", "this", "those", "to", "up", "via", "was", "we",
  "were", "when", "where", "which", "while", "with", "within", "without", "our", "your",
  "all", "any", "some", "more", "also", "not", "no", "can", "should", "will", "need",
  "needs", "per", "etc", "i", "my", "me", "us", "you", "after", "before", "only", "both",
  // task filler — verbs that describe doing work, not the work
  "add", "added", "adding", "fix", "fixed", "fixes", "fixing", "update", "updated",
  "updates", "updating", "implement", "implemented", "implementing", "implementation",
  "create", "created", "creating", "make", "making", "build", "building", "improve",
  "improved", "improving", "improvement", "improvements", "review", "reviewed", "reviewing",
  "check", "checked", "checking", "test", "tested", "tests", "testing", "verify", "verified",
  "support", "supported", "set", "setup", "handle", "handled", "handling", "ensure",
  "display", "displayed", "show", "showing", "allow", "enable", "enabled", "change",
  "changes", "changed", "remove", "removed", "issue", "issues", "task", "tasks", "work",
  "working", "new", "existing", "related", "identified", "found", "use", "using", "used",
  "get", "getting", "proper", "properly", "correct", "correctly", "minor", "small",
  "various", "general", "initial", "final", "done", "wip", "todo", "follow", "followup",
  "integrate", "integration", "integrated", "investigate", "investigated", "resolve",
  "resolved", "refactor", "refactored", "cleanup", "clean", "functionality", "feature",
  "features", "continue", "continued", "continuing", "complete", "completed", "completing",
  "remaining", "required", "requirement", "requirements", "latest", "build", "builds",
  "according", "accordingly", "approach", "proposed", "address", "addressed", "item",
  "flow", "flows", "scenario", "scenarios", "option", "options",
]);

/**
 * Platform tags ("- IOS", "Android:", "web app"). They narrow a match but say nothing about
 * WHICH work it is — "Added peer round verification - IOS" is not related to "iOS
 * subscription setup". They count toward a score, but a match can never rest on them alone.
 * (A category NAMED for a platform — YourGroop's "Backend", "Mobile" — still matches by name.)
 */
const PLATFORM_WORDS = new Set([
  "io", "ios", "android", "web", "webapp", "flutter", "mobile", "backend", "frontend",
  "staging", "preprod", "prod", "production", "app", "apps", "dashboard", "admin", "ui", "ux",
]);
const isTopical = (t: string) => !PLATFORM_WORDS.has(t);

/** Minimal suffix stripping — enough that "downloads", "downloading" and "download" meet. */
export function stem(word: string): string {
  let w = word;
  if (w.length > 5 && w.endsWith("ing")) w = w.slice(0, -3);
  else if (w.length > 4 && w.endsWith("ied")) w = `${w.slice(0, -3)}y`;
  else if (w.length > 4 && w.endsWith("ed")) w = w.slice(0, -2);
  else if (w.length > 4 && w.endsWith("ies")) w = `${w.slice(0, -3)}y`;
  else if (w.length > 4 && /(ss|x|ch|sh)es$/.test(w)) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) w = w.slice(0, -1);
  // "downloading" → "download"; a doubled final consonant from -ing/-ed ("mapped") folds too.
  if (w.length > 4 && /([bdgmnprt])\1$/.test(w)) w = w.slice(0, -1);
  return w;
}

/** The meaningful words of a title, as stems. Order and duplicates are not kept. */
export function terms(text: string): string[] {
  const out = new Set<string>();
  for (const raw of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length < 2) continue;
    if (/^\d+$/.test(raw)) continue;
    if (STOPWORDS.has(raw)) continue;
    const s = stem(raw);
    if (s.length < 2 || STOPWORDS.has(s)) continue;
    out.add(s);
  }
  return [...out];
}

/**
 * Drop words that say nothing on THIS board — pass the client's name. "Wedge" is in half of
 * Wedge's titles, so "UI tweaks on the wedge android app" was offered "Wedge Verified
 * Courses" on the strength of the product's own name.
 */
function withoutWords(draft: string[], ignore: string | undefined): string[] {
  if (!ignore) return draft;
  const drop = new Set(terms(ignore));
  return draft.filter((t) => !drop.has(t));
}

/** Levenshtein distance, stopping early once it exceeds `max`. */
function editDistanceWithin(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return false;
    prev = cur;
  }
  return prev[b.length] <= max;
}

/**
 * How strongly two stems count as the same word: 1 for equal, 0.8 for a typo or a
 * clear prefix ("auth" / "authentication"), else 0. Short words must match exactly —
 * at three letters one edit turns almost anything into anything.
 */
function termAffinity(a: string, b: string): number {
  if (a === b) return 1;
  const short = a.length <= b.length ? a : b;
  const long = a.length <= b.length ? b : a;
  if (short.length >= 4 && long.startsWith(short) && long.length - short.length >= 2) return 0.8;
  if (short.length >= 5 && editDistanceWithin(a, b, 1)) return 0.8;
  return 0;
}

export interface PlanCandidate {
  id: string;
  title: string;
  /** The category (feature block) name, when the task has one. Weighted lower than the title. */
  categoryName?: string | null;
}

interface IndexedDoc<T> {
  item: T;
  titleTerms: string[];
  categoryTerms: string[];
}

/**
 * Inverse document frequency over a corpus of term lists. A word on every task (the
 * product's name, "app") is worth almost nothing; a word on one task is worth a lot.
 */
function idfTable(docs: string[][]): (term: string) => number {
  const df = new Map<string, number>();
  for (const d of docs) for (const t of new Set(d)) df.set(t, (df.get(t) ?? 0) + 1);
  const n = Math.max(docs.length, 1);
  return (term: string) => Math.log(1 + n / (1 + (df.get(term) ?? 0)));
}

export interface PlanMatch<T> {
  item: T;
  /** 0..1 — cosine-style overlap of the IDF-weighted terms. */
  score: number;
  /** Words from the candidate's own title that matched, as written there — for highlighting. */
  matchedWords: string[];
}

/** Below this a match is not shown. Tuned against real board titles — see the tests. */
export const MATCH_THRESHOLD = 0.34;
/** A match resting on ONE shared word needs to be much closer ("Q/A feedback" ≈ "General Feedback"). */
const SINGLE_TERM_THRESHOLD = 0.55;

/**
 * Overlap between a draft and one document: the IDF mass of the draft's terms that found
 * a partner, over the geometric mean of both sides' mass. Symmetric enough that a long
 * planned title is not punished for carrying detail the quick draft left out — the
 * denominator uses the SMALLER side's mass more heavily, because the draft is usually
 * the short one and is the thing being asked about.
 */
function overlap(
  draft: string[],
  docTitle: string[],
  docCategory: string[],
  idf: (t: string) => number,
): { score: number; matched: Set<string> } {
  if (draft.length === 0 || docTitle.length === 0) return { score: 0, matched: new Set() };
  let shared = 0;
  const matched = new Set<string>();
  for (const d of draft) {
    let best = 0;
    let bestTerm: string | null = null;
    for (const t of docTitle) {
      const a = termAffinity(d, t);
      if (a > best) {
        best = a;
        bestTerm = t;
      }
    }
    // A category name is context, not the task itself: worth half a title word.
    for (const t of docCategory) {
      const a = termAffinity(d, t) * 0.5;
      if (a > best) {
        best = a;
        bestTerm = null;
      }
    }
    if (best > 0) {
      shared += best * idf(d);
      if (bestTerm) matched.add(bestTerm);
    }
  }
  const mass = (ts: string[]) => ts.reduce((s, t) => s + idf(t), 0);
  const draftMass = mass(draft);
  const docMass = mass(docTitle);
  const small = Math.min(draftMass, docMass);
  const large = Math.max(draftMass, docMass);
  const denom = Math.sqrt(small * (small * 0.6 + large * 0.4));
  return { score: denom > 0 ? Math.min(1, shared / denom) : 0, matched };
}

/** Words of `title` whose stem is in `stems`, in their original spelling. */
function wordsFor(title: string, stems: Set<string>): string[] {
  const out: string[] = [];
  for (const raw of title.split(/[^A-Za-z0-9]+/)) {
    if (!raw) continue;
    const s = stem(raw.toLowerCase());
    if (stems.has(s) && !out.includes(raw)) out.push(raw);
  }
  return out;
}

/**
 * The planned tasks a draft title most likely refers to, best first. Empty when the draft
 * is too vague to match on (no meaningful words) or nothing clears the threshold.
 *
 * ⚠️ A match needs at least one EXACT shared term, not only typo/prefix ones. Two near-
 * misses on different words ("payment" ~ "payments" is exact after stemming; "stream" ~
 * "streak" is a typo) are how a confident suggestion ends up naming unrelated work.
 */
export function matchPlannedTasks<T extends PlanCandidate>(
  draftTitle: string,
  candidates: readonly T[],
  opts: { limit?: number; threshold?: number; ignoreWords?: string } = {},
): PlanMatch<T>[] {
  const draft = withoutWords(terms(draftTitle), opts.ignoreWords);
  if (draft.length === 0 || candidates.length === 0) return [];
  const docs: IndexedDoc<T>[] = candidates.map((item) => ({
    item,
    titleTerms: terms(item.title),
    categoryTerms: item.categoryName ? terms(item.categoryName) : [],
  }));
  const idf = idfTable([...docs.map((d) => d.titleTerms), draft]);
  const threshold = opts.threshold ?? MATCH_THRESHOLD;

  // A draft with three or more meaningful words must share at least two of them. One
  // shared word out of five is how "Address QA feedback on staging" was offered "General
  // Feedback and Updates" — confident-looking, and about something else.
  const minShared = draft.length >= 3 ? 2 : 1;

  const out: PlanMatch<T>[] = [];
  const seenTitles = new Set<string>();
  for (const doc of docs) {
    const exactShared = draft.some((d) => isTopical(d) && doc.titleTerms.includes(d));
    if (!exactShared) continue;
    const { score, matched } = overlap(draft, doc.titleTerms, doc.categoryTerms, idf);
    if (score < threshold || matched.size < minShared) continue;
    // One shared word has to carry the whole match, so it has to be a strong one.
    if (matched.size === 1 && score < SINGLE_TERM_THRESHOLD) continue;
    out.push({ item: doc.item, score, matchedWords: wordsFor(doc.item.title, matched) });
  }
  out.sort((a, b) => b.score - a.score);
  // Identical titles are one suggestion, not three — imported boards repeat them.
  return out
    .filter((m) => {
      const key = m.item.title.trim().toLowerCase();
      if (seenTitles.has(key)) return false;
      seenTitles.add(key);
      return true;
    })
    .slice(0, opts.limit ?? 3);
}

export interface CategoryOption {
  id: string;
  name: string;
}

export interface CategorySuggestion {
  categoryId: string;
  score: number;
  /** Plain-English reason shown beside the suggestion. */
  reason: string;
}

/** Category suggestions need a clear winner, not merely a best guess. */
export const CATEGORY_THRESHOLD = 0.3;
const CATEGORY_MARGIN = 0.08;

/**
 * Which category a new task belongs in, from its title alone: either the category's own
 * name matches ("Payments" for "Stripe payments retry"), or the tasks already in it do.
 * Returns null when no category is a clear winner — the form then asks rather than guesses.
 */
export function suggestCategory(
  draftTitle: string,
  categories: readonly CategoryOption[],
  tasks: readonly { title: string; categoryId: string | null }[],
  opts: { ignoreWords?: string } = {},
): CategorySuggestion | null {
  const draft = withoutWords(terms(draftTitle), opts.ignoreWords);
  if (draft.length === 0 || categories.length === 0) return null;
  const taskTerms = tasks.map((t) => ({ categoryId: t.categoryId, title: t.title, terms: terms(t.title) }));
  const idf = idfTable([...taskTerms.map((t) => t.terms), ...categories.map((c) => terms(c.name)), draft]);

  const scored = categories.map((c) => {
    const nameTerms = terms(c.name);
    // ⚠️ EXACT words only, for the name and for the tasks. A typo or prefix allowance put
    // "Back button" in a category called "Backlog" and "Streaks" beside "streaming" — two
    // real, different words one edit apart. Typo tolerance is for spotting the SAME task;
    // a category is a judgement and has to rest on a word the title actually shares.
    // A name made only of platform words ("Backend", "Mobile") may match on them; a name
    // with a topic ("Analytics dashboard") must match on the topic — "Dark-mode audit
    // across dashboard" is not analytics work.
    const nameTopical = nameTerms.some(isTopical);
    const nameScore = nameTerms.some((n) => draft.includes(n) && (!nameTopical || isTopical(n)))
      ? Math.min(1, overlap(draft, nameTerms, [], idf).score * 1.1)
      : 0;
    const sims = taskTerms
      .filter((t) => t.categoryId === c.id && t.terms.some((x) => isTopical(x) && draft.includes(x)))
      .map((t) => ({ title: t.title, score: overlap(draft, t.terms, [], idf).score }))
      .sort((a, b) => b.score - a.score);
    // The two closest tasks, so one lucky title can't carry a category on its own: a
    // category with a single similar task is discounted, not ignored.
    const top = sims.slice(0, 2);
    const taskScore =
      top.length === 0 ? 0 : top.length === 1 ? top[0].score * 0.75 : (top[0].score + top[1].score) / 2;
    const best = Math.max(nameScore, taskScore);
    const reason =
      nameScore >= taskScore
        ? "Matches its name"
        : `Similar to “${top[0].title}”`;
    return { categoryId: c.id, score: best, reason };
  });
  scored.sort((a, b) => b.score - a.score);
  const [first, second] = scored;
  if (!first || first.score < CATEGORY_THRESHOLD) return null;
  if (second && first.score - second.score < CATEGORY_MARGIN) return null;
  return first;
}

const PRIORITY_RANK: Record<string, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
const STATUS_RANK: Record<string, number> = { DOING: 0, TODO: 1, BACKLOG: 2 };

/**
 * Order planned work for "pick something up": higher priority first, then the earliest
 * due date (undated last — no date is not the same as "due now"), then To do before
 * Backlog, then the board's own order. Deterministic so the list doesn't reshuffle on a
 * refetch.
 */
export function rankPlanQueue<
  T extends { priority: string; dueDate: string | null; status: string; orderKey: number; id: string },
>(tasks: readonly T[]): T[] {
  return [...tasks].sort((a, b) => {
    const p = (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9);
    if (p) return p;
    const ad = a.dueDate ? Date.parse(a.dueDate) : Number.POSITIVE_INFINITY;
    const bd = b.dueDate ? Date.parse(b.dueDate) : Number.POSITIVE_INFINITY;
    if (ad !== bd) return ad - bd;
    const s = (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9);
    if (s) return s;
    return a.orderKey - b.orderKey || a.id.localeCompare(b.id);
  });
}
