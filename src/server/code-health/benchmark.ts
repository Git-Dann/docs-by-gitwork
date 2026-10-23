import data from "./benchmarks.json";
import type { CodeHealthReport, CodeLanguage } from "@/types/code-health";

/**
 * Code-health figures read against well-known open-source codebases measured by the SAME
 * measure (scripts/code-health-benchmarks.ts → benchmarks.json). "Complexity density 41"
 * means nothing on its own; "less complex per line than 9 of 14 reference frameworks"
 * does. Pure: a report in, a comparison out.
 *
 * The references are pinned to a release tag and a commit, so a reading is reproducible.
 * They are a yardstick, not a target: a small library and a 130k-line framework are both
 * in the set, which is why every reading counts frameworks rather than claiming a grade.
 */

export type BenchmarkMetric = "complexityPerKloc" | "complexLocShare" | "averageComplexity" | "debtPerKloc" | "score";

export interface BenchmarkReference {
  name: string;
  repo: string;
  ref: string;
  commit: string;
  /** The language with the most production lines. */
  language: CodeLanguage;
  metrics: Record<BenchmarkMetric, number> & { loc: number; files: number; effortDaysPerKloc: number };
}

export interface MetricComparison {
  metric: BenchmarkMetric;
  label: string;
  lowerIsBetter: boolean;
  /** The report's own figure. */
  value: number;
  references: {
    count: number;
    min: number;
    median: number;
    max: number;
    /** Median of the references in the report's language; null unless at least 2 exist. */
    sameLanguageMedian: number | null;
    sameLanguageCount: number;
  };
  /** 0–100: share of references this report is better than (ties count half). Direction-corrected. */
  percentile: number;
  /** References strictly worse than the report on this metric. */
  betterThan: number;
  /** References with exactly the same figure. */
  ties: number;
  /** One plain sentence, e.g. "Less complex per line than 9 of 14 reference frameworks." */
  reading: string;
}

export interface BenchmarkComparison {
  /** The language the same-language medians were taken for. */
  language: CodeLanguage | null;
  referenceCount: number;
  measureVersion: string;
  generatedAt: string;
  metrics: Record<BenchmarkMetric, MetricComparison>;
}

export const BENCHMARK_REFERENCES: readonly BenchmarkReference[] = (data.references as unknown as BenchmarkReference[]).map((r) => ({
  name: r.name,
  repo: r.repo,
  ref: r.ref,
  commit: r.commit,
  language: r.language,
  metrics: r.metrics,
}));

export const BENCHMARK_MEASURE_VERSION: string = data.measureVersion;
export const BENCHMARK_GENERATED_AT: string = data.generatedAt;

const METRICS: { metric: BenchmarkMetric; label: string; lowerIsBetter: boolean; better: string }[] = [
  { metric: "complexityPerKloc", label: "Complexity per 1,000 lines", lowerIsBetter: true, better: "Less complex per line than" },
  { metric: "complexLocShare", label: "Code in high-complexity functions", lowerIsBetter: true, better: "Less code in high-complexity functions than" },
  { metric: "averageComplexity", label: "Average function complexity", lowerIsBetter: true, better: "Simpler functions on average than" },
  { metric: "debtPerKloc", label: "Debt findings per 1,000 lines", lowerIsBetter: true, better: "Fewer debt findings per line than" },
  { metric: "score", label: "Code health score", lowerIsBetter: false, better: "Scores higher than" },
];

/** Debt register entries per thousand production lines, rounded as the generator rounds it. */
export function debtPerKloc(report: Pick<CodeHealthReport, "debtCounts" | "totals">): number {
  const debt = Object.values(report.debtCounts).reduce((s, n) => s + n, 0);
  return report.totals.loc ? Math.round((debt / report.totals.loc) * 1000 * 100) / 100 : 0;
}

export function median(xs: number[]): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Where `value` sits among `peers`, as 0–100 "better than this share of them", ties
 * counting half. For a lower-is-better metric a smaller value is better, so the scale is
 * inverted and 100 always means best. Null with no peers: there is nothing to compare to.
 */
export function peerPercentile(value: number, peers: number[], lowerIsBetter: boolean): number | null {
  if (!peers.length) return null;
  const { better, ties } = rank(value, peers, lowerIsBetter);
  return Math.round(((better + ties / 2) / peers.length) * 100);
}

function rank(value: number, peers: number[], lowerIsBetter: boolean): { better: number; ties: number } {
  let better = 0;
  let ties = 0;
  for (const p of peers) {
    if (p === value) ties++;
    else if (lowerIsBetter ? p > value : p < value) better++;
  }
  return { better, ties };
}

function reading(better: string, betterThan: number, ties: number, n: number): string {
  const noun = n === 1 ? "reference framework" : "reference frameworks";
  const level = ties ? `, level with ${ties}` : "";
  if (betterThan === n) return `${better} ${n === 1 ? "the" : `all ${n}`} ${noun}.`;
  if (betterThan === 0 && !ties) return `${better} none of the ${n} ${noun}.`;
  return `${better} ${betterThan} of ${n} ${noun}${level}.`;
}

/**
 * Compare a report with the reference frameworks. Null when the report measured no
 * production code (a figure per thousand lines of nothing is not a figure).
 * `references` is for tests; production always uses the committed set.
 */
export function compareToBenchmarks(
  report: CodeHealthReport,
  opts: { language?: CodeLanguage; references?: readonly BenchmarkReference[] } = {},
): BenchmarkComparison | null {
  if (!report.totals.loc) return null;
  const refs = opts.references ?? BENCHMARK_REFERENCES;
  if (!refs.length) return null;
  const language = opts.language ?? report.languages[0]?.language ?? null;
  const same = language ? refs.filter((r) => r.language === language) : [];

  const values: Record<BenchmarkMetric, number> = {
    complexityPerKloc: report.totals.complexityPerKloc,
    complexLocShare: report.totals.complexLocShare,
    averageComplexity: report.totals.averageComplexity,
    debtPerKloc: debtPerKloc(report),
    score: report.score,
  };

  const metrics = {} as Record<BenchmarkMetric, MetricComparison>;
  for (const m of METRICS) {
    const peers = refs.map((r) => r.metrics[m.metric]);
    const value = values[m.metric];
    const { better, ties } = rank(value, peers, m.lowerIsBetter);
    metrics[m.metric] = {
      metric: m.metric,
      label: m.label,
      lowerIsBetter: m.lowerIsBetter,
      value,
      references: {
        count: peers.length,
        min: Math.min(...peers),
        median: median(peers),
        max: Math.max(...peers),
        sameLanguageMedian: same.length >= 2 ? median(same.map((r) => r.metrics[m.metric])) : null,
        sameLanguageCount: same.length,
      },
      percentile: peerPercentile(value, peers, m.lowerIsBetter) as number,
      betterThan: better,
      ties,
      reading: reading(m.better, better, ties, peers.length),
    };
  }

  return {
    language,
    referenceCount: refs.length,
    measureVersion: BENCHMARK_MEASURE_VERSION,
    generatedAt: BENCHMARK_GENERATED_AT,
    metrics,
  };
}
