"use client";

import { PulseFindings } from "@/components/pulse/pulse-findings";
import { STATUS_WORDS } from "@/lib/pulse-status-words";
import { cn } from "@/lib/format";
import { CheckCircleIcon, ChevronDownIcon, ChevronRightIcon, PlusIcon } from "@heroicons/react/24/outline";
import { PulseCheckStatusIcon } from "@/components/pulse/pulse-shared";
import { policyDisposition } from "@/server/pulse-checks/policy-disposition";
import { findingTaskHref, stageLabel } from "@/lib/pulse-findings";
import Link from "next/link";
import { StatusLegend, categoryScore } from "./scan-helpers";
import type { ScanView } from "./use-scan-view";

export function renderChecksTab(v: ScanView) {
  const { addCheckTask, canManagePulse, checkStatusFilter, checksByCategory, checksSortBySeverity, checksView, expandedCategories, findingByKey, pendingCheckKey, primary, scan, scanDiff, sectionNo, setCheckStatusFilter, setChecksSortBySeverity, setChecksView, toggleCategory } = v;
  return (
    <>
      {primary === "checks" && checksView === "findings" && (
        <PulseFindings
          scanId={scan.id}
          clientId={scan.clientId}
          checks={scan.checks}
          diff={scanDiff}
          canManage={canManagePulse}
          num={sectionNo()}
          onShowAllChecks={() => setChecksView("all")}
        />
      )}

      {primary === "checks" && checksView === "all" && (
        <button type="button" onClick={() => setChecksView("findings")} className="inline-flex items-center gap-1 text-sm text-[var(--brand-600)] hover:underline">
          ← Back to findings
        </button>
      )}

      {primary === "checks" && checksView === "all" && (() => {
        // Checks the jurisdiction filter excluded. Identified by the marker phrase
        // applyJurisdictionFilter writes into `detail` — the only signal that
        // survives onto the persisted check, since there is no separate skip-reason
        // field on the record.
        const jurisdictionSkipped = scan.checks.filter(
          (c) => c.status === "SKIPPED" && (c.detail ?? "").startsWith("Not applicable to your selected markets"),
        );
        const declared = scan.targetMarkets ?? [];
        const marketLabel = declared.length > 0
          ? declared.join(", ")
          : (scan.detectedMarkets ?? []).join(", ") || "your markets";

        const failCount = scan.checks.filter((c) => c.status === "FAIL").length;
        const warnCount = scan.checks.filter((c) => c.status === "WARN").length;
        const passCount = scan.checks.filter((c) => c.status === "PASS").length;
        const UNKNOWN = ["ERROR", "INCONCLUSIVE", "NOT_TESTED", "EVIDENCE_REQUIRED"];
        const unknownCount = scan.checks.filter((c) => UNKNOWN.includes(c.status)).length;
        // "Couldn't check" covers every status that means Pulse had no verdict.
        const matchesFilter = (c: { status: string }) =>
          checkStatusFilter === "ALL" || (checkStatusFilter === "INCONCLUSIVE" ? UNKNOWN.includes(c.status) : c.status === checkStatusFilter);

        let entries = Array.from(checksByCategory.entries());
        if (checkStatusFilter !== "ALL") {
          entries = entries.filter(([, checks]) => checks.some(matchesFilter));
        }
        if (checksSortBySeverity) {
          entries = [...entries].sort(([, a], [, b]) => {
            const aFail = a.filter((c) => c.status === "FAIL").length;
            const bFail = b.filter((c) => c.status === "FAIL").length;
            if (aFail !== bFail) return bFail - aFail;
            return b.filter((c) => c.status === "WARN").length - a.filter((c) => c.status === "WARN").length;
          });
        }

        return (
          <div className="widget-card">
            <div className="widget-header">
              <span className="widget-header-label">{`${sectionNo()} // HEALTH CHECKS`}</span>
              <span className="widget-header-right">{failCount} {STATUS_WORDS.FAIL.toLowerCase()} · {warnCount} {STATUS_WORDS.WARN.toLowerCase()} · {passCount} {STATUS_WORDS.PASS.toLowerCase()}</span>
            </div>
            <div className="widget-body space-y-3">
            {/* Selected markets — shown HERE, beside the checks, not only as a
                separate Compliance tab. Declaring a market genuinely changes which
                checks count: applyJurisdictionFilter marks the ones that target
                other regions SKIPPED, so they stop affecting the score. Without
                this strip that filtering was invisible and the selection looked
                like it had only added a tab. */}
            {jurisdictionSkipped.length > 0 && (
              <div className="rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] p-3">
                <p className="widget-data-label mb-1.5">
                  {scan.targetMarkets && scan.targetMarkets.length > 0 ? "Your selected markets" : "Detected markets"}
                </p>
                <p className="text-sm text-[var(--text-2)]">
                  <span className="font-semibold text-[var(--text-1)]">{marketLabel}</span>
                  {" — "}
                  {jurisdictionSkipped.length} check{jurisdictionSkipped.length === 1 ? "" : "s"} that target other
                  regions {jurisdictionSkipped.length === 1 ? "was" : "were"} excluded from the score.
                </p>
                <details className="mt-1.5">
                  <summary className="cursor-pointer text-xs text-[var(--text-4)] hover:text-[var(--text-2)]">
                    Show what was excluded
                  </summary>
                  <div className="mt-1.5 space-y-1">
                    {jurisdictionSkipped.map((c) => (
                      <div key={c.checkKey} className="flex items-baseline gap-2 text-xs">
                        <span className="min-w-0 flex-1 text-[var(--text-3)]">{c.label}</span>
                        <span className="shrink-0 text-[var(--text-4)]">{c.category}</span>
                      </div>
                    ))}
                  </div>
                </details>
              </div>
            )}

            {/* Filter chips + sort toggle */}
            <div className="flex flex-wrap items-center gap-2">
              {(["ALL", "FAIL", "WARN", "INCONCLUSIVE", "PASS"] as const).map((f) => {
                const count = f === "ALL" ? scan.checks.filter((c) => c.status !== "SKIPPED" && c.status !== "NOT_APPLICABLE").length
                  : f === "FAIL" ? failCount : f === "WARN" ? warnCount : f === "INCONCLUSIVE" ? unknownCount : passCount;
                if (f === "INCONCLUSIVE" && count === 0) return null;
                const isActive = checkStatusFilter === f;
                return (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setCheckStatusFilter(f)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-medium transition",
                      isActive && f === "FAIL" ? "border-red-300 bg-red-100 text-red-700"
                      : isActive && f === "WARN" ? "border-amber-300 bg-amber-100 text-amber-700"
                      : isActive && f === "PASS" ? "border-emerald-300 bg-emerald-100 text-emerald-700"
                      : isActive ? "border-[var(--brand-300)] bg-[var(--brand-50)] text-[var(--brand-700)]"
                      : "border-[var(--border-2)] bg-white text-[var(--text-3)] hover:bg-[var(--surface-1)]",
                    )}
                  >
                    {f === "ALL" ? "All" : STATUS_WORDS[f]} ({count})
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setChecksSortBySeverity((v) => !v)}
                className={cn(
                  "ml-auto rounded-[6px] border px-3 py-1 text-xs font-medium transition",
                  checksSortBySeverity
                    ? "border-gray-700 bg-gray-900 text-white"
                    : "border-[var(--border-2)] bg-white text-[var(--text-3)] hover:bg-[var(--surface-1)]",
                )}
              >
                {checksSortBySeverity ? "Severity ↓" : "Sort: Category"}
              </button>
            </div>
            <StatusLegend />

            {/* Code Quality on a URL-only scan is inferred from public page signals, not real
                repo access (README/tests/CI/linter/branch protection need runGithubChecks()) —
                say so explicitly rather than letting a thin or missing Code Quality section
                read as a silent gap. Mirrors the Tech Stack tab's "provide a GitHub repo" note. */}
            {scan.inputType !== "GITHUB_REPO" && (
              <div className="rounded-[10px] border border-dashed border-[var(--border-2)] bg-[var(--surface-1)] p-3">
                <p className="text-xs text-[var(--text-3)]">
                  <span className="font-medium text-[var(--text-2)]">Code Quality</span> checks here are inferred
                  from public page signals only — provide a GitHub repo URL for deeper analysis (README, tests,
                  CI/CD, linter, branch protection, dependency intelligence).
                </p>
              </div>
            )}

            {/* Category list */}
            <div className="space-y-2">
              {entries.map(([category, checks]) => {
                const applicable = checks.filter((c) => c.status !== "SKIPPED" && c.status !== "NOT_APPLICABLE");
                if (!applicable.length) return null;
                const storedCategory = scan.scoreBreakdown?.byCategory.find((item) => item.category === category);
                const score = storedCategory && storedCategory.possible > 0
                  ? Math.round((storedCategory.earned / storedCategory.possible) * 100)
                  : categoryScore(checks);
                const failed = checks.filter((c) => c.status === "FAIL").length;
                const warned = checks.filter((c) => c.status === "WARN").length;
                const passed = checks.filter((c) => c.status === "PASS").length;
                const unknown = checks.filter((c) => ["ERROR", "INCONCLUSIVE", "NOT_TESTED", "EVIDENCE_REQUIRED"].includes(c.status)).length;
                const hasIssues = failed > 0 || warned > 0;
                const isExpanded = expandedCategories.has(category) || checkStatusFilter !== "ALL";
                const visibleChecks = applicable.filter(matchesFilter);

                return (
                  <div key={category} className="overflow-hidden rounded-[10px] border border-[var(--border-2)]">
                    <button
                      type="button"
                      onClick={() => toggleCategory(category)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--surface-1)]"
                    >
                      <span className="text-[var(--text-4)]">
                        {isExpanded ? <ChevronDownIcon className="h-4 w-4" /> : <ChevronRightIcon className="h-4 w-4" />}
                      </span>
                      <span className="flex-1 text-sm font-semibold text-[var(--text-1)]">{category}</span>
                      <div className="flex items-center gap-2">
                        {failed > 0 && (
                          <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">{failed} failed</span>
                        )}
                        {warned > 0 && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">{warned} warn</span>
                        )}
                        {unknown > 0 && (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{unknown} unknown</span>
                        )}
                        {!hasIssues && unknown === 0 && (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">{passed} passed</span>
                        )}
                        <span className={cn(
                          "text-xs font-semibold tabular-nums",
                          score >= 80 ? "text-emerald-600" : score >= 50 ? "text-amber-600" : "text-red-600",
                        )}>
                          {score}%
                        </span>
                      </div>
                    </button>
                    {isExpanded && (
                      <div className="divide-y divide-[var(--border-2)] border-t border-[var(--border-2)]">
                        {visibleChecks.map((check) => (
                          <div key={check.id} className={cn(
                            "flex items-start gap-3 px-4 py-3",
                            check.status === "FAIL" ? "bg-red-50" : "bg-[var(--surface-1)]",
                          )}>
                            <span className="mt-0.5 text-base">
                              <PulseCheckStatusIcon status={check.status} />
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm font-medium text-[var(--text-1)]">{check.label}</p>
                                {check.confidence && check.status !== "SKIPPED" && (
                                  <span
                                    title={check.confidenceReason ?? undefined}
                                    className={cn(
                                      "rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                                      check.trustBucket === "INCONCLUSIVE" ? "bg-[var(--surface-2)] text-[var(--text-3)]"
                                      : check.confidence === "HIGH" ? "bg-emerald-50 text-emerald-700"
                                      : check.confidence === "LOW" ? "bg-amber-50 text-amber-700"
                                      : "bg-[var(--surface-1)] text-[var(--text-3)]",
                                    )}
                                  >
                                    {check.trustBucket === "INCONCLUSIVE" ? "inconclusive"
                                      : check.confidence === "HIGH" ? "confirmed"
                                      : `${check.confidence.toLowerCase()} confidence`}
                                  </span>
                                )}
                              </div>
                              {check.detail && (
                                <p className="mt-0.5 text-xs text-[var(--text-3)]">{check.detail}</p>
                              )}
                              {/* What the scanner found, when workspace policy changed it.
                                  Two separate facts — the detector's finding and the
                                  workspace's decision about it — and the row used to show
                                  only the second, so a disabled check read as if nothing
                                  had been found. */}
                              {check.detectorStatus && check.detectorStatus !== check.status && (
                                <p className="mt-0.5 text-xs text-[var(--text-4)]">
                                  <span className="widget-data-label">
                                    {policyDisposition(check) === "DISABLED" ? "Workspace disabled" : "Workspace re-graded"}
                                  </span>
                                  {" · scanner found "}
                                  <span className="font-semibold text-[var(--text-3)]">{check.detectorStatus}</span>
                                  {check.detectorDetail ? ` — ${check.detectorDetail}` : ""}
                                </p>
                              )}
                              {check.evidence && (
                                <p className="mt-0.5 font-mono text-[10px] leading-4 text-[var(--text-4)]">{check.evidence}</p>
                              )}
                            </div>
                            {(check.status === "FAIL" || check.status === "WARN") && (() => {
                              const finding = findingByKey.get(check.checkKey);
                              const taskHref = finding?.task ? findingTaskHref(finding.task) : null;
                              if (finding?.task) {
                                const chip = (
                                  <>
                                    <CheckCircleIcon className="h-3 w-3" />
                                    {finding.stage === "task_done" ? "Task done" : "On board"}
                                  </>
                                );
                                const cls = "mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-[5px] border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700";
                                return taskHref
                                  ? <Link href={taskHref} className={cn(cls, "hover:underline")} title={`On this client's task board: ${finding.task.title}`}>{chip}</Link>
                                  : <span className={cls} title="On this client's task board">{chip}</span>;
                              }
                              if (finding?.stage === "accepted" || finding?.stage === "false_positive") {
                                return (
                                  <span className="mt-0.5 inline-flex shrink-0 items-center rounded-[5px] border border-[var(--border-2)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-3)]" title={stageLabel(finding)}>
                                    Dismissed
                                  </span>
                                );
                              }
                              if (!scan.clientId || !canManagePulse) return null;
                              const pending = pendingCheckKey === check.checkKey;
                              return (
                                <button
                                  type="button"
                                  disabled={pending}
                                  onClick={() => addCheckTask(check)}
                                  className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-[5px] border border-[var(--border-2)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-2)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:cursor-default"
                                  title="Add to this client's task board"
                                >
                                  {pending ? (
                                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                  ) : (
                                    <PlusIcon className="h-3 w-3" />
                                  )}
                                  Task
                                </button>
                              );
                            })()}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}

export function renderComplianceScorecard(v: ScanView) {
  const { checksView, primary, scan, scorecard } = v;
  return (
    <>
      {primary === "checks" && checksView === "all" && scorecard.length > 0 && (
        <div className="space-y-4" id="compliance">
          <p className="widget-data-label">By market</p>
          <p className="text-sm text-[var(--text-3)]">
            What each market this product serves legally requires — and what&apos;s missing.{" "}
            {scan.targetMarkets && scan.targetMarkets.length > 0
              ? "Markets you selected for this scan."
              : "Auto-detected from the site — declare target markets when scanning for a precise view."}
          </p>
          {scorecard.length === 0 ? (
            <div className="app-muted-card p-6 text-center text-sm text-[var(--text-3)]">
              No market-specific compliance requirements were assessed for this scan.
            </div>
          ) : (
            scorecard.map((entry) => {
              const tone = entry.compliancePct >= 80 ? "text-emerald-600" : entry.compliancePct >= 50 ? "text-amber-600" : "text-red-600";
              return (
                <div key={entry.jurisdiction} className="widget-card">
                  <div className="widget-header">
                    <span className="widget-header-label">{entry.label} · {entry.primaryLaw}</span>
                    <span className={cn("widget-header-right tabular-nums", tone)}>
                      {entry.compliancePct}% · {entry.passing}/{entry.requiredChecks}
                    </span>
                  </div>
                  <div className="widget-body space-y-2">
                    {entry.missing.length === 0 ? (
                      <p className="text-sm font-medium text-emerald-600">All {entry.requiredChecks} requirements satisfied.</p>
                    ) : (
                      <>
                        <p className="widget-data-label">{entry.failing} requirement{entry.failing !== 1 ? "s" : ""} missing</p>
                        {entry.missing.map((m) => (
                          <div key={m.checkKey} className="rounded-[8px] border border-[var(--border-2)] p-3">
                            <p className="text-sm font-medium text-[var(--text-1)]">{m.label}</p>
                            {m.detail && <p className="mt-0.5 text-xs leading-5 text-[var(--text-3)]">{m.detail}</p>}
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </>
  );
}
