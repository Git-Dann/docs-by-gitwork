"use client";

import { useState } from "react";
import { cn, formatDate } from "@/lib/format";
import type { CodeHealthReport, CodeHistory, DebtItem, DebtKind, DebtSeverity } from "@/types/code-health";

/**
 * The code-health measure: a score, the figures behind it, and the tech-debt register
 * (specific functions and classes, worst first, each linked to the exact line on GitHub
 * at the commit that was measured).
 */

const KIND_LABEL: Record<DebtKind, string> = {
  complex_function: "Complex function",
  long_function: "Long function",
  long_parameter_list: "Many parameters",
  deep_nesting: "Deep nesting",
  large_class: "Large class",
  large_file: "Large file",
};

const SEVERITY: Record<DebtSeverity, { label: string; cls: string }> = {
  very_high: { label: "Very high", cls: "border-[var(--danger-200)] bg-[var(--danger-50)] text-[var(--danger-700)]" },
  high: { label: "High", cls: "border-[var(--warning-500)]/40 bg-[var(--warning-50)] text-[var(--text-1)]" },
  moderate: { label: "Moderate", cls: "border-[var(--border-1)] bg-[var(--surface-1)] text-[var(--text-3)]" },
};

const PAGE = 10;

function lineUrl(report: CodeHealthReport, d: DebtItem): string {
  const ref = report.commit ?? report.branch ?? "HEAD";
  return `https://github.com/${report.repo}/blob/${ref}/${d.path.split("/").map(encodeURIComponent).join("/")}#L${d.line}`;
}

function metricsText(d: DebtItem): string {
  const m = d.metrics;
  const parts: string[] = [];
  if (m.complexity !== undefined) parts.push(`complexity ${m.complexity}`);
  if (m.loc !== undefined) parts.push(`${m.loc.toLocaleString("en-GB")} lines`);
  if (d.kind === "long_parameter_list") parts.push(`${m.params} params`);
  if (d.kind === "deep_nesting") parts.push(`depth ${m.nesting}`);
  if (m.methods !== undefined) parts.push(`${m.methods} methods`);
  return parts.join(" · ");
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

/**
 * `rows` fixes how many register rows render and drops the "show more" control: the shared
 * report is printed to PDF, where a button that reveals more rows would be a dead end.
 */
export function CodeHealthPanel({ report, num, rows, showMoney = false }: { report: CodeHealthReport; num?: string; rows?: number; showMoney?: boolean }) {
  const [paged, setShown] = useState(PAGE);
  const shown = rows ?? paged;
  const t = report.totals;
  const c = report.coverage;
  const totalDebt = Object.values(report.debtCounts).reduce((s, n) => s + n, 0);
  const trend = report.trend ?? null;
  const history = report.history ?? null;
  const notMeasured = [
    c.unsupportedSourceFiles > 0 ? `${c.unsupportedSourceFiles} ${c.unsupportedLanguages.join("/")} file${c.unsupportedSourceFiles === 1 ? "" : "s"} (not supported yet)` : null,
    c.skippedGenerated > 0 ? `${c.skippedGenerated} generated` : null,
    c.skippedMinified > 0 ? `${c.skippedMinified} minified` : null,
    c.skippedLarge > 0 ? `${c.skippedLarge} over 256 KB` : null,
  ].filter(Boolean);

  return (
    <div className="widget-card">
      <div className="widget-header">
        <span className="widget-header-label">{num ? `${num} // CODE HEALTH` : "CODE HEALTH"}</span>
        <span className="widget-header-right" title={report.commit ?? undefined}>
          {report.commit ? `commit ${report.commit.slice(0, 7)}` : "full checkout"}
        </span>
      </div>
      <div className="widget-body space-y-5">
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-4">
          <div>
            <p className="widget-data-label">Score</p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-serif text-3xl font-bold leading-none tabular-nums text-[var(--text-1)]">{report.score}</span>
              <span
                className={cn(
                  "font-mono text-[10px] uppercase tracking-wide",
                  report.band === "good" ? "text-[var(--success-500)]" : report.band === "fair" ? "text-[var(--text-2)]" : "text-[var(--danger-500)]",
                )}
              >
                {report.band}
              </span>
            </div>
            {trend && (
              <p className="mt-1 font-mono text-[10px] text-[var(--text-4)]" title={`Previous scan ${formatDate(trend.previousMeasuredAt)}`}>
                <span className={cn(trend.scoreDelta > 0 ? "text-[var(--success-500)]" : trend.scoreDelta < 0 ? "text-[var(--danger-500)]" : "")}>
                  {trend.scoreDelta > 0 ? `▲ ${trend.scoreDelta}` : trend.scoreDelta < 0 ? `▼ ${-trend.scoreDelta}` : "no change"}
                </span>{" "}
                since {formatDate(trend.previousMeasuredAt)}
              </p>
            )}
          </div>
          <div>
            <p className="widget-data-label">Code measured</p>
            <p className="mt-1 font-serif text-2xl font-bold leading-none tabular-nums text-[var(--text-1)]">{t.loc.toLocaleString("en-GB")}</p>
            <p className="mt-1 font-mono text-[10px] text-[var(--text-4)]">
              lines · {t.files.toLocaleString("en-GB")} files · {t.testLoc.toLocaleString("en-GB")} lines of tests
            </p>
          </div>
          <div>
            <p className="widget-data-label">In complex code</p>
            <p className="mt-1 font-serif text-2xl font-bold leading-none tabular-nums text-[var(--text-1)]">{pct(t.complexLocShare)}</p>
            <p className="mt-1 font-mono text-[10px] text-[var(--text-4)]">of lines, in functions of complexity 21+</p>
          </div>
          {report.effort ? (
            <div>
              <p className="widget-data-label">Effort to clear</p>
              <p className="mt-1 font-serif text-2xl font-bold leading-none tabular-nums text-[var(--text-1)]">
                {report.effort.days.toLocaleString("en-GB")}
                <span className="ml-1 font-mono text-[10px] font-normal text-[var(--text-4)]">days</span>
              </p>
              <p className="mt-1 font-mono text-[10px] text-[var(--text-4)]" title="Planning estimate: published hours per finding, tests included. Not a quote.">
                {showMoney && report.effort.gbpLow !== undefined && report.effort.gbpHigh !== undefined
                  ? `≈ £${report.effort.gbpLow.toLocaleString("en-GB")}–£${report.effort.gbpHigh.toLocaleString("en-GB")} at £${report.effort.dayRateGbp}/day`
                  : `estimate · ${report.effort.hours.toLocaleString("en-GB")} hours`}
              </p>
            </div>
          ) : (
            <div>
              <p className="widget-data-label">Tests</p>
              <p className="mt-1 font-serif text-2xl font-bold leading-none tabular-nums text-[var(--text-1)]">{t.testLoc.toLocaleString("en-GB")}</p>
              <p className="mt-1 font-mono text-[10px] text-[var(--text-4)]">lines</p>
            </div>
          )}
        </div>

        {trend && (trend.newDebt > 0 || trend.resolvedDebt > 0) && (
          <div className="rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-1)] px-3 py-2.5">
            <p className="widget-data-label">Since the last scan</p>
            <p className="mt-1 text-xs leading-5 text-[var(--text-2)]">
              {trend.resolvedDebt > 0 && <span className="text-[var(--success-500)]">{trend.resolvedDebt} resolved</span>}
              {trend.resolvedDebt > 0 && trend.newDebt > 0 && " · "}
              {trend.newDebt > 0 && <span className="text-[var(--danger-500)]">{trend.newDebt} new</span>}
              {trend.resolvedItems.length > 0 && <> · fixed: {trend.resolvedItems.map((d) => d.symbol).join(", ")}</>}
              {trend.newItems.length > 0 && <> · new: {trend.newItems.map((d) => d.symbol).join(", ")}</>}
            </p>
          </div>
        )}

        <div>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="widget-data-label">Tech-debt register</p>
            <p className="font-mono text-[10px] text-[var(--text-4)]">
              {(Object.keys(KIND_LABEL) as DebtKind[])
                .filter((k) => report.debtCounts[k] > 0)
                .map((k) => `${report.debtCounts[k]} ${KIND_LABEL[k].toLowerCase()}`)
                .join(" · ") || "nothing over the thresholds"}
            </p>
          </div>

          {report.debt.length > 0 && (
            <div className="mt-2 overflow-x-auto">
              <table className="app-table app-table--dense min-w-[640px]">
                <thead>
                  <tr>
                    <th className="text-left">Where</th>
                    <th className="text-left">Issue</th>
                    <th className="text-left">Measured</th>
                    <th className="text-left">Severity</th>
                    <th className="text-right">Effort</th>
                  </tr>
                </thead>
                <tbody>
                  {report.debt.slice(0, shown).map((d) => (
                    <tr key={`${d.path}:${d.line}:${d.kind}`}>
                      <td className="max-w-[340px]">
                        <a
                          href={lineUrl(report, d)}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="block truncate font-mono text-xs text-[var(--brand-600)] hover:underline"
                          title={`${d.path}:${d.line}`}
                        >
                          {d.symbol}
                        </a>
                        <span className="block truncate font-mono text-[10px] text-[var(--text-4)]" title={`${d.path}:${d.line}`}>
                          {d.path}:{d.line}
                        </span>
                      </td>
                      <td className="text-xs text-[var(--text-2)]" title={d.reason}>{KIND_LABEL[d.kind]}</td>
                      <td className="whitespace-nowrap font-mono text-[11px] text-[var(--text-3)]">{metricsText(d)}</td>
                      <td>
                        <span className={cn("inline-block rounded-[4px] border px-1.5 py-0.5 font-mono text-[10px] uppercase", SEVERITY[d.severity].cls)}>
                          {SEVERITY[d.severity].label}
                        </span>
                      </td>
                      <td className="whitespace-nowrap text-right font-mono text-[11px] tabular-nums text-[var(--text-3)]">{d.effortHours ? `${d.effortHours}h` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {rows !== undefined && totalDebt > shown && (
            <p className="mt-2 font-mono text-[10px] text-[var(--text-4)]">
              The {Math.min(shown, report.debt.length)} most severe of {totalDebt} findings.
            </p>
          )}
          {rows === undefined && report.debt.length > shown && (
            <button
              type="button"
              onClick={() => setShown((n) => n + PAGE * 2)}
              className="mt-2 font-mono text-[11px] uppercase tracking-wide text-[var(--brand-600)] hover:underline"
            >
              Show more ({report.debt.length - shown} more{totalDebt > report.debt.length ? `, of ${totalDebt} in total` : ""})
            </button>
          )}
        </div>

        {history && <HistorySection report={report} history={history} />}

        <p className="border-t border-[var(--border-2)] pt-3 text-xs leading-5 text-[var(--text-3)]">
          Measured by parsing every supported source file in the repository, not a sample.
          {notMeasured.length > 0 ? ` Not measured: ${notMeasured.join(", ")}.` : ""}
          {c.truncated ? " The measure reached its size or time limit, so part of the code was not read." : ""}
          {" "}Thresholds: complexity 11+ moderate, 21+ high, 51+ very high (SEI); functions over 60 lines; classes with combined complexity 47+ or 500+ lines.
          {report.effort ? " Effort is a planning estimate from published hours per finding, one per function, tests included; it is not a quote." : ""}
          {history ? ` History: the last ${history.months} months, ${history.commits.toLocaleString("en-GB")} commits${history.botCommitsIgnored ? `, ${history.botCommitsIgnored} bot commits left out` : ""}${history.massEditsIgnored ? `, ${history.massEditsIgnored} mass edits left out` : ""}.` : ""}
        </p>
      </div>
    </div>
  );
}

function fileUrl(report: CodeHealthReport, path: string): string {
  const ref = report.commit ?? report.branch ?? "HEAD";
  return `https://github.com/${report.repo}/blob/${ref}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

/** Hotspots, who knows the code, and files that change together. */
function HistorySection({ report, history }: { report: CodeHealthReport; history: CodeHistory }) {
  return (
    <div className="space-y-4 border-t border-[var(--border-2)] pt-4">
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-4">
        <div>
          <p className="widget-data-label">Bus factor</p>
          <p className="mt-1 font-serif text-2xl font-bold leading-none tabular-nums text-[var(--text-1)]">{history.busFactor ?? "—"}</p>
          <p className="mt-1 font-mono text-[10px] text-[var(--text-4)]">
            {history.busFactor === null ? "no changes in the window" : `${history.busFactor === 1 ? "person writes" : "people write"} over half the changing code`}
          </p>
        </div>
        <div>
          <p className="widget-data-label">Contributors</p>
          <p className="mt-1 font-serif text-2xl font-bold leading-none tabular-nums text-[var(--text-1)]">{history.contributors}</p>
          <p className="mt-1 font-mono text-[10px] text-[var(--text-4)]">{history.commits.toLocaleString("en-GB")} commits in {history.months} months</p>
        </div>
        {history.owners.length > 0 && (
          <div className="col-span-2">
            <p className="widget-data-label">Main authors of changing code</p>
            <p className="mt-1.5 font-mono text-[11px] leading-5 text-[var(--text-2)]">
              {history.owners.map((o) => `${o.name} ${Math.round(o.share * 100)}%`).join(" · ")}
            </p>
          </div>
        )}
      </div>

      {history.hotspots.length > 0 && (
        <div>
          <p className="widget-data-label">Hotspots</p>
          <p className="mt-0.5 text-xs text-[var(--text-3)]">Complex code that also changes often. This is where debt costs the most, so fix it first.</p>
          <div className="mt-2 overflow-x-auto">
            <table className="app-table app-table--dense min-w-[560px]">
              <thead>
                <tr>
                  <th className="text-left">File</th>
                  <th className="text-right">Changes</th>
                  <th className="text-right">Complexity</th>
                  <th className="text-left">Who knows it</th>
                </tr>
              </thead>
              <tbody>
                {history.hotspots.slice(0, 8).map((h) => (
                  <tr key={h.path}>
                    <td className="max-w-[360px]">
                      <a href={fileUrl(report, h.path)} target="_blank" rel="noreferrer noopener" className="block truncate font-mono text-xs text-[var(--brand-600)] hover:underline" title={h.path}>
                        {h.path}
                      </a>
                    </td>
                    <td className="text-right font-mono text-[11px] tabular-nums text-[var(--text-2)]">{h.changes}</td>
                    <td className="text-right font-mono text-[11px] tabular-nums text-[var(--text-2)]">{h.complexity}</td>
                    <td className="whitespace-nowrap font-mono text-[11px] text-[var(--text-3)]">
                      {h.authors} {h.authors === 1 ? "person" : "people"}
                      {h.mainAuthorShare >= 0.8 && h.authors > 0 ? <span className="text-[var(--danger-500)]"> · one does {Math.round(h.mainAuthorShare * 100)}%</span> : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {history.coupling.length > 0 && (
        <div>
          <p className="widget-data-label">Change together</p>
          <p className="mt-0.5 text-xs text-[var(--text-3)]">Files in different folders that keep changing in the same commits: a hidden dependency.</p>
          <ul className="mt-2 space-y-1">
            {history.coupling.slice(0, 5).map((c) => (
              <li key={`${c.a}|${c.b}`} className="font-mono text-[11px] leading-5 text-[var(--text-2)] [overflow-wrap:anywhere]">
                {c.a} <span className="text-[var(--text-4)]">↔</span> {c.b}{" "}
                <span className="text-[var(--text-4)]">· {c.shared} times, {Math.round(c.degree * 100)}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
