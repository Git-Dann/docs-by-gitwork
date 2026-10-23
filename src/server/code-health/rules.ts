import type { CodeHealthReport, DebtItem, DebtKind, DebtSeverity, FileMeasure, FunctionMeasure } from "@/types/code-health";

/**
 * What counts as technical debt, how bad it is, and the score. Pure: measures in, findings
 * out, so every threshold here is testable and the score can be explained line by line.
 *
 * The thresholds are the published ones where there is one:
 *  - Cyclomatic complexity: the SEI bands. 1–10 simple, 11–20 moderate risk, 21–50 high
 *    risk, over 50 untestable in practice. McCabe's own suggested limit is 10.
 *  - Class size: Lanza & Marinescu's "very high" weighted methods per class is 47. We have
 *    no cohesion or foreign-data measure, which their God Class rule also needs, so we say
 *    "large class", never "God Class": a name we cannot fully back is not one we use.
 * Length, nesting and parameter limits have no single standard; the values below are
 * conservative versions of common linter defaults (ESLint, Sonar, Fowler's Refactoring).
 */
export const THRESHOLDS = {
  complexity: { moderate: 11, high: 21, veryHigh: 51 },
  functionLoc: { moderate: 61, high: 121, veryHigh: 251 },
  params: { moderate: 6, high: 8, veryHigh: 12 },
  nesting: { moderate: 4, high: 5, veryHigh: 7 },
  classWmc: { high: 47, veryHigh: 100 },
  classLoc: { high: 500, veryHigh: 1000 },
  fileLoc: { moderate: 750, high: 1500, veryHigh: 3000 },
} as const;

/** How many register entries are kept. Counts are always complete; only the list is capped. */
export const DEBT_REGISTER_LIMIT = 100;

const RANK: Record<DebtSeverity, number> = { moderate: 1, high: 2, very_high: 3 };

function band(value: number, t: { moderate?: number; high: number; veryHigh: number }): DebtSeverity | null {
  if (value >= t.veryHigh) return "very_high";
  if (value >= t.high) return "high";
  if (t.moderate !== undefined && value >= t.moderate) return "moderate";
  return null;
}

function symbolOf(fn: FunctionMeasure): string {
  return fn.owner ? `${fn.owner}.${fn.name}` : fn.name;
}

const SEVERITY_WORD: Record<DebtSeverity, string> = { moderate: "moderately", high: "highly", very_high: "very" };

/** Every finding for one function; the register keeps the worst, the counts keep them all. */
export function functionFindings(path: string, fn: FunctionMeasure): DebtItem[] {
  const out: DebtItem[] = [];
  const base = { path, line: fn.startLine, symbol: symbolOf(fn), metrics: { complexity: fn.complexity, loc: fn.loc, params: fn.params, nesting: fn.maxNesting } };
  const c = band(fn.complexity, THRESHOLDS.complexity);
  if (c) out.push({ ...base, kind: "complex_function", severity: c, reason: `${SEVERITY_WORD[c]} complex: ${fn.complexity} independent paths through it, so it needs at least that many tests to cover.` });
  const l = band(fn.loc, THRESHOLDS.functionLoc);
  if (l) out.push({ ...base, kind: "long_function", severity: l, reason: `${fn.loc} lines long, so it is doing several jobs at once and is hard to change safely.` });
  const p = band(fn.params, THRESHOLDS.params);
  if (p) out.push({ ...base, kind: "long_parameter_list", severity: p, reason: `Takes ${fn.params} parameters, which makes every call easy to get wrong.` });
  const n = band(fn.maxNesting, THRESHOLDS.nesting);
  if (n) out.push({ ...base, kind: "deep_nesting", severity: n, reason: `Logic nested ${fn.maxNesting} levels deep, which is hard to follow and to test each branch of.` });
  return out;
}

export function fileFindings(file: FileMeasure): DebtItem[] {
  const out: DebtItem[] = [];
  for (const cls of file.classes) {
    const sev = [band(cls.wmc, THRESHOLDS.classWmc), band(cls.loc, THRESHOLDS.classLoc)].reduce<DebtSeverity | null>(
      (worst, s) => (s && (!worst || RANK[s] > RANK[worst]) ? s : worst),
      null,
    );
    if (sev) {
      out.push({
        kind: "large_class",
        severity: sev,
        path: file.path,
        line: cls.startLine,
        symbol: cls.name,
        metrics: { methods: cls.methods, complexity: cls.wmc, loc: cls.loc },
        reason: `A large class: ${cls.methods} methods, ${cls.loc} lines and a combined complexity of ${cls.wmc}. Large classes usually hold several responsibilities that change for different reasons.`,
      });
    }
  }
  const f = band(file.loc, THRESHOLDS.fileLoc);
  if (f) {
    out.push({
      kind: "large_file",
      severity: f,
      path: file.path,
      line: 1,
      symbol: file.path.slice(file.path.lastIndexOf("/") + 1),
      metrics: { loc: file.loc, functions: file.functions.length },
      reason: `${file.loc} lines in one file, which makes it a magnet for merge conflicts and slow to find your way around.`,
    });
  }
  return out;
}

/** Worst first: severity, then how far past the threshold it is. */
function weight(d: DebtItem): number {
  const m = d.metrics;
  const magnitude =
    d.kind === "complex_function" ? m.complexity :
    d.kind === "long_function" ? m.loc / 10 :
    d.kind === "large_class" ? Math.max(m.complexity, m.loc / 20) :
    d.kind === "large_file" ? m.loc / 50 :
    d.kind === "deep_nesting" ? m.nesting * 3 :
    m.params * 2;
  return RANK[d.severity] * 1000 + magnitude;
}

export type ScoreInputs = Pick<FileMeasure, "isTest" | "loc" | "functions" | "classes">[];

/**
 * Code health, 0 to 100. Starts at 100 and loses points for the share of production code
 * sitting in hard-to-change places. Shares, not counts, so a big repo is not punished for
 * being big: 2 complex functions in 200 lines matter more than 2 in 200,000.
 *
 *   − 50 × share of production lines inside functions of high/very high complexity
 *   − 20 × share inside functions of moderate complexity
 *   − 20 × share inside very long functions (> 120 lines) not already counted above
 *   −  3 per large class (up to 15)
 *   −  2 per very large file (up to 10)
 */
export function scoreOf(files: ScoreInputs): { score: number; complexLocShare: number } {
  const prod = files.filter((f) => !f.isTest);
  const prodLoc = prod.reduce((s, f) => s + f.loc, 0);
  if (prodLoc === 0) return { score: 100, complexLocShare: 0 };
  let complexLoc = 0;
  let moderateLoc = 0;
  let longLoc = 0;
  let largeClasses = 0;
  let largeFiles = 0;
  for (const f of prod) {
    for (const fn of topLevelFunctions(f.functions)) {
      if (fn.complexity >= THRESHOLDS.complexity.high) complexLoc += fn.loc;
      else if (fn.complexity >= THRESHOLDS.complexity.moderate) moderateLoc += fn.loc;
      else if (fn.loc >= THRESHOLDS.functionLoc.high) longLoc += fn.loc;
    }
    for (const c of f.classes) if (c.wmc >= THRESHOLDS.classWmc.high || c.loc >= THRESHOLDS.classLoc.high) largeClasses++;
    if (f.loc >= THRESHOLDS.fileLoc.high) largeFiles++;
  }
  const share = (n: number) => Math.min(1, n / prodLoc);
  const raw =
    100 -
    50 * share(complexLoc) -
    20 * share(moderateLoc) -
    20 * share(longLoc) -
    Math.min(15, 3 * largeClasses) -
    Math.min(10, 2 * largeFiles);
  return { score: Math.max(0, Math.min(100, Math.round(raw))), complexLocShare: share(complexLoc) };
}

/**
 * Functions not nested inside another measured function. A nested function's lines are
 * already inside its parent's, so counting both would charge the same lines twice.
 */
function topLevelFunctions(fns: FunctionMeasure[]): FunctionMeasure[] {
  return fns.filter((f) => !fns.some((g) => g !== f && g.startLine <= f.startLine && g.endLine >= f.endLine && (g.startLine < f.startLine || g.endLine > f.endLine)));
}

export function bandOf(score: number): CodeHealthReport["band"] {
  return score >= 80 ? "good" : score >= 60 ? "fair" : "poor";
}

/**
 * The register: per function only its worst finding (a 300-line, complexity-60 function
 * is one problem to fix, not two rows), every class and file finding, worst first.
 */
export function buildRegister(files: FileMeasure[]): { debt: DebtItem[]; counts: Record<DebtKind, number> } {
  const counts: Record<DebtKind, number> = {
    complex_function: 0,
    long_function: 0,
    long_parameter_list: 0,
    deep_nesting: 0,
    large_class: 0,
    large_file: 0,
  };
  const items: DebtItem[] = [];
  for (const file of files) {
    if (file.isTest) continue; // a long test is normal; the register is about the product code
    for (const fn of file.functions) {
      const found = functionFindings(file.path, fn);
      for (const d of found) counts[d.kind]++;
      if (found.length > 0) items.push(found.reduce((a, b) => (weight(b) > weight(a) ? b : a)));
    }
    for (const d of fileFindings(file)) {
      counts[d.kind]++;
      items.push(d);
    }
  }
  items.sort((a, b) => weight(b) - weight(a));
  return { debt: items.slice(0, DEBT_REGISTER_LIMIT), counts };
}
