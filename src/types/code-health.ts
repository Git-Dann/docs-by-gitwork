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

/**
 * The import graph: which source files depend on which, resolved inside the repository.
 * Deterministic (no AI): imports are read from the source text and resolved to tracked
 * files. Change-coupling from git history lives in `CodeHistory.coupling`; this is the
 * structural coupling the code itself declares.
 */
export interface DependencyCycle {
  /** Every file in the cycle (one strongly connected component), shortest path first. */
  files: string[];
  /** One concrete loop through it, so a developer can see where to cut: a → b → c → a. */
  path: string[];
}

export interface HubModule {
  path: string;
  /** Files that import it. */
  fanIn: number;
  /** Files it imports. */
  fanOut: number;
  /** fanOut / (fanIn + fanOut): 0 = depended on and depends on nothing, 1 = the reverse. */
  instability: number;
  /** Sum of its functions' complexity. */
  complexity: number;
}

export interface StructureReport {
  /** Production files in the graph. */
  modules: number;
  /** Resolved file-to-file imports. */
  edges: number;
  /** Imports that looked internal but could not be resolved to a file (0–1). Honesty, not a score. */
  unresolvedShare: number;
  /** Languages whose imports were resolved. Files in other languages are not in the graph. */
  languages: CodeLanguage[];
  /** Strongly connected components of more than one file, largest first, capped. */
  cycles: DependencyCycle[];
  cycleCount: number;
  filesInCycles: number;
  /** Depended on by many AND complex: a change here ripples. Worst first, capped. */
  hubs: HubModule[];
  /** Longest chain of imports with no cycle, as a sense of how layered the code is. */
  maxDepth: number;
}

export type VulnerabilitySeverity = "critical" | "high" | "moderate" | "low" | "unknown";

export interface PackageAdvisory {
  /** OSV id, e.g. GHSA-xxxx or PYSEC-…; `aliases` carries CVE ids. */
  id: string;
  aliases: string[];
  summary: string;
  severity: VulnerabilitySeverity;
  /** Lowest version that fixes it, when the advisory names one. */
  fixedIn: string | null;
  url: string;
}

export interface VulnerablePackage {
  ecosystem: string;
  name: string;
  version: string;
  /** The lockfile it was found in. */
  lockfile: string;
  /** Declared by the project itself (true), pulled in by another package (false), or unknown. */
  direct: boolean | null;
  advisories: PackageAdvisory[];
  /** The worst severity among its advisories. */
  severity: VulnerabilitySeverity;
}

/**
 * Third-party libraries, read from the lockfiles in the checkout and checked against the
 * OSV database (osv.dev). A lockfile pins exact versions, so this is a lookup, not a
 * guess. When the lookup could not run, `status` says so and nothing is claimed clean.
 */
export interface DependencyAudit {
  status: "checked" | "no_lockfile" | "unavailable";
  /** Why, when not checked. */
  reason: string | null;
  lockfiles: { path: string; ecosystem: string; packages: number }[];
  packages: number;
  vulnerable: VulnerablePackage[];
  counts: Record<VulnerabilitySeverity, number>;
  checkedAt: string;
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
  /** The import graph. Absent on reports measured before Oct 2026; null when it could not be built. */
  structure?: StructureReport | null;
  /** Lockfile libraries checked against OSV. Absent on older reports. */
  dependencies?: DependencyAudit | null;
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
