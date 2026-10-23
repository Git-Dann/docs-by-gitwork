import type { CodeHealthReport, CodeHealthTrend } from "@/types/code-health";
import { DEBT_REGISTER_LIMIT, debtKey } from "./rules";

/**
 * What changed between two measured scans of the same repository. Items are matched on
 * kind + file + symbol, not line number: a function that moved down the file because
 * code was added above it is the same debt, not a fix and a new problem.
 *
 * ⚠️ The register is capped (rules.ts DEBT_REGISTER_LIMIT), so on a repo with more
 * findings than the cap, an item can drop out of the list because worse ones arrived.
 * Those are only counted as resolved when the previous list was itself complete.
 */
export function diffReports(prev: CodeHealthReport, cur: CodeHealthReport, previousScanId: string): CodeHealthTrend {
  const before = new Map(prev.debt.map((d) => [debtKey(d), d]));
  const after = new Map(cur.debt.map((d) => [debtKey(d), d]));
  // A list shorter than the cap holds every function/class/file finding there was.
  const prevComplete = prev.debt.length < DEBT_REGISTER_LIMIT;
  const curComplete = cur.debt.length < DEBT_REGISTER_LIMIT;

  const added = cur.debt.filter((d) => !before.has(debtKey(d)));
  const gone = prev.debt.filter((d) => !after.has(debtKey(d)));
  return {
    previousScanId,
    previousCommit: prev.commit,
    previousMeasuredAt: prev.measuredAt,
    previousScore: prev.score,
    scoreDelta: cur.score - prev.score,
    complexLocShareDelta: Math.round((cur.totals.complexLocShare - prev.totals.complexLocShare) * 1000) / 1000,
    newDebt: prevComplete ? added.length : 0,
    resolvedDebt: curComplete ? gone.length : 0,
    newItems: (prevComplete ? added : []).slice(0, 5).map(({ kind, severity, path, line, symbol }) => ({ kind, severity, path, line, symbol })),
    resolvedItems: (curComplete ? gone : []).slice(0, 5).map(({ kind, severity, path, symbol }) => ({ kind, severity, path, symbol })),
  };
}
