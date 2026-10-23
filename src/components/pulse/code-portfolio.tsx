"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useCodePortfolio } from "@/hooks/use-pulse";
import { cn, formatDate } from "@/lib/format";
import { planPortfolio, type PortfolioRepo, type WorkItem } from "@/lib/code-portfolio";
import { summarisePortfolio } from "@/lib/code-health-summary";
import { PlainSummaryBox } from "./code-health-sections";

/**
 * The code portfolio: every measured repository side by side, and where the next N
 * developer-days do the most good across all of them. Each row and each planned item
 * links back to the scan it was measured in.
 */

const LANE: Record<WorkItem["lane"], { label: string; cls: string }> = {
  security: { label: "Security", cls: "border-[var(--danger-200)] bg-[var(--danger-50)] text-[var(--danger-700)]" },
  change_risk: { label: "Change risk", cls: "border-[var(--warning-500)]/40 bg-[var(--warning-50)] text-[var(--text-1)]" },
  maintainability: { label: "Maintainability", cls: "border-[var(--border-1)] bg-[var(--surface-1)] text-[var(--text-3)]" },
};

const DAY_STEPS = [1, 2, 3, 5, 10, 15, 20, 30, 40, 60];

/** The change since the previous measure, in words rather than a chart. */
function Change({ points }: { points: { score: number }[] }) {
  if (points.length < 2) return <span className="text-[11px] text-[var(--text-4)]">first check</span>;
  const d = points[points.length - 1].score - points[points.length - 2].score;
  if (d === 0) return <span className="text-[11px] text-[var(--text-3)]">no change</span>;
  return (
    <span className={cn("whitespace-nowrap text-[11px] font-medium", d > 0 ? "text-[var(--success-500)]" : "text-[var(--danger-500)]")} title={`Scores so far: ${points.map((p) => p.score).join(", ")}`}>
      {d > 0 ? "better" : "worse"} by {Math.abs(d)}
    </span>
  );
}

function Stat({ label, value, note, tone }: { label: string; value: string; note: string; tone?: "bad" | "good" }) {
  return (
    <div>
      <p className="widget-data-label">{label}</p>
      <p className={cn("mt-1 font-serif text-2xl font-bold leading-none tabular-nums", tone === "bad" ? "text-[var(--danger-500)]" : "text-[var(--text-1)]")}>{value}</p>
      <p className="mt-1 font-mono text-[10px] text-[var(--text-4)]">{note}</p>
    </div>
  );
}

function bandClass(band: PortfolioRepo["band"]) {
  return band === "good" ? "text-[var(--success-500)]" : band === "fair" ? "text-[var(--text-2)]" : "text-[var(--danger-500)]";
}

export function CodePortfolioView() {
  const { data, isLoading, error } = useCodePortfolio();
  const [dayIdx, setDayIdx] = useState(4);
  const [devs, setDevs] = useState(2);
  const days = DAY_STEPS[dayIdx];
  const plan = useMemo(() => planPortfolio(data?.items ?? [], days), [data?.items, days]);

  if (isLoading) return <div className="widget-card"><div className="widget-body text-sm text-[var(--text-3)]">Loading the portfolio…</div></div>;
  if (error || !data) return <div className="widget-card"><div className="widget-body text-sm text-[var(--danger-700)]">The portfolio could not be loaded.</div></div>;

  const repos = data.repos;
  if (repos.length === 0) {
    return (
      <div className="widget-card">
        <div className="widget-header"><span className="widget-header-label">01 // CODE PORTFOLIO</span></div>
        <div className="widget-body text-sm leading-6 text-[var(--text-2)]">
          No repository has been measured yet. Scan a GitHub repository in Pulse and it appears here, with its code health, libraries and structure, next to every other.
        </div>
      </div>
    );
  }

  const loc = repos.reduce((s, r) => s + r.loc, 0);
  const debtDays = repos.reduce((s, r) => s + (r.debtDays ?? 0), 0);
  const vulnRepos = repos.filter((r) => r.vulnerable);
  const critHigh = vulnRepos.reduce((s, r) => s + r.vulnerable!.critical + r.vulnerable!.high, 0);
  const cycles = repos.reduce((s, r) => s + (r.cycles ?? 0), 0);
  const structured = repos.filter((r) => r.cycles !== null).length;
  const worsening = repos.filter((r) => r.history.length >= 2 && r.history[r.history.length - 1].score < r.history[r.history.length - 2].score).length;
  const knowledge = repos.filter((r) => r.knowledgeRisk).length;
  const scanOf = new Map(repos.map((r) => [r.repo, r.scanId]));
  const maxRepoDays = Math.max(1, ...plan.byRepo.map((r) => r.days));
  const weeks = Math.max(1, Math.ceil(plan.usedDays / devs / 5));

  return (
    <div className="space-y-6">
      <div className="widget-card">
        <div className="widget-header">
          <span className="widget-header-label">01 // CODE PORTFOLIO</span>
          <span className="widget-header-right">{repos.length} {repos.length === 1 ? "repository" : "repositories"}</span>
        </div>
        <div className="widget-body space-y-5">
          <PlainSummaryBox summary={summarisePortfolio(repos, data.items)} />
          <div className="grid grid-cols-2 gap-x-6 gap-y-5 md:grid-cols-3 xl:grid-cols-6">
            <Stat label="Code measured" value={loc.toLocaleString("en-GB")} note={`lines across ${repos.length} repos`} />
            <Stat label="Work to tidy up" value={`${Math.round(debtDays).toLocaleString("en-GB")}`} note="developer-days, estimated" />
            <Stat
              label="Serious security holes"
              value={vulnRepos.length ? String(critHigh) : "—"}
              note={vulnRepos.length ? `critical or high, in ${vulnRepos.length} checked repo${vulnRepos.length === 1 ? "" : "s"}` : "no repo checked yet"}
              tone={critHigh > 0 ? "bad" : undefined}
            />
            <Stat label="Tangled file groups" value={structured ? String(cycles) : "—"} note={structured ? `in ${structured} mapped repo${structured === 1 ? "" : "s"}` : "no repo mapped yet"} />
            <Stat label="Getting worse" value={String(worsening)} note="score fell on the last scan" tone={worsening > 0 ? "bad" : undefined} />
            <Stat label="Knowledge risk" value={String(knowledge)} note="one person writes most of it" tone={knowledge > 0 ? "bad" : undefined} />
          </div>
        </div>
      </div>

      <div className="widget-card">
        <div className="widget-header">
          <span className="widget-header-label">02 // REPOSITORIES</span>
          <span className="widget-header-right">worst first</span>
        </div>
        <div className="widget-body">
          <div className="overflow-x-auto">
            <table className="app-table app-table--dense min-w-[900px]">
              <thead>
                <tr>
                  <th className="text-left">Repository</th>
                  <th className="text-right">Score</th>
                  <th className="text-left">Since last check</th>
                  <th className="text-right">Lines</th>
                  <th className="text-right">Debt</th>
                  <th className="text-left">Security holes</th>
                  <th className="text-right">Tangled</th>
                  <th className="text-right">Who knows it</th>
                  <th className="text-left">Measured</th>
                </tr>
              </thead>
              <tbody>
                {repos.map((r) => (
                  <tr key={r.repo}>
                    <td className="max-w-[280px]">
                      <Link href={`/app/pulse/${r.scanId}`} className="block truncate font-mono text-xs text-[var(--brand-600)] hover:underline" title={r.repo}>
                        {r.repo}
                      </Link>
                      <span className="block truncate text-[11px] text-[var(--text-4)]" title={[r.clientName, r.primaryLanguage].filter(Boolean).join(" · ")}>
                        {[r.clientName, r.primaryLanguage].filter(Boolean).join(" · ") || "No client"}
                      </span>
                    </td>
                    <td className="text-right">
                      <span className="font-serif text-lg font-bold tabular-nums text-[var(--text-1)]">{r.score}</span>
                      <span className={cn("ml-1 font-mono text-[9px] uppercase", bandClass(r.band))}>{r.band}</span>
                    </td>
                    <td><Change points={r.history} /></td>
                    <td className="text-right font-mono text-[11px] tabular-nums text-[var(--text-2)]">{r.loc.toLocaleString("en-GB")}</td>
                    <td className="whitespace-nowrap text-right font-mono text-[11px] tabular-nums text-[var(--text-2)]">{r.debtDays != null ? `${r.debtDays}d` : "—"}</td>
                    <td className="whitespace-nowrap font-mono text-[11px]">
                      {r.vulnerable ? (
                        r.vulnerable.critical + r.vulnerable.high + r.vulnerable.other === 0 ? (
                          <span className="text-[var(--success-500)]">none known</span>
                        ) : (
                          <span className="text-[var(--text-2)]">
                            {r.vulnerable.critical > 0 && <span className="text-[var(--danger-500)]">{r.vulnerable.critical} critical </span>}
                            {r.vulnerable.high > 0 && <span className="text-[var(--danger-500)]">{r.vulnerable.high} high </span>}
                            {r.vulnerable.other > 0 && <span>{r.vulnerable.other} other</span>}
                          </span>
                        )
                      ) : (
                        <span className="text-[var(--text-4)]" title={r.dependencyNote ?? undefined}>not checked</span>
                      )}
                    </td>
                    <td className="text-right font-mono text-[11px] tabular-nums text-[var(--text-2)]">{r.cycles ?? "—"}</td>
                    <td className={cn("whitespace-nowrap text-right text-[11px]", r.knowledgeRisk ? "font-medium text-[var(--danger-500)]" : "text-[var(--text-2)]")} title="The fewest people who wrote over half of the code that changes">{r.busFactor == null ? "—" : r.busFactor === 1 ? "1 person" : `${r.busFactor} people`}</td>
                    <td className="whitespace-nowrap font-mono text-[11px] text-[var(--text-3)]" title={r.commit ?? undefined}>{formatDate(r.measuredAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.unmeasured.length > 0 && (
            <p className="mt-3 text-xs leading-5 text-[var(--text-3)]">
              Scanned but not measured: {data.unmeasured.map((u) => u.repo).join(", ")}. Their code could not be read (private and not shared with Gitwork&apos;s GitHub access, too large, or a language the measure does not read yet), so they are left out rather than shown as healthy.
            </p>
          )}
        </div>
      </div>

      <div className="widget-card">
        <div className="widget-header">
          <span className="widget-header-label">03 // WHERE TO SPEND THE NEXT {days} {days === 1 ? "DAY" : "DAYS"}</span>
          {/* The same figure leads the body, so on a phone the header keeps only its title. */}
          <span className="widget-header-right hidden sm:inline">{Math.round(plan.riskRemovedShare * 100)}% of measured risk</span>
        </div>
        <div className="widget-body space-y-5">
          <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_220px]">
            <div>
              <label htmlFor="cp-days" className="widget-data-label">Developer-days to spend</label>
              <input
                id="cp-days"
                type="range"
                min={0}
                max={DAY_STEPS.length - 1}
                step={1}
                value={dayIdx}
                onChange={(e) => setDayIdx(Number(e.target.value))}
                className="mt-2 w-full accent-[var(--brand-600)]"
                aria-valuetext={`${days} days`}
              />
              <div className="mt-1 flex justify-between font-mono text-[10px] text-[var(--text-4)]">
                {DAY_STEPS.map((d) => <span key={d}>{d}</span>)}
              </div>
            </div>
            <div>
              <label htmlFor="cp-devs" className="widget-data-label">Developers on it</label>
              <select id="cp-devs" value={devs} onChange={(e) => setDevs(Number(e.target.value))} className="app-select mt-2 w-full">
                {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} {n === 1 ? "developer" : "developers"}</option>)}
              </select>
              <p className="mt-1 font-mono text-[10px] text-[var(--text-4)]">about {weeks} {weeks === 1 ? "week" : "weeks"} of calendar time</p>
            </div>
          </div>

          <p className="text-sm leading-6 text-[var(--text-2)]">
            {plan.chosen.length === 0
              ? "Nothing fits in that budget. Give it more days."
              : <>
                  {plan.chosen.length} {plan.chosen.length === 1 ? "piece" : "pieces"} of work, {plan.usedDays} of {days} days, removing about{" "}
                  <strong className="font-semibold text-[var(--text-1)]">{Math.round(plan.riskRemovedShare * 100)}%</strong> of the risk Pulse measured across the portfolio.
                </>}
            {plan.securityLeftOut > 0 && (
              <span className="text-[var(--danger-700)]"> {plan.securityLeftOut} known {plan.securityLeftOut === 1 ? "vulnerability fix does" : "vulnerability fixes do"} not fit: add days before anything else.</span>
            )}
          </p>

          {plan.byRepo.length > 0 && (
            <div className="space-y-1.5">
              {plan.byRepo.map((r) => (
                <div key={r.repo} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 sm:grid-cols-[minmax(0,180px)_minmax(0,1fr)_auto]">
                  <span className="truncate font-mono text-[11px] text-[var(--text-2)]" title={r.repo}>{r.repo}</span>
                  <span className="order-last col-span-2 h-2 rounded-full bg-[var(--surface-2)] sm:order-none sm:col-span-1">
                    <span className="block h-2 rounded-full bg-[var(--brand-600)]" style={{ width: `${(r.days / maxRepoDays) * 100}%` }} />
                  </span>
                  <span className="whitespace-nowrap text-right font-mono text-[11px] tabular-nums text-[var(--text-3)]">{r.days}d · {r.items} {r.items === 1 ? "item" : "items"}</span>
                </div>
              ))}
            </div>
          )}

          {plan.chosen.length > 0 && (
            <ol className="divide-y divide-[var(--border-2)] border-y border-[var(--border-2)]">
              {plan.chosen.map((it, i) => (
                <li key={it.repo + it.id} className="grid grid-cols-[28px_minmax(0,1fr)_auto] gap-3 py-2.5">
                  <span className="pt-0.5 font-mono text-[10px] tabular-nums text-[var(--text-4)]">{String(i + 1).padStart(2, "0")}</span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn("rounded-[4px] border px-1.5 py-0.5 font-mono text-[9px] uppercase", LANE[it.lane].cls)}>{LANE[it.lane].label}</span>
                      <span className="text-sm font-medium text-[var(--text-1)]">{it.title}</span>
                    </div>
                    <p className="mt-0.5 text-xs leading-5 text-[var(--text-3)]">{it.why}</p>
                    <Link
                      href={scanOf.get(it.repo) ? `/app/pulse/${scanOf.get(it.repo)}` : "#"}
                      className="mt-0.5 block truncate font-mono text-[10px] text-[var(--text-4)] hover:text-[var(--brand-600)]"
                      title={`${it.repo}${it.path ? ` · ${it.path}` : ""}`}
                    >
                      {it.repo}{it.path ? ` · ${it.path}` : ""}
                    </Link>
                  </div>
                  <span className="whitespace-nowrap pt-0.5 text-right font-mono text-[11px] tabular-nums text-[var(--text-2)]">{it.days}d</span>
                </li>
              ))}
            </ol>
          )}

          <p className="text-xs leading-5 text-[var(--text-3)]">
            How it is ranked: known vulnerabilities first, whatever they cost, because an exploit is not a style issue. Then everything else by risk removed per day,
            where debt in a file that changes often counts up to four times debt in a file nobody touches. Every item is a measurement from the latest scan of its
            repository; nothing here is guessed or written by AI. Days are planning estimates, not quotes.
          </p>
        </div>
      </div>
    </div>
  );
}
