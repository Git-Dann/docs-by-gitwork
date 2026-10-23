import { cn } from "@/lib/format";
import { compareVersions } from "@/lib/code-portfolio";
import { BENCHMARK_REFERENCES, compareToBenchmarks, type BenchmarkMetric } from "@/server/code-health/benchmark";
import { comparisonWords, type PlainSummary, type SummaryTone } from "@/lib/code-health-summary";
import type { CodeHealthReport, DependencyAudit, StructureReport, VulnerabilitySeverity } from "@/types/code-health";

/**
 * The import graph and the library audit, as sections of the code-health panel. Server-safe
 * (no hooks), because the shared report renders the panel on the server for the PDF.
 */

const SEV: Record<VulnerabilitySeverity, string> = {
  critical: "border-[var(--danger-200)] bg-[var(--danger-50)] text-[var(--danger-700)]",
  high: "border-[var(--danger-200)] bg-[var(--danger-50)] text-[var(--danger-700)]",
  moderate: "border-[var(--warning-500)]/40 bg-[var(--warning-50)] text-[var(--text-1)]",
  low: "border-[var(--border-1)] bg-[var(--surface-1)] text-[var(--text-3)]",
  unknown: "border-[var(--border-1)] bg-[var(--surface-1)] text-[var(--text-3)]",
};

function fileUrl(report: CodeHealthReport, path: string): string {
  const ref = report.commit ?? report.branch ?? "HEAD";
  return `https://github.com/${report.repo}/blob/${ref}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

const short = (p: string) => p.split("/").slice(-2).join("/");

export function StructureSection({ report, structure, rows }: { report: CodeHealthReport; structure: StructureReport; rows?: number }) {
  const cycles = structure.cycles.slice(0, rows ?? 5);
  return (
    <div className="space-y-4 border-t border-[var(--border-2)] pt-4">
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-4">
        <div>
          <p className="widget-data-label">Files tangled in loops</p>
          <p className={cn("mt-1 font-serif text-2xl font-bold leading-none tabular-nums", structure.cycleCount > 0 ? "text-[var(--danger-500)]" : "text-[var(--text-1)]")}>{structure.cycleCount}</p>
          <p className="mt-1 font-mono text-[10px] text-[var(--text-4)]">{structure.filesInCycles} files, in {structure.cycleCount} {structure.cycleCount === 1 ? "group" : "groups"}</p>
        </div>
        <div>
          <p className="widget-data-label">Risky central files</p>
          <p className="mt-1 font-serif text-2xl font-bold leading-none tabular-nums text-[var(--text-1)]">{structure.hubs.length}</p>
          <p className="mt-1 font-mono text-[10px] text-[var(--text-4)]">depended on by many, and complex</p>
        </div>
        <div>
          <p className="widget-data-label">Links between files</p>
          <p className="mt-1 font-serif text-2xl font-bold leading-none tabular-nums text-[var(--text-1)]">{structure.edges.toLocaleString("en-GB")}</p>
          <p className="mt-1 font-mono text-[10px] text-[var(--text-4)]">between {structure.modules.toLocaleString("en-GB")} files</p>
        </div>
        <div>
          <p className="widget-data-label">Longest chain</p>
          <p className="mt-1 font-serif text-2xl font-bold leading-none tabular-nums text-[var(--text-1)]">{structure.maxDepth}</p>
          <p className="mt-1 font-mono text-[10px] text-[var(--text-4)]">files, import after import</p>
        </div>
      </div>

      {cycles.length > 0 && (
        <div>
          <p className="widget-data-label">Files that depend on each other in a loop</p>
          <p className="mt-0.5 text-xs text-[var(--text-3)]">Files that import each other in a loop. None of them can be changed, tested or reused on its own; cutting one import breaks the loop.</p>
          <ul className="mt-2 space-y-1.5">
            {cycles.map((c) => (
              <li key={c.files.join("|")} className="font-mono text-[11px] leading-5 text-[var(--text-2)] [overflow-wrap:anywhere]">
                <span className="text-[var(--text-4)]">{c.files.length} files · </span>
                {c.path.map((p, i) => (
                  <span key={i}>
                    {i > 0 && <span className="text-[var(--text-4)]"> → </span>}
                    <a href={fileUrl(report, p)} target="_blank" rel="noreferrer noopener" className="hover:text-[var(--brand-600)] hover:underline" title={p}>{short(p)}</a>
                  </span>
                ))}
              </li>
            ))}
          </ul>
          {structure.cycleCount > cycles.length && (
            <p className="mt-1 font-mono text-[10px] text-[var(--text-4)]">The {cycles.length} largest of {structure.cycleCount}.</p>
          )}
        </div>
      )}

      {structure.hubs.length > 0 && (
        <div>
          <p className="widget-data-label">Risky central files</p>
          <p className="mt-0.5 text-xs text-[var(--text-3)]">Many files depend on these and they are complex, so a change to one ripples furthest.</p>
          <div className="mt-2 overflow-x-auto">
            <table className="app-table app-table--dense min-w-[520px]">
              <thead>
                <tr>
                  <th className="text-left">File</th>
                  <th className="text-right">Used by</th>
                  <th className="text-right">Uses</th>
                  <th className="text-right">Complexity</th>
                </tr>
              </thead>
              <tbody>
                {structure.hubs.slice(0, rows ?? 6).map((h) => (
                  <tr key={h.path}>
                    <td className="max-w-[360px]">
                      <a href={fileUrl(report, h.path)} target="_blank" rel="noreferrer noopener" className="block truncate font-mono text-xs text-[var(--brand-600)] hover:underline" title={h.path}>{h.path}</a>
                    </td>
                    <td className="text-right font-mono text-[11px] tabular-nums text-[var(--text-2)]">{h.fanIn}</td>
                    <td className="text-right font-mono text-[11px] tabular-nums text-[var(--text-2)]">{h.fanOut}</td>
                    <td className="text-right font-mono text-[11px] tabular-nums text-[var(--text-2)]">{h.complexity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {structure.unresolvedShare > 0.1 && (
        <p className="font-mono text-[10px] text-[var(--text-4)]">
          {Math.round(structure.unresolvedShare * 100)}% of internal-looking imports could not be traced to a file, so the graph is partial.
        </p>
      )}
    </div>
  );
}

export function DependencySection({ audit, rows }: { audit: DependencyAudit; rows?: number }) {
  if (audit.status !== "checked") {
    return (
      <div className="border-t border-[var(--border-2)] pt-4">
        <p className="widget-data-label">Outside libraries it uses</p>
        <p className="mt-1 text-xs leading-5 text-[var(--text-3)]">
          {audit.status === "no_lockfile" ? "Not checked: " : "Could not be checked: "}
          {audit.reason ?? "no reason recorded."} Nothing is claimed about them either way.
        </p>
      </div>
    );
  }
  const list = audit.vulnerable.slice(0, rows ?? 8);
  return (
    <div className="space-y-3 border-t border-[var(--border-2)] pt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="widget-data-label">Outside libraries it uses</p>
        <p className="font-mono text-[10px] text-[var(--text-4)]">
          {audit.packages.toLocaleString("en-GB")} pinned in {audit.lockfiles.map((l) => l.path).join(", ")} · checked against OSV
        </p>
      </div>
      {audit.vulnerable.length === 0 ? (
        <p className="text-xs leading-5 text-[var(--text-2)]">
          <span className="text-[var(--success-500)]">No known vulnerabilities</span> in any pinned version, as of the check.
        </p>
      ) : (
        <>
          <p className="text-xs leading-5 text-[var(--text-2)]">
            {audit.vulnerable.length} {audit.vulnerable.length === 1 ? "library has" : "libraries have"} published vulnerabilities at the version pinned:{" "}
            {(["critical", "high", "moderate", "low"] as const).filter((s) => audit.counts[s] > 0).map((s) => `${audit.counts[s]} ${s}`).join(", ")}.
          </p>
          <div className="overflow-x-auto">
            <table className="app-table app-table--dense min-w-[640px]">
              <thead>
                <tr>
                  <th className="text-left">Library</th>
                  <th className="text-left">Severity</th>
                  <th className="text-left">Advisories</th>
                  <th className="text-left">Fixed in</th>
                </tr>
              </thead>
              <tbody>
                {list.map((p) => {
                  const fixed = (p.advisories.map((a) => a.fixedIn).filter(Boolean) as string[]).sort(compareVersions);
                  return (
                    <tr key={`${p.ecosystem}:${p.name}@${p.version}`}>
                      <td>
                        <span className="block font-mono text-xs text-[var(--text-1)]">{p.name} <span className="text-[var(--text-4)]">{p.version}</span></span>
                        <span className="block font-mono text-[10px] text-[var(--text-4)]">{p.ecosystem}{p.direct === false ? " · pulled in by another package" : p.direct ? " · declared by the project" : ""}</span>
                      </td>
                      <td><span className={cn("inline-block rounded-[4px] border px-1.5 py-0.5 font-mono text-[10px] uppercase", SEV[p.severity])}>{p.severity}</span></td>
                      <td className="max-w-[320px] text-xs text-[var(--text-2)]">
                        {p.advisories.slice(0, 3).map((a) => (
                          <a key={a.id} href={a.url} target="_blank" rel="noreferrer noopener" className="block truncate hover:underline" title={a.summary}>
                            <span className="font-mono text-[10px] text-[var(--brand-600)]">{a.aliases.find((x) => x.startsWith("CVE-")) ?? a.id}</span> {a.summary}
                          </a>
                        ))}
                        {p.advisories.length > 3 && <span className="font-mono text-[10px] text-[var(--text-4)]">+{p.advisories.length - 3} more</span>}
                      </td>
                      <td className="whitespace-nowrap font-mono text-[11px] text-[var(--text-2)]">{fixed.length ? fixed[fixed.length - 1] : "no fix yet"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {audit.vulnerable.length > list.length && <p className="font-mono text-[10px] text-[var(--text-4)]">The {list.length} most severe of {audit.vulnerable.length}.</p>}
        </>
      )}
    </div>
  );
}

const BENCH_ROWS: { key: BenchmarkMetric; label: string; format: (n: number) => string }[] = [
  { key: "complexityPerKloc", label: "How tangled the logic is", format: (n) => String(Math.round(n)) },
  { key: "complexLocShare", label: "Code inside hard-to-follow functions", format: (n) => `${Math.round(n * 100)}%` },
  { key: "averageComplexity", label: "How complicated a typical function is", format: (n) => n.toFixed(1) },
  { key: "debtPerKloc", label: "Problems found per 1,000 lines", format: (n) => n.toFixed(1) },
];

const VERDICT_TONE: Record<string, string> = {
  "simpler than most": "text-[var(--success-500)]",
  "about average": "text-[var(--text-1)]",
  "more complicated than most": "text-[var(--danger-500)]",
  "more complicated than almost all": "text-[var(--danger-500)]",
};

/**
 * How this repository compares with well-known open-source projects measured the same way,
 * in words: one row per measure, a verdict, and the two numbers behind it.
 */
export function BenchmarkSection({ report }: { report: CodeHealthReport }) {
  const cmp = compareToBenchmarks(report);
  if (!cmp) return null;
  const names = BENCHMARK_REFERENCES.map((r) => r.name);
  return (
    <div className="space-y-2 border-t border-[var(--border-2)] pt-4">
      <p className="widget-data-label">Compared with well-known projects</p>
      <p className="text-xs leading-5 text-[var(--text-3)]">
        The same measure run on {cmp.referenceCount} respected open-source projects ({names.slice(0, 3).join(", ")} and {cmp.referenceCount - 3} others), so the numbers mean something.
      </p>
      <div className="overflow-x-auto">
        <table className="app-table app-table--dense min-w-[520px]">
          <thead>
            <tr>
              <th className="text-left">Measure</th>
              <th className="text-left">This code is…</th>
              <th className="text-right">This code</th>
              <th className="text-right">Typical</th>
            </tr>
          </thead>
          <tbody>
            {BENCH_ROWS.map(({ key, label, format }) => {
              const m = cmp.metrics[key];
              const verdict = comparisonWords(m.betterThan + m.ties / 2, cmp.referenceCount);
              return (
                <tr key={key}>
                  <td className="text-xs text-[var(--text-2)]">{label}</td>
                  <td className={cn("text-xs font-medium", VERDICT_TONE[verdict])} title={m.reading}>{verdict}</td>
                  <td className="text-right font-mono text-[11px] tabular-nums text-[var(--text-2)]">{format(m.value)}</td>
                  <td className="text-right font-mono text-[11px] tabular-nums text-[var(--text-3)]" title={`Middle value of the ${cmp.referenceCount} projects`}>{format(m.references.median)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="font-mono text-[10px] leading-4 text-[var(--text-4)]" title={BENCHMARK_REFERENCES.map((r) => `${r.name} ${r.ref}`).join(", ")}>
        Lower is better on every measure. Projects compared: {names.join(", ")}.
      </p>
    </div>
  );
}

const SUMMARY_DOT: Record<SummaryTone, string> = {
  good: "bg-[var(--success-500)]",
  watch: "bg-[var(--warning-500)]",
  bad: "bg-[var(--danger-500)]",
};

/** The plain-English summary that leads the code-health section and the portfolio. */
export function PlainSummaryBox({ summary }: { summary: PlainSummary }) {
  return (
    <div className="rounded-[10px] border border-[var(--border-1)] bg-[var(--surface-1)] px-4 py-3.5">
      <p className="widget-data-label">In plain English</p>
      <p className="mt-1.5 text-[15px] font-medium leading-6 text-[var(--text-1)]">{summary.headline}</p>
      {summary.lines.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {summary.lines.map((l, i) => (
            <li key={i} className="flex gap-2.5 text-sm leading-6 text-[var(--text-2)]">
              <span aria-hidden className={cn("mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full", SUMMARY_DOT[l.tone])} />
              <span>{l.text}</span>
            </li>
          ))}
        </ul>
      )}
      {summary.firstStep && (
        <p className="mt-2.5 border-t border-[var(--border-2)] pt-2.5 text-sm leading-6 text-[var(--text-2)]">
          <span className="font-medium text-[var(--text-1)]">Where to start: </span>
          {summary.firstStep}
        </p>
      )}
    </div>
  );
}
