/**
 * Code health: what Pulse measures from a full checkout of a repository.
 *
 * Unlike the rest of the repo checks, which read a sample of files through the GitHub API
 * and match patterns, this parses every supported source file with a real parser
 * (tree-sitter) and measures each function and class. That is what makes per-function
 * findings ("this method has a cyclomatic complexity of 34, at line 120") possible, and
 * what lets the findings point at the exact symbol.
 */

export type CodeLanguage =
  | "typescript"
  | "tsx"
  | "javascript"
  | "python"
  | "swift"
  | "kotlin"
  | "java"
  | "go"
  | "php"
  | "dart"
  | "ruby";

/** One function, method, constructor or named closure, as measured. */
export interface FunctionMeasure {
  name: string;
  /** The class it belongs to, when it is a method. */
  owner: string | null;
  startLine: number;
  endLine: number;
  /** Lines of code: non-blank, not comment-only. */
  loc: number;
  /** McCabe cyclomatic complexity: 1 + decision points (branches, loops, cases, catches, && / ||). */
  complexity: number;
  params: number;
  /** Deepest nesting of control structures inside the function. */
  maxNesting: number;
}

/** One class (or struct / object / interface with a body), as measured. */
export interface ClassMeasure {
  name: string;
  startLine: number;
  endLine: number;
  loc: number;
  methods: number;
  /** Weighted methods per class: the sum of its methods' complexity. */
  wmc: number;
}

export interface FileMeasure {
  path: string;
  language: CodeLanguage;
  loc: number;
  isTest: boolean;
  functions: FunctionMeasure[];
  classes: ClassMeasure[];
  /** The parser recovered from syntax it could not read. Measures are still taken, flagged. */
  parseErrors: boolean;
}

export type DebtKind =
  | "complex_function"
  | "long_function"
  | "long_parameter_list"
  | "deep_nesting"
  | "large_class"
  | "large_file";

export type DebtSeverity = "moderate" | "high" | "very_high";

/** One entry in the tech-debt register: a specific symbol, a measured reason, a severity. */
export interface DebtItem {
  kind: DebtKind;
  severity: DebtSeverity;
  path: string;
  line: number;
  /** "Class.method", "function", or the file name for a large file. */
  symbol: string;
  /** The measurement that put it here, e.g. { complexity: 34, loc: 120 }. */
  metrics: Record<string, number>;
  /** One sentence, in words a non-developer can follow. */
  reason: string;
  /** Estimated hours to bring it under the threshold, tests included (rules.ts EFFORT_HOURS). */
  effortHours?: number;
}

export interface Hotspot {
  path: string;
  /** Commits that changed it in the history window. */
  changes: number;
  /** Sum of its functions' complexity. */
  complexity: number;
  loc: number;
  authors: number;
  /** Share of its changes made by one person (0–1). High on a hotspot is a knowledge risk. */
  mainAuthorShare: number;
  /** changes × complexity, each relative to the repo's own maximum (0–1). */
  score: number;
}

export interface CodeHistory {
  months: number;
  commits: number;
  massEditsIgnored: number;
  botCommitsIgnored: number;
  contributors: number;
  firstCommitAt: string | null;
  lastCommitAt: string | null;
  /** Fewest people who are main author of over half the code that changed. Null with no history. */
  busFactor: number | null;
  owners: { name: string; share: number }[];
  hotspots: Hotspot[];
  /** Files in different folders that keep changing in the same commits. */
  coupling: { a: string; b: string; shared: number; degree: number }[];
}

/** What changed since the last measured scan of the same repository. */
export interface CodeHealthTrend {
  previousScanId: string;
  previousCommit: string | null;
  previousMeasuredAt: string;
  previousScore: number;
  scoreDelta: number;
  complexLocShareDelta: number;
  /** Register entries now that were not there before, and ones that went. */
  newDebt: number;
  resolvedDebt: number;
  /** Up to 5 of each, worst first, so the change can be named. */
  newItems: Pick<DebtItem, "kind" | "severity" | "path" | "line" | "symbol">[];
  resolvedItems: Pick<DebtItem, "kind" | "severity" | "path" | "symbol">[];
}

export interface CodeHealthEffort {
  /** Summed over every finding, one per function (its worst), not just the listed ones. */
  hours: number;
  days: number;
  /** Set at scan time from the workspace's own day rate; internal only, never on a shared report. */
  dayRateGbp?: number;
  gbpLow?: number;
  gbpHigh?: number;
}

export interface LanguageSummary {
  language: CodeLanguage;
  files: number;
  loc: number;
}

export interface CodeHealthReport {
  /** The repository and the exact commit measured, so the result is reproducible. */
  repo: string;
  branch: string | null;
  commit: string | null;
  measuredAt: string;
  /** 0 to 100. See rules.ts for how it is built; the formula is published there. */
  score: number;
  band: "good" | "fair" | "poor";
  totals: {
    files: number;
    loc: number;
    testLoc: number;
    functions: number;
    classes: number;
    /** Sum of function complexity per thousand lines of code, the usual "complexity density". */
    complexityPerKloc: number;
    /** Share of production code inside functions rated high or very high complexity. */
    complexLocShare: number;
    averageComplexity: number;
  };
  languages: LanguageSummary[];
  /** The register, worst first, capped. `debtCounts` holds the full totals. */
  debt: DebtItem[];
  debtCounts: Record<DebtKind, number>;
  /** Absent on reports measured before history and effort were added (Oct 2026). */
  effort?: CodeHealthEffort;
  /** Git history analysis. Null when the history could not be read; absent on older reports. */
  history?: CodeHistory | null;
  /** Set after the scan, against the previous measured scan of the same repository. */
  trend?: CodeHealthTrend | null;
  /** What was not measured, and why, so the coverage is honest. */
  coverage: {
    analysedFiles: number;
    skippedLarge: number;
    skippedMinified: number;
    skippedGenerated: number;
    unsupportedSourceFiles: number;
    unsupportedLanguages: string[];
    filesWithParseErrors: number;
    truncated: boolean;
  };
}
