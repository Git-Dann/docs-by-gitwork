/**
 * DevSignal coding-challenge catalog (the in-code SEED). Each challenge is a
 * real, delivery-flavoured task — not a LeetCode puzzle — tagged by the role(s),
 * stack(s), seniority and competencies it measures, so an assessment serves the
 * RIGHT challenge for the candidate rather than one default.
 *
 * These rows seed the `DevSignalChallenge` table on boot (see challenge-store.ts);
 * from then on the bank is grown/edited in the admin UI without a deploy. The
 * accessors read the DB with this array as a fallback.
 *
 * EXECUTION IS BROWSER-ONLY (a sandboxed Web Worker in the candidate's browser,
 * never on Foundry infra). That worker runs JavaScript, so every challenge here
 * is authored in plain JS that runs as-is. TypeScript-flavoured tasks are written
 * in JS-compatible form. Other stacks (Python, Go) need a Pyodide/Piston runner —
 * a separate slice; we tag `language` for them but do NOT ship un-runnable tasks.
 *
 * Hidden tests travel to the browser at run time; only the count is shown in the
 * UI, and the server re-derives the score from the reported results + telemetry.
 */

export interface ChallengeTest {
  name: string;
  /** Args applied to the candidate's `functionName`. */
  args: unknown[];
  expected: unknown;
  /** Hidden tests are not surfaced individually to the candidate. */
  hidden?: boolean;
}

export type ChallengeLanguage = "javascript" | "typescript";
export type ChallengeDifficulty = "junior" | "mid" | "senior" | "staff";

export interface DevSignalChallenge {
  id: string;
  title: string;
  language: ChallengeLanguage;
  difficulty: ChallengeDifficulty;
  /** Roles this challenge is a good signal for (e.g. backend, frontend, data). */
  roles: string[];
  /** Declared stacks this maps to (e.g. javascript, typescript, node, react). */
  stacks: string[];
  /** Named competencies the task measures — drives explainability + matching. */
  competencies: string[];
  promptMarkdown: string;
  /** The function the candidate must implement; tests call it. */
  functionName: string;
  starterCode: string;
  timeLimitSec: number;
  tests: ChallengeTest[];
}

export const CHALLENGES: DevSignalChallenge[] = [
  {
    id: "js-normalise-invoices",
    title: "Normalise invoice totals",
    language: "javascript",
    difficulty: "junior",
    roles: ["backend", "fullstack"],
    stacks: ["javascript", "typescript", "node"],
    competencies: ["correctness", "data-modelling"],
    functionName: "invoiceTotal",
    timeLimitSec: 1500,
    promptMarkdown: [
      "Implement `invoiceTotal(lineItems)`.",
      "",
      "Each line item is `{ qty, unitPrice, taxRate }` (taxRate is a decimal, e.g. `0.2`).",
      "Return the grand total (sum of `qty * unitPrice * (1 + taxRate)`), rounded to 2 decimals.",
      "An empty list totals `0`.",
    ].join("\n"),
    starterCode: "function invoiceTotal(lineItems) {\n  // your code here\n}\n",
    tests: [
      { name: "empty", args: [[]], expected: 0 },
      { name: "single no tax", args: [[{ qty: 2, unitPrice: 10, taxRate: 0 }]], expected: 20 },
      { name: "single with tax", args: [[{ qty: 1, unitPrice: 100, taxRate: 0.2 }]], expected: 120 },
      {
        name: "multi rounds",
        args: [[
          { qty: 3, unitPrice: 9.99, taxRate: 0.2 },
          { qty: 1, unitPrice: 5, taxRate: 0.05 },
        ]],
        expected: 41.21,
        hidden: true,
      },
    ],
  },
  {
    id: "js-format-duration",
    title: "Human-readable durations",
    language: "javascript",
    difficulty: "junior",
    roles: ["frontend", "fullstack"],
    stacks: ["javascript", "typescript"],
    competencies: ["correctness", "communication"],
    functionName: "formatDuration",
    timeLimitSec: 1200,
    promptMarkdown: [
      "Implement `formatDuration(seconds)` (a non-negative integer).",
      "",
      "Return a compact `\"Hh Mm Ss\"` string, **omitting any unit whose value is 0**,",
      "units space-separated in `h m s` order. If the total is `0`, return `\"0s\"`.",
      "",
      "Examples: `65` → `\"1m 5s\"`, `3600` → `\"1h\"`, `3661` → `\"1h 1m 1s\"`.",
    ].join("\n"),
    starterCode: "function formatDuration(seconds) {\n  // your code here\n}\n",
    tests: [
      { name: "zero", args: [0], expected: "0s" },
      { name: "seconds only", args: [59], expected: "59s" },
      { name: "minutes and seconds", args: [65], expected: "1m 5s" },
      { name: "hours only", args: [3600], expected: "1h" },
      { name: "all units", args: [3661], expected: "1h 1m 1s" },
      { name: "minutes only", args: [120], expected: "2m", hidden: true },
      { name: "hours and minutes", args: [3660], expected: "1h 1m", hidden: true },
    ],
  },
  {
    id: "js-group-by-owner",
    title: "Group tasks by owner",
    language: "javascript",
    difficulty: "mid",
    roles: ["backend", "data", "fullstack"],
    stacks: ["javascript", "typescript", "node"],
    competencies: ["data-modelling", "correctness"],
    functionName: "groupByOwner",
    timeLimitSec: 1800,
    promptMarkdown: [
      "Implement `groupByOwner(tasks)`.",
      "",
      "Given `[{ id, owner, done }]`, return an object keyed by owner, where each",
      "value is `{ total, done }` counts. Owners with no tasks are omitted.",
      "Tasks with a falsy owner are grouped under `\"unassigned\"`.",
    ].join("\n"),
    starterCode: "function groupByOwner(tasks) {\n  // your code here\n}\n",
    tests: [
      { name: "empty", args: [[]], expected: {} },
      {
        name: "basic",
        args: [[
          { id: 1, owner: "sam", done: true },
          { id: 2, owner: "sam", done: false },
          { id: 3, owner: "jo", done: true },
        ]],
        expected: { sam: { total: 2, done: 1 }, jo: { total: 1, done: 1 } },
      },
      {
        name: "unassigned",
        args: [[{ id: 1, owner: "", done: false }, { id: 2, owner: null, done: true }]],
        expected: { unassigned: { total: 2, done: 1 } },
        hidden: true,
      },
    ],
  },
  {
    id: "js-paginate",
    title: "Paginate a result set",
    language: "javascript",
    difficulty: "mid",
    roles: ["backend", "fullstack"],
    stacks: ["javascript", "typescript", "node"],
    competencies: ["api-design", "correctness"],
    functionName: "paginate",
    timeLimitSec: 1800,
    promptMarkdown: [
      "Implement `paginate(items, page, perPage)` (page is 1-based).",
      "",
      "Return `{ items, page, perPage, total, totalPages, hasNext, hasPrev }` where:",
      "- `items` is the slice for that page (empty if the page is past the end).",
      "- `total` is the input length; `totalPages = ceil(total / perPage)` (`0` when empty).",
      "- `hasPrev = page > 1`; `hasNext = page < totalPages`.",
      "",
      "Echo the requested `page`/`perPage` back unchanged (no clamping).",
    ].join("\n"),
    starterCode: "function paginate(items, page, perPage) {\n  // your code here\n}\n",
    tests: [
      {
        name: "first page",
        args: [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 1, 3],
        expected: { items: [1, 2, 3], page: 1, perPage: 3, total: 10, totalPages: 4, hasNext: true, hasPrev: false },
      },
      {
        name: "last page partial",
        args: [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 4, 3],
        expected: { items: [10], page: 4, perPage: 3, total: 10, totalPages: 4, hasNext: false, hasPrev: true },
      },
      {
        name: "empty",
        args: [[], 1, 5],
        expected: { items: [], page: 1, perPage: 5, total: 0, totalPages: 0, hasNext: false, hasPrev: false },
      },
      {
        name: "past the end",
        args: [[1, 2], 5, 1],
        expected: { items: [], page: 5, perPage: 1, total: 2, totalPages: 2, hasNext: false, hasPrev: true },
        hidden: true,
      },
    ],
  },
  {
    id: "js-validate-signup",
    title: "Validate a signup payload",
    language: "javascript",
    difficulty: "mid",
    roles: ["backend", "fullstack"],
    stacks: ["javascript", "typescript", "node"],
    competencies: ["error-handling", "correctness"],
    functionName: "validateSignup",
    timeLimitSec: 1800,
    promptMarkdown: [
      "Implement `validateSignup(input)` returning `{ valid, errors }`.",
      "",
      "`errors` is an array of **error codes**, sorted alphabetically. Rules:",
      "- `\"name_required\"` — `name` missing or empty/whitespace.",
      "- `\"email_invalid\"` — `email` missing or does not contain an `@`.",
      "- `\"age_too_young\"` — `age` is not an integer, or is < 18.",
      "",
      "`valid` is `true` only when `errors` is empty.",
    ].join("\n"),
    starterCode: "function validateSignup(input) {\n  // your code here\n}\n",
    tests: [
      {
        name: "valid",
        args: [{ name: "Ada", email: "ada@example.com", age: 30 }],
        expected: { valid: true, errors: [] },
      },
      {
        name: "all invalid sorted",
        args: [{ name: "  ", email: "nope", age: 10 }],
        expected: { valid: false, errors: ["age_too_young", "email_invalid", "name_required"] },
      },
      {
        name: "missing fields",
        args: [{}],
        expected: { valid: false, errors: ["age_too_young", "email_invalid", "name_required"] },
        hidden: true,
      },
      {
        name: "non-integer age",
        args: [{ name: "Bo", email: "b@o.co", age: 18.5 }],
        expected: { valid: false, errors: ["age_too_young"] },
        hidden: true,
      },
    ],
  },
  {
    id: "js-top-k-frequent",
    title: "Top-K frequent values",
    language: "javascript",
    difficulty: "mid",
    roles: ["data", "backend"],
    stacks: ["javascript", "typescript", "node"],
    competencies: ["data-modelling", "problem-decomposition"],
    functionName: "topKFrequent",
    timeLimitSec: 1800,
    promptMarkdown: [
      "Implement `topKFrequent(items, k)`.",
      "",
      "Return the `k` most frequent values as an array, most frequent first.",
      "**Break ties by first appearance** in `items`. If `k` exceeds the number of",
      "distinct values, return all of them. An empty input returns `[]`.",
    ].join("\n"),
    starterCode: "function topKFrequent(items, k) {\n  // your code here\n}\n",
    tests: [
      { name: "basic", args: [["a", "b", "a", "c", "b", "a"], 2], expected: ["a", "b"] },
      { name: "empty", args: [[], 3], expected: [] },
      { name: "all ties by first seen", args: [["x", "y", "z"], 2], expected: ["x", "y"] },
      {
        name: "k exceeds distinct",
        args: [["p", "p", "q"], 5],
        expected: ["p", "q"],
        hidden: true,
      },
    ],
  },
  {
    id: "js-merge-intervals",
    title: "Merge overlapping intervals",
    language: "javascript",
    difficulty: "senior",
    roles: ["backend", "data"],
    stacks: ["javascript", "typescript", "node"],
    competencies: ["problem-decomposition", "correctness"],
    functionName: "mergeIntervals",
    timeLimitSec: 2100,
    promptMarkdown: [
      "Implement `mergeIntervals(intervals)` where each interval is `[start, end]`.",
      "",
      "Merge all overlapping **or touching** intervals and return them sorted by",
      "`start`. Intervals may arrive unsorted. `[]` returns `[]`.",
      "",
      "Example: `[[1,3],[2,6],[8,10]]` → `[[1,6],[8,10]]`; `[[1,4],[4,5]]` → `[[1,5]]`.",
    ].join("\n"),
    starterCode: "function mergeIntervals(intervals) {\n  // your code here\n}\n",
    tests: [
      { name: "empty", args: [[]], expected: [] },
      { name: "overlap", args: [[[1, 3], [2, 6], [8, 10], [15, 18]]], expected: [[1, 6], [8, 10], [15, 18]] },
      { name: "touching merges", args: [[[1, 4], [4, 5]]], expected: [[1, 5]] },
      { name: "unsorted", args: [[[8, 10], [1, 3], [2, 6]]], expected: [[1, 6], [8, 10]], hidden: true },
      { name: "nested", args: [[[1, 10], [2, 3], [4, 5]]], expected: [[1, 10]], hidden: true },
    ],
  },
];

export function getChallenge(id: string): DevSignalChallenge | null {
  return CHALLENGES.find((c) => c.id === id) ?? null;
}

/** Default pick for an assessment (first active challenge). */
export function defaultChallenge(): DevSignalChallenge {
  return CHALLENGES[0];
}

/**
 * The candidate view. Because execution is browser-only, the tests must travel
 * to the browser to run — so `hidden` means "not shown as a worked example in
 * the prompt", not withheld from execution. The runner runs the full suite; the
 * UI only details non-hidden ones. Anti-gaming leans on process telemetry, the
 * live follow-up, and footprint analysis (Dan: "score the process").
 */
export function toPublicChallenge(c: DevSignalChallenge) {
  return {
    id: c.id,
    title: c.title,
    language: c.language,
    difficulty: c.difficulty,
    promptMarkdown: c.promptMarkdown,
    functionName: c.functionName,
    starterCode: c.starterCode,
    timeLimitSec: c.timeLimitSec,
    testCount: c.tests.length,
    tests: c.tests.map((t) => ({ name: t.name, args: t.args, expected: t.expected, hidden: Boolean(t.hidden) })),
  };
}
