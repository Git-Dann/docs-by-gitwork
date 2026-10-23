"use client";

import { useState } from "react";
import { cn } from "@/lib/format";
import type { CodeHealthReport, DebtItem, DebtKind, DebtSeverity } from "@/types/code-health";

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
export function CodeHealthPanel({ report, num, rows }: { report: CodeHealthReport; num?: string; rows?: number }) {
  const [paged, setShown] = useState(PAGE);
  const shown = rows ?? paged;
  const t = report.totals;
  const c = report.coverage;
  const totalDebt = Object.values(report.debtCounts).reduce((s, n) => s + n, 0);
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
          </div>
          <div>
            <p className="widget-data-label">Code measured</p>
            <p className="mt-1 font-serif text-2xl font-bold leading-none tabular-nums text-[var(--text-1)]">{t.loc.toLocaleString("en-GB")}</p>
            <p className="mt-1 font-mono text-[10px] text-[var(--text-4)]">
              lines · {t.files.toLocaleString("en-GB")} files · {t.functions.toLocaleString("en-GB")} functions
            </p>
          </div>
          <div>
            <p className="widget-data-label">In complex code</p>
            <p className="mt-1 font-serif text-2xl font-bold leading-none tabular-nums text-[var(--text-1)]">{pct(t.complexLocShare)}</p>
            <p className="mt-1 font-mono text-[10px] text-[var(--text-4)]">of lines, in functions of complexity 21+</p>
          </div>
          <div>
            <p className="widget-data-label">Tests</p>
            <p className="mt-1 font-serif text-2xl font-bold leading-none tabular-nums text-[var(--text-1)]">{t.testLoc.toLocaleString("en-GB")}</p>
            <p className="mt-1 font-mono text-[10px] text-[var(--text-4)]">
              lines{t.loc > 0 ? ` · ${(t.testLoc / t.loc).toFixed(2)} per line of code` : ""}
            </p>
          </div>
        </div>

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

        <p className="border-t border-[var(--border-2)] pt-3 text-xs leading-5 text-[var(--text-3)]">
          Measured by parsing every supported source file in the repository, not a sample.
          {notMeasured.length > 0 ? ` Not measured: ${notMeasured.join(", ")}.` : ""}
          {c.truncated ? " The measure reached its size or time limit, so part of the code was not read." : ""}
          {" "}Thresholds: complexity 11+ moderate, 21+ high, 51+ very high (SEI); functions over 60 lines; classes with combined complexity 47+ or 500+ lines.
        </p>
      </div>
    </div>
  );
}
