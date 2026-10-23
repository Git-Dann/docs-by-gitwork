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
  | "php";

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
