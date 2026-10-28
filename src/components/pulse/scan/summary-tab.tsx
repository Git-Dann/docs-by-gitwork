"use client";

import { cn } from "@/lib/format";
import { AI_MATURITY_LABELS } from "@/types/pulse";
import { CodeHealthPanel } from "@/components/pulse/code-health-panel";
import { ScanDiffBody, ScoreChange } from "@/components/pulse/pulse-scan-diff";
import Link from "next/link";
import { encodeTargetKey, targetKey } from "@/lib/pulse-projects";
import { ChevronDownIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { ScoreExplainer } from "./score-explainer";
import { PillarStrip } from "./scan-helpers";
import { VitalMetric, VitalScore } from "./vitals";
import { DiscoveryTab } from "./discovery-tab";
import type { ScanView } from "./use-scan-view";

export function renderSummaryAnnotations(v: ScanView) {
  const { grades, inSummary, llm, scan, scanDiff, scoreHistory } = v;
  return (
    <>
      {/* Detail annotation row — trust-bucket confidence breakdown, letter grades, AI maturity,
          and the score-history trend. Secondary/detail context under the cover's primary
          pass/warn/fail strip, rather than a second competing stat block. */}
      {inSummary && (() => {
        const b = (name: string) => scan.checks.filter((c) => c.trustBucket === name).length;
        const confirmed = b("CONFIRMED"), likely = b("LIKELY"), inconclusive = b("INCONCLUSIVE"), working = b("VERIFIED_WORKING");
        const hasTrust = confirmed + likely + inconclusive + working > 0;
        const hasGrades = grades.length > 0;
        const hasTrend = scoreHistory.length >= 2;
        const hasMaturity = llm?.aiMaturityScore != null;
        if (!hasTrust && !hasGrades && !hasTrend && !hasMaturity && !scan.scoreBreakdown) return null;
        return (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] px-4 py-3">
            {hasTrust && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs tabular-nums">
                <span className="widget-data-label">Confidence</span>
                {working > 0 && <span className="text-emerald-600">{working} verified working</span>}
                {confirmed > 0 && <span className="text-red-600">{confirmed} confirmed issue{confirmed !== 1 ? "s" : ""}</span>}
                {likely > 0 && <span className="text-amber-600">{likely} likely</span>}
                {inconclusive > 0 && <span className="text-[var(--text-3)]">{inconclusive} inconclusive</span>}
              </div>
            )}
            {hasGrades && (
              <div className="flex flex-wrap items-center gap-2">
                {grades.map((g) => {
                  const tone = g.grade === "A+" || g.grade === "A" ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : g.grade === "B" || g.grade === "C" ? "border-amber-200 bg-amber-50 text-amber-700"
                    : "border-red-200 bg-red-50 text-red-700";
                  return (
                    <span key={g.key} title={g.basis} className={cn("inline-flex items-center gap-1.5 rounded-[6px] border px-2 py-1", tone)}>
                      <span className="text-sm font-bold tabular-nums">{g.grade}</span>
                      <span className="text-[10px] font-medium uppercase tracking-wide">{g.label}</span>
                    </span>
                  );
                })}
              </div>
            )}
            {hasMaturity && (
              <span
                className={cn(
                  "inline-flex items-center rounded-[6px] px-2.5 py-1 text-xs font-semibold",
                  llm!.aiMaturityScore! >= 3
                    ? "bg-emerald-50 text-emerald-700"
                    : llm!.aiMaturityScore! >= 2
                      ? "bg-amber-50 text-amber-700"
                      : "bg-red-50 text-red-600",
                )}
                title="AI Maturity Score — how production-ready this AI-powered product is"
              >
                AI L{llm!.aiMaturityScore} — {AI_MATURITY_LABELS[llm!.aiMaturityScore!]}
              </span>
            )}
            {hasTrend && (() => {
              const vals = scoreHistory.map((h) => h.healthScore as number);
              const w = 96, h = 24, max = 100, min = Math.min(...vals, 0);
              const pts = vals.map((v, i) => {
                const x = (i / (vals.length - 1)) * w;
                const y = h - ((v - min) / (max - min || 1)) * h;
                return `${x.toFixed(1)},${y.toFixed(1)}`;
              }).join(" ");
              const last = vals[vals.length - 1], first = vals[0];
              const up = last >= first;
              return (
                <span className="inline-flex items-center gap-2" title={`Health score across ${vals.length} scans`}>
                  <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
                    <polyline points={pts} fill="none" stroke={up ? "#10b981" : "#ef4444"} strokeWidth="1.5" />
                  </svg>
                  <span className={cn("text-xs font-medium tabular-nums", up ? "text-emerald-600" : "text-red-600")}>
                    {up ? "▲" : "▼"} {Math.abs(last - first)} over {vals.length}
                  </span>
                </span>
              );
            })()}
            {scan.scoreBreakdown && scan.healthScore !== null && (
              <ScoreExplainer
                breakdown={scan.scoreBreakdown}
                score={scan.healthScore}
                previousScore={scan.previousHealthScore}
                diff={scanDiff}
              />
            )}
          </div>
        );
      })()}
    </>
  );
}

export function renderOverviewDashboard(v: ScanView) {
  const { activeTab, benchmark, benchmarking, codeDeployBoth, complianceMissing, discoveryExpanded, handleBenchmarkSuggestions, inSummary, inTechnical, llm, pricingTier, scan, scanDiff, scorecard, sectionNo, setActiveTab, setDiscoveryExpanded, setPricingTier, showCodeIntel, showDeployIntel, showTechStack, showWebVitals, techStackInfo, techVitalsBoth } = v;
  return (
    <>
      {/* ═══ OVERVIEW TAB — BENTO DASHBOARD ═══════════════════════════════ */}
      {(inSummary || inTechnical || activeTab === "readiness") && (
        <div className="space-y-4">

          {/* Directly under the headline score, because that is where the reader
              asks "which part of this is the problem?" — the question the whole
              rollup exists to answer. On the Checks tab it would sit above the
              wall it is meant to save you reading. */}
          {inSummary && <PillarStrip checks={scan.checks} num={sectionNo()} />}

          {/* Repo scans: the full-checkout measure and its tech-debt register. */}
          {inTechnical && scan.codeHealth && <CodeHealthPanel report={scan.codeHealth} num={sectionNo()} showMoney />}

          {/* COMPLIANCE BY MARKET — per-jurisdiction posture; deep-links to the Compliance tab */}
          {inSummary && scorecard.length > 0 && (
            <button
              type="button"
              onClick={() => setActiveTab("compliance")}
              className="widget-card w-full text-left transition hover:border-[var(--brand-400)]"
            >
              <div className="widget-header">
                <span className="widget-header-label">COMPLIANCE BY MARKET</span>
                <span className={cn("widget-header-right", complianceMissing > 0 ? "text-amber-600" : "text-emerald-600")}>
                  {complianceMissing > 0 ? `${complianceMissing} missing` : "all clear"} · details →
                </span>
              </div>
              <div className="widget-body">
                <div className="flex flex-wrap gap-2">
                  {scorecard.map((e) => {
                    const tone = e.compliancePct >= 80 ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : e.compliancePct >= 50 ? "border-amber-200 bg-amber-50 text-amber-700"
                      : "border-red-200 bg-red-50 text-red-700";
                    return (
                      <div key={e.jurisdiction} className={cn("flex items-center gap-2 rounded-[8px] border px-3 py-1.5", tone)}>
                        <span className="text-sm font-semibold">{e.label}</span>
                        <span className="text-xs tabular-nums opacity-80">{e.compliancePct}%</span>
                        {e.failing > 0 && <span className="text-[11px] font-medium">· {e.failing} missing</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            </button>
          )}

          {/* CHANGES SINCE LAST SCAN. Shown whenever there is an earlier scan, including when
              nothing changed: hiding it made "no changes" look the same as "no earlier scan". */}
          {inSummary && scanDiff && (
            <div className="widget-card">
              <div className="widget-header">
                <span className="widget-header-label">CHANGES SINCE LAST SCAN</span>
                <span className="widget-header-right"><ScoreChange diff={scanDiff} /></span>
              </div>
              <div className="widget-body space-y-3">
                <ScanDiffBody diff={scanDiff} previousHref={`/app/pulse/${scanDiff.previousScanId}`} />
                <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-[var(--border-2)] pt-2.5 text-xs">
                  <Link href={`/app/pulse/projects/${encodeTargetKey(targetKey(scan))}`} className="text-[var(--brand-600)] hover:underline">
                    Every scan of this project →
                  </Link>
                  <Link href={`/app/pulse/compare?from=${scanDiff.previousScanId}&to=${scan.id}`} className="text-[var(--brand-600)] hover:underline">
                    Full comparison →
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* Checks summary intentionally omitted here — Project Health (01) already
              shows pass/warn/fail counts + score, the readiness banner shows the
              failing-check gate, and the Checks tab holds the full per-category detail. */}

          {/* Row: Tech Stack · Web Vitals */}
          {inTechnical && (showTechStack || showWebVitals) && (
          <div className={cn("grid grid-cols-1 gap-3", techVitalsBoth && "sm:grid-cols-2")}>

            {/* 06 // TECH STACK */}
            {showTechStack && (
            <div className="widget-card">
              <div className="widget-header">
                <span className="widget-header-label">{`${sectionNo()} // TECH STACK`}</span>
                <span className="widget-header-right">{techStackInfo.inferred ? "inferred" : `${techStackInfo.stack.length} detected`}</span>
              </div>
              <div className="widget-body-compact">
                <div className="flex flex-wrap gap-1.5">
                  {techStackInfo.stack.map((t) => (
                    <span key={t} className="inline-flex items-center rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-1)] px-2 py-0.5 text-xs font-medium text-[var(--text-2)]">
                      {t}
                    </span>
                  ))}
                </div>
                {techStackInfo.inferred && (
                  <p className="mt-2 text-[11px] leading-4 text-[var(--text-4)]">Inferred from the builder/host and page signals — add a GitHub repo URL for exact detection.</p>
                )}
                {/* Recommended stack — the AI's top infrastructure recommendations */}
                {(llm?.techStackAnalysis?.recommendations?.length ?? 0) > 0 && (
                  <div className="mt-3 border-t border-[var(--border-2)] pt-3">
                    <p className="widget-data-label mb-1.5">Recommended</p>
                    <div className="flex flex-wrap gap-1.5">
                      {llm!.techStackAnalysis.recommendations.slice(0, 5).map((r, i) => (
                        <span key={i} className="inline-flex items-center rounded-[6px] border border-[var(--brand-300)] bg-[var(--surface-brand-soft)] px-2 py-0.5 text-xs font-medium text-[var(--brand-700)]" title={r.reason}>
                          {r.recommended}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {llm?.techStackAnalysis?.assessment && (
                  <p className="mt-3 border-t border-[var(--border-2)] pt-3 text-xs leading-5 text-[var(--text-3)]">{llm.techStackAnalysis.assessment}</p>
                )}
              </div>
            </div>
            )}

            {/* 07 // WEB VITALS */}
            {showWebVitals && (
            <div className="widget-card">
              <div className="widget-header">
                <span className="widget-header-label">{`${sectionNo()} // WEB VITALS`}</span>
                {scan.browserInsights && <span className="widget-header-right">Lighthouse · mobile</span>}
              </div>
              <div className="widget-body-compact">
                {scan.browserInsights ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-4 gap-2">
                      <VitalScore label="Perf"  score={scan.browserInsights.performanceScore} />
                      <VitalScore label="A11y"  score={scan.browserInsights.accessibilityScore} />
                      <VitalScore label="SEO"   score={scan.browserInsights.seoScore} />
                      <VitalScore label="BP"    score={scan.browserInsights.bestPracticesScore} />
                    </div>
                    {(scan.browserInsights.lcp !== null || scan.browserInsights.fcp !== null) && (
                      <div className="grid gap-1.5 sm:grid-cols-2">
                        {scan.browserInsights.lcp !== null && <VitalMetric label="LCP" value={scan.browserInsights.lcp >= 1000 ? `${(scan.browserInsights.lcp / 1000).toFixed(1)} s` : `${scan.browserInsights.lcp} ms`} status={scan.browserInsights.lcp <= 2500 ? "PASS" : scan.browserInsights.lcp <= 4000 ? "WARN" : "FAIL"} />}
                        {scan.browserInsights.fcp !== null && <VitalMetric label="FCP" value={scan.browserInsights.fcp >= 1000 ? `${(scan.browserInsights.fcp / 1000).toFixed(1)} s` : `${scan.browserInsights.fcp} ms`} status={scan.browserInsights.fcp <= 1800 ? "PASS" : scan.browserInsights.fcp <= 3000 ? "WARN" : "FAIL"} />}
                        {scan.browserInsights.tbt !== null && <VitalMetric label="TBT" value={scan.browserInsights.tbt >= 1000 ? `${(scan.browserInsights.tbt / 1000).toFixed(1)} s` : `${scan.browserInsights.tbt} ms`} status={scan.browserInsights.tbt <= 200 ? "PASS" : scan.browserInsights.tbt <= 600 ? "WARN" : "FAIL"} />}
                        {scan.browserInsights.cls !== null && <VitalMetric label="CLS" value={scan.browserInsights.cls.toFixed(3)} status={scan.browserInsights.cls <= 0.1 ? "PASS" : scan.browserInsights.cls <= 0.25 ? "WARN" : "FAIL"} />}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="py-1 text-sm text-[var(--text-3)]">
                    {scan.inputType === "URL"
                      ? "Run the Browser & Performance agent (above) to capture Lighthouse scores + Core Web Vitals."
                      : "Web vitals need a live URL — they're not available for this scan type."}
                  </p>
                )}
              </div>
            </div>
            )}
          </div>
          )}

          {/* Row: Code Intelligence · Deploy Intelligence */}
          {inTechnical && (showCodeIntel || showDeployIntel) && (
            <div className={cn("grid grid-cols-1 gap-3", codeDeployBoth && "sm:grid-cols-2")}>

              {/* 09 // CODE INTELLIGENCE */}
              {showCodeIntel && (
              <div className="widget-card">
                <div className="widget-header">
                  <span className="widget-header-label">{`${sectionNo()} // CODE INTELLIGENCE`}</span>
                  {scan.codeInsights && <span className="widget-header-right">GitHub GraphQL</span>}
                </div>
                <div className="widget-body-compact">
                  {scan.codeInsights ? (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-[6px] bg-[var(--surface-1)] p-2.5">
                        <p className="widget-data-label mb-1">Vulnerabilities</p>
                        {scan.codeInsights.vulnerabilities.length === 0 ? (
                          <p className="text-sm font-semibold text-emerald-600">None</p>
                        ) : (
                          <p className="text-sm font-semibold text-red-600">
                            {scan.codeInsights.vulnerabilities.filter((v) => v.severity === "CRITICAL").length}C · {scan.codeInsights.vulnerabilities.filter((v) => v.severity === "HIGH").length}H
                          </p>
                        )}
                      </div>
                      <div className="rounded-[6px] bg-[var(--surface-1)] p-2.5">
                        <p className="widget-data-label mb-1">Branch protection</p>
                        <p className={cn("text-sm font-semibold", scan.codeInsights.branchProtected ? "text-emerald-600" : "text-red-600")}>
                          {scan.codeInsights.branchProtected ? (scan.codeInsights.requiresReviews ? "Protected + reviews" : "Protected") : "None"}
                        </p>
                      </div>
                      {scan.codeInsights.commitVelocity !== null && (
                        <div className="rounded-[6px] bg-[var(--surface-1)] p-2.5">
                          <p className="widget-data-label mb-1">Velocity</p>
                          <p className="text-sm font-semibold text-[var(--text-1)]">
                            {scan.codeInsights.commitVelocity} <span className="text-xs font-normal text-[var(--text-3)]">commits/wk</span>
                          </p>
                        </div>
                      )}
                      {scan.codeInsights.prReviewRate !== null && (
                        <div className="rounded-[6px] bg-[var(--surface-1)] p-2.5">
                          <p className="widget-data-label mb-1">PR reviews</p>
                          <p className={cn("text-sm font-semibold", scan.codeInsights.prReviewRate >= 0.7 ? "text-emerald-600" : scan.codeInsights.prReviewRate >= 0.3 ? "text-amber-600" : "text-red-600")}>
                            {Math.round(scan.codeInsights.prReviewRate * 100)}%
                          </p>
                        </div>
                      )}
                      {(() => {
                        const secrets = scan.codeInsights.exposedSecrets ?? [];
                        return (
                          <div className="rounded-[6px] bg-[var(--surface-1)] p-2.5">
                            <p className="widget-data-label mb-1">Exposed secrets</p>
                            {secrets.length === 0 ? (
                              <p className="text-sm font-semibold text-emerald-600">None</p>
                            ) : (
                              <p className="text-sm font-semibold text-red-600" title={secrets.map((s) => `${s.type} in ${s.file}`).join("\n")}>
                                {secrets.length} found
                              </p>
                            )}
                          </div>
                        );
                      })()}
                      {scan.codeInsights.uniqueContributors !== null && (
                        <div className="rounded-[6px] bg-[var(--surface-1)] p-2.5">
                          <p className="widget-data-label mb-1">Contributors</p>
                          <p className="text-sm font-semibold text-[var(--text-1)]">
                            {scan.codeInsights.uniqueContributors}
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="rounded-[6px] border border-dashed border-[var(--border-2)] p-4 text-center">
                      <p className="text-xs font-medium text-[var(--text-3)]">No GitHub repo provided</p>
                      <p className="mt-0.5 text-xs text-[var(--text-4)]">Add a repo URL for code-level insights</p>
                    </div>
                  )}
                </div>
              </div>
              )}

              {/* 10 // DEPLOY INTELLIGENCE */}
              {showDeployIntel && (
              <div className="widget-card">
                <div className="widget-header">
                  <span className="widget-header-label">{`${sectionNo()} // DEPLOY INTELLIGENCE`}</span>
                  {scan.deployInsights?.platform && (
                    <span className="widget-header-right capitalize">{scan.deployInsights.platform}</span>
                  )}
                </div>
                <div className="widget-body-compact">
                  {scan.deployInsights && (scan.deployInsights.platform || scan.deployInsights.recentDeployments !== null) ? (
                    <div className="grid grid-cols-2 gap-2">
                      {scan.deployInsights.recentDeployments !== null && scan.deployInsights.failedDeployments !== null && (() => {
                        const rate = (scan.deployInsights.recentDeployments! - scan.deployInsights.failedDeployments!) / scan.deployInsights.recentDeployments!;
                        return (
                          <div className="rounded-[6px] bg-[var(--surface-1)] p-2.5">
                            <p className="widget-data-label mb-1">Success rate</p>
                            <p className={cn("text-sm font-semibold", rate >= 0.9 ? "text-emerald-600" : rate >= 0.7 ? "text-amber-600" : "text-red-600")}>
                              {scan.deployInsights.recentDeployments! - scan.deployInsights.failedDeployments!}/{scan.deployInsights.recentDeployments}
                            </p>
                          </div>
                        );
                      })()}
                      {scan.deployInsights.avgBuildMs !== null && (
                        <div className="rounded-[6px] bg-[var(--surface-1)] p-2.5">
                          <p className="widget-data-label mb-1">Avg build</p>
                          <p className={cn("text-sm font-semibold",
                            scan.deployInsights.avgBuildMs < 60_000 ? "text-emerald-600"
                            : scan.deployInsights.avgBuildMs < 180_000 ? "text-amber-600"
                            : "text-red-600",
                          )}>
                            {Math.round(scan.deployInsights.avgBuildMs / 1000)}s
                          </p>
                        </div>
                      )}
                      {scan.deployInsights.buildWarnings.length > 0 && (
                        <div className="col-span-2 rounded-[6px] bg-amber-50 p-2.5">
                          <p className="widget-data-label mb-1" style={{ color: "#92400e" }}>Build warnings</p>
                          <p className="text-sm font-semibold text-amber-700">{scan.deployInsights.buildWarnings.length}</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="rounded-[6px] border border-dashed border-[var(--border-2)] p-4 text-center">
                      <p className="text-xs font-medium text-[var(--text-3)]">No deploy data available</p>
                    </div>
                  )}
                </div>
              </div>
              )}
            </div>
          )}

          {/* 11 // DISCOVERY KIT */}
          {inTechnical && scan.discoveryKit && (
            <div className="widget-card">
              <button
                type="button"
                className="widget-header w-full text-left"
                onClick={() => setDiscoveryExpanded((v) => !v)}
              >
                <span className="widget-header-label">{`${sectionNo()} // DISCOVERY KIT`}</span>
                <span className="widget-header-right flex items-center gap-1.5">
                  {scan.discoveryKit.questions.length} questions · £{scan.discoveryKit.pricingAnchor.low.toLocaleString()}–£{scan.discoveryKit.pricingAnchor.high.toLocaleString()}
                  <ChevronDownIcon className={cn("h-3 w-3 transition-transform", discoveryExpanded && "rotate-180")} />
                </span>
              </button>
              {discoveryExpanded || activeTab === "discovery" ? (
                <div className="widget-body">
                  <DiscoveryTab kit={scan.discoveryKit} />
                </div>
              ) : (
                <div className="widget-body-compact">
                  <p className="text-sm italic leading-6 text-[var(--text-1)]">&ldquo;{scan.discoveryKit.openingStatement}&rdquo;</p>
                  <p className="mt-2 text-xs text-[var(--text-4)]">Expand to see questions, objections, and pricing anchor</p>
                </div>
              )}
            </div>
          )}

          {/* 13 // SUGGESTED BENCHMARKS — AI-discovered competitors to scan against */}
          {inTechnical && !scan.competitorData && (llm?.competitorSuggestions?.length ?? 0) > 0 && (
            <div className="widget-card">
              <div className="widget-header">
                <span className="widget-header-label">{`${sectionNo()} // SUGGESTED BENCHMARKS`}</span>
                <span className="widget-header-right">AI-discovered</span>
              </div>
              <div className="widget-body space-y-3">
                <p className="text-xs text-[var(--text-3)]">
                  Likely competitors in this vertical. Re-scan to benchmark this project&apos;s health score against them.
                </p>
                <div className="space-y-1.5">
                  {llm!.competitorSuggestions!.slice(0, 3).map((c, i) => (
                    <div key={i} className="flex items-start gap-2.5 rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-1)] px-3 py-2">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--brand-500)]" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-[var(--text-1)]">
                          {c.name || c.url.replace(/^https?:\/\//, "")}
                        </p>
                        <p className="mt-0.5 text-[11px] leading-4 text-[var(--text-3)]">{c.reason}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <Button onClick={handleBenchmarkSuggestions} loading={benchmarking} className="w-full">
                  Benchmark against these →
                </Button>
              </div>
            </div>
          )}

          {/* 14 // INDUSTRY BENCHMARKS — Wave E3: rank vs same-type scans in this workspace */}
          {inTechnical && benchmark && (
            <div className="widget-card">
              <div className="widget-header">
                <span className="widget-header-label">{`${sectionNo()} // INDUSTRY BENCHMARKS`}</span>
                <span className="widget-header-right">vs {benchmark.peerCount} {benchmark.projectType} scan{benchmark.peerCount !== 1 ? "s" : ""}</span>
              </div>
              <div className="widget-body">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="widget-data-label mb-1">Your percentile</p>
                    <p className={cn(
                      "font-serif text-4xl font-bold leading-none tabular-nums",
                      benchmark.percentile >= 75 ? "text-emerald-600" : benchmark.percentile >= 40 ? "text-amber-600" : "text-red-600",
                    )}>
                      {benchmark.percentile}<span className="text-lg">th</span>
                    </p>
                    <p className="mt-1.5 text-xs text-[var(--text-3)]">
                      {benchmark.percentile >= 50
                        ? `Ahead of ${benchmark.percentile}% of ${benchmark.projectType} projects you've scanned`
                        : `Behind the typical ${benchmark.projectType} project — room to climb`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="widget-data-label mb-1">Score</p>
                    <p className="text-sm text-[var(--text-2)] tabular-nums">
                      you <span className="font-semibold text-[var(--text-1)]">{benchmark.yourScore}</span> · median {benchmark.median} · best {benchmark.best}
                    </p>
                  </div>
                </div>
                {/* Position bar: median marker + your marker on a 0–100 scale */}
                <div className="relative mt-4 h-2 w-full rounded-full bg-[var(--border-2)]">
                  <div className="absolute top-1/2 h-3 w-0.5 -translate-y-1/2 bg-[var(--text-4)]" style={{ left: `${benchmark.median}%` }} title={`Median ${benchmark.median}`} />
                  <div
                    className="absolute top-1/2 h-3.5 w-1 -translate-y-1/2 rounded-full"
                    style={{ left: `${benchmark.yourScore}%`, backgroundColor: benchmark.percentile >= 75 ? "#10b981" : benchmark.percentile >= 40 ? "#f59e0b" : "#ef4444" }}
                    title={`You ${benchmark.yourScore}`}
                  />
                </div>
                <div className="mt-1 flex justify-between text-[10px] text-[var(--text-4)]"><span>0</span><span>median</span><span>100</span></div>
              </div>
            </div>
          )}

          {/* 15 // VISUAL QUALITY — Wave D1 vision-AI score + F4 axe-core accessibility */}
          {inTechnical && scan.visualInsights && (scan.visualInsights.visualQualityScore !== null || (scan.visualInsights.a11yViolations ?? null) !== null) && (() => {
            const v = scan.visualInsights!;
            const tone = (n: number | null) => n === null ? "text-[var(--text-3)]" : n >= 75 ? "text-emerald-600" : n >= 50 ? "text-amber-600" : "text-red-600";
            const sub: Array<[string, number | null]> = [
              ["Value prop", v.valuePropClarity],
              ["CTA", v.ctaProminence],
              ["Trust", v.trustSignals],
            ];
            const hasVision = v.visualQualityScore !== null;
            const a11y = v.a11yViolations ?? null;
            return (
              <div className="widget-card">
                <div className="widget-header">
                  <span className="widget-header-label">{`${sectionNo()} // VISUAL QUALITY`}</span>
                  <span className="widget-header-right">AI vision · above the fold</span>
                </div>
                <div className="widget-body">
                  {hasVision && (
                    <>
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="widget-data-label mb-1">Visual polish</p>
                          <p className={cn("font-serif text-4xl font-bold leading-none tabular-nums", tone(v.visualQualityScore))}>
                            {v.visualQualityScore}<span className="text-lg text-[var(--text-4)]">/100</span>
                          </p>
                        </div>
                        {v.mobileFriendly !== null && (
                          <span className={cn(
                            "inline-flex items-center rounded-[6px] px-2.5 py-1 text-xs font-semibold",
                            v.mobileFriendly ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600",
                          )}>
                            {v.mobileFriendly ? "Mobile-ready" : "Mobile issues"}
                          </span>
                        )}
                      </div>
                      <div className="mt-4 grid grid-cols-3 gap-2">
                        {sub.map(([label, n]) => (
                          <div key={label} className="rounded-[6px] bg-[var(--surface-1)] p-2.5">
                            <p className="widget-data-label mb-1">{label}</p>
                            <p className={cn("text-sm font-semibold tabular-nums", tone(n))}>{n ?? "—"}</p>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                  {a11y !== null && (
                    <div className={cn("rounded-[6px] bg-[var(--surface-1)] p-2.5", hasVision && "mt-2")}>
                      <p className="widget-data-label mb-1">Accessibility (axe-core)</p>
                      <p className={cn("text-sm font-semibold tabular-nums", a11y === 0 ? "text-emerald-600" : (v.a11ySerious ?? 0) > 0 ? "text-red-600" : "text-amber-600")}>
                        {a11y === 0 ? "No violations" : `${a11y} violation${a11y !== 1 ? "s" : ""}${(v.a11ySerious ?? 0) > 0 ? ` · ${v.a11ySerious} serious` : ""}`}
                      </p>
                    </div>
                  )}
                  {v.visualNarrative && (
                    <p className="mt-3 text-sm leading-6 text-[var(--text-2)]">{v.visualNarrative}</p>
                  )}
                </div>
              </div>
            );
          })()}

          {/* 16 // ENGAGEMENT ESTIMATE — F3: indicative effort/cost/timeline to production */}
          {activeTab === "readiness" && llm?.engagementEstimate && (llm.engagementEstimate.weeksHigh > 0 || llm.engagementEstimate.priceHigh > 0) && (() => {
            const e = llm.engagementEstimate!;
            const gbp = (n: number) => `£${Math.round(n).toLocaleString("en-GB")}`;
            const bands = scan.pricingBands ?? [];
            const band = bands.find((b) => b.devs === pricingTier) ?? bands[0] ?? null;
            // Prefer the deterministic, rate-card-grounded band; fall back to the AI estimate.
            const weeksLow = band ? band.weeksLow : e.weeksLow;
            const weeksHigh = band ? band.weeksHigh : e.weeksHigh;
            const priceLow = band ? band.priceLowGbp : e.priceLow;
            const priceHigh = band ? band.priceHighGbp : e.priceHigh;
            const weeks = weeksLow && weeksHigh && weeksLow !== weeksHigh ? `${weeksLow}–${weeksHigh}` : `${weeksHigh || weeksLow}`;
            return (
              <div className="widget-card">
                <div className="widget-header">
                  <span className="widget-header-label">{`${sectionNo()} // ENGAGEMENT ESTIMATE`}</span>
                  <span className="widget-header-right">{e.confidence} confidence · indicative</span>
                </div>
                <div className="widget-body">
                  {e.summary && <p className="mb-4 text-sm leading-6 text-[var(--text-2)]">{e.summary}</p>}
                  {bands.length > 0 && (
                    <div className="mb-3 flex items-center gap-2">
                      <span className="widget-data-label">Team size</span>
                      <div className="flex gap-1">
                        {bands.map((b) => (
                          <button
                            key={b.devs}
                            type="button"
                            onClick={() => setPricingTier(b.devs)}
                            className={cn(
                              "rounded-[6px] border px-2.5 py-1 text-xs font-medium transition",
                              b.devs === pricingTier
                                ? "border-[var(--brand-400)] bg-[var(--surface-brand-soft)] text-[var(--brand-700)]"
                                : "border-[var(--border-2)] text-[var(--text-3)] hover:border-[var(--brand-300)]",
                            )}
                          >
                            {b.devs} dev{b.devs > 1 ? "s" : ""}
                          </button>
                        ))}
                      </div>
                      {band && <span className="text-xs text-[var(--text-4)]">~{gbp(band.blendedDayRateGbp)}/day blended</span>}
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-[8px] bg-[var(--surface-1)] p-3">
                      <p className="widget-data-label mb-1">Timeline</p>
                      <p className="font-serif text-3xl font-bold leading-none tabular-nums text-[var(--text-1)]">
                        {weeks}<span className="text-base font-normal text-[var(--text-3)]"> wks</span>
                      </p>
                    </div>
                    <div className="rounded-[8px] bg-[var(--surface-1)] p-3">
                      <p className="widget-data-label mb-1">Indicative cost</p>
                      <p className="font-serif text-3xl font-bold leading-none tabular-nums text-[var(--text-1)]">
                        {priceHigh > 0 ? `${gbp(priceLow)}–${gbp(priceHigh)}` : "—"}
                      </p>
                    </div>
                  </div>
                  {e.phases.length > 0 && (
                    <div className="mt-4 space-y-1.5">
                      {e.phases.map((p, i) => (
                        <div key={i} className="flex items-start gap-2.5 rounded-[8px] border border-[var(--border-2)] px-3 py-2">
                          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--surface-brand-soft)] text-[10px] font-bold text-[var(--brand-600)]">{i + 1}</span>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-[var(--text-1)]">{p.name}{p.weeks > 0 ? ` · ${p.weeks} wk${p.weeks !== 1 ? "s" : ""}` : ""}</p>
                            {p.outcome && <p className="mt-0.5 text-[11px] leading-4 text-[var(--text-3)]">{p.outcome}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="mt-3 text-[11px] leading-4 text-[var(--text-4)]">
                    Indicative only — generate a proposal to refine scope, rates and a fixed quote.
                  </p>
                </div>
              </div>
            );
          })()}

          {/* 17 // INTAKE & RISK — F2: stage, market, feasibility, regulatory landmines */}
          {activeTab === "readiness" && llm?.intakeAssessment && (() => {
            const a = llm.intakeAssessment!;
            const stageTone: Record<string, string> = {
              IDEA: "bg-purple-50 text-purple-700",
              PROTOTYPE: "bg-amber-50 text-amber-700",
              MVP: "bg-blue-50 text-blue-700",
              PRODUCTION: "bg-emerald-50 text-emerald-700",
            };
            const sevTone: Record<string, string> = {
              HIGH: "border-red-200 bg-red-50 text-red-700",
              MEDIUM: "border-amber-200 bg-amber-50 text-amber-700",
              LOW: "border-[var(--border-2)] bg-[var(--surface-1)] text-[var(--text-2)]",
            };
            const rows: Array<[string, string]> = [
              ["Market signal", a.marketSignal],
              ["Feasibility", a.feasibility],
              ["Riskiest assumption", a.riskiestAssumption],
            ];
            return (
              <div className="widget-card">
                <div className="widget-header">
                  <span className="widget-header-label">{`${sectionNo()} // INTAKE & RISK`}</span>
                  {a.stage && (
                    <span className={cn("inline-flex items-center rounded-[6px] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide", stageTone[a.stage] ?? "bg-[var(--surface-1)] text-[var(--text-2)]")}>
                      {a.stage}
                    </span>
                  )}
                </div>
                <div className="widget-body space-y-3">
                  {a.regulatoryFlags.length > 0 && (
                    <div>
                      <p className="widget-data-label mb-1.5">Regulatory landmines</p>
                      <div className="space-y-1.5">
                        {a.regulatoryFlags.map((f, i) => (
                          <div key={i} className={cn("rounded-[8px] border px-3 py-2", sevTone[f.severity] ?? sevTone.LOW)}>
                            <p className="text-xs font-semibold">{f.area}</p>
                            <p className="mt-0.5 text-[11px] leading-4 opacity-90">{f.note}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {rows.filter(([, v]) => v).map(([label, v]) => (
                    <div key={label}>
                      <p className="widget-data-label mb-0.5">{label}</p>
                      <p className="text-sm leading-6 text-[var(--text-2)]">{v}</p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

        </div>
      )}
    </>
  );
}
