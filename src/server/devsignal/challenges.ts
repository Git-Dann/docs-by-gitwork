/**
 * DevSignal coding-challenge catalog. Challenges are defined in code (not a DB
 * model yet) — a lean starter set of real, delivery-flavoured JS/TS tasks, not
 * LeetCode puzzles. Execution happens in the CANDIDATE'S BROWSER (a sandboxed
 * Web Worker) — never on Foundry infra. Hidden tests travel to the browser at
 * run time; only the count is shown in the UI, and the server re-derives the
 * score from the reported results + process telemetry.
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

export interface DevSignalChallenge {
  id: string;
  title: string;
  language: ChallengeLanguage;
  difficulty: "junior" | "mid" | "senior";
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
    id: "js-retry-with-backoff",
    title: "Group tasks by owner",
    language: "javascript",
    difficulty: "mid",
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
