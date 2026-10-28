"use client";

import { DocumentCover, HealthScoreRing } from "@/components/document-cover";
import { githubRepoLabel } from "@/lib/github";
import { ReleaseGateBanner } from "@/components/pulse/release-gate-banner";
import { PlainScanBox } from "@/components/pulse/code-health-sections";
import { cn } from "@/lib/format";
import type { PulseScanRecord } from "@/types/pulse";
import { AiUnavailable } from "./scan/score-explainer";
import { CompetitorsTab } from "./scan/competitors-tab";
import { useScanView } from "./scan/use-scan-view";
import { renderScanToolbar } from "./scan/scan-toolbar";
import { renderOverviewDashboard, renderSummaryAnnotations } from "./scan/summary-tab";
import { renderTechnicalPanels } from "./scan/technical-tab";
import { renderChecksTab, renderComplianceScorecard } from "./scan/all-checks-view";
import { renderPlanOpportunitiesAndStack, renderRoadmap } from "./scan/plan-tab";

/**
 * The scan page. The pieces live in ./scan/: `useScanView` (state and derived values), the
 * toolbar, and one renderer per tab. Renderers are plain functions called in place, not
 * components, so the running section numbers (`sectionNo`) count in the same order as before.
 */
export function PulseScanResults({ scan }: { scan: PulseScanRecord }) {
  const v = useScanView(scan);
  const { activeTab, gate, handleTitleChange, heroDated, heroMeta, heroStats, inSummary, inTechnical, llm, planParts, primary, scanTitle, setActiveTab, tabs } = v;

  return (
    <div className="space-y-6">
      {renderScanToolbar(v)}

      {/* Hero — Gitwork navy cover (see computed heroMeta/heroStats/heroDated above) */}
      <div className="overflow-hidden rounded-[10px]">
        <DocumentCover
          variant="screen"
          boldPalette="navy"
          eyebrow="PULSE // PROJECT HEALTH"
          title={scanTitle}
          onTitleChange={handleTitleChange}
          subtitle={scan.inputUrl ?? githubRepoLabel(scan.inputGithubRepo) ?? undefined}
          rightSlot={scan.healthScore !== null ? <HealthScoreRing score={scan.healthScore} /> : undefined}
          meta={heroMeta}
          stats={scan.healthScore !== null ? heroStats : undefined}
          executiveSummary={llm?.executiveSummary || undefined}
          callout={llm?.proposalHook ? { text: llm.proposalHook, tone: "blue" } : undefined}
          dated={heroDated}
        />
      </div>
      {!llm && (
        <AiUnavailable aiError={scan.aiError} />
      )}

      {/* The decision, above the tabs, so it is read before any of the detail
          that supports it — and on every tab, not just the one it happens to
          live on. */}
      {gate && <ReleaseGateBanner gate={gate} />}

      {/* The plain-English verdict and what to fix first, before any tab: the first thing a
          non-developer needs, and its headline follows the banner above it. */}
      {/* On the Summary only: its "fix first" list is the top of the Findings tab, and
          repeating it above every tab was one of the six copies this page used to show. */}
      {scan.status === "COMPLETED" && inSummary && <PlainScanBox checks={scan.checks} gate={gate ?? null} />}

      {/* Tabs — four. The plan's five parts are a row of choices inside Plan. */}
      <div className="border-b border-[var(--border-2)]">
        <div className="flex gap-0 overflow-x-auto" role="tablist">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={primary === tab.id}
              onClick={() => setActiveTab(tab.to)}
              className={cn(
                "flex items-center gap-1.5 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition",
                primary === tab.id
                  ? "border-[var(--brand-600)] text-[var(--brand-700)]"
                  : "border-transparent text-[var(--text-3)] hover:text-[var(--text-1)]",
              )}
            >
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span className={cn(
                  "rounded-[4px] px-1.5 py-0.5 text-xs tabular-nums",
                  tab.badgeColor === "red" ? "bg-red-100 text-red-700"
                  : tab.badgeColor === "amber" ? "bg-amber-100 text-amber-700"
                  : "bg-[var(--surface-2)] text-[var(--text-3)]",
                )}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {primary === "plan" && (
        <div className="flex flex-wrap gap-1 rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-1)] p-1" role="tablist" aria-label="Plan">
          {planParts.map((part) => (
            <button
              key={part.id}
              type="button"
              role="tab"
              aria-selected={activeTab === part.id}
              onClick={() => setActiveTab(part.id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-[6px] px-3 py-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.08em] transition",
                activeTab === part.id
                  ? "bg-[var(--surface-0)] text-[var(--brand-700)] shadow-sm"
                  : "text-[var(--text-3)] hover:text-[var(--text-1)]",
              )}
            >
              {part.label}
              {part.count !== undefined && part.count > 0 && <span className="tabular-nums text-[var(--text-4)]">{part.count}</span>}
            </button>
          ))}
        </div>
      )}

      {renderSummaryAnnotations(v)}

      {renderTechnicalPanels(v)}

      {renderOverviewDashboard(v)}

      {renderChecksTab(v)}

      {renderPlanOpportunitiesAndStack(v)}

      {inTechnical && scan.competitorData && scan.healthScore !== null && (
        <CompetitorsTab data={scan.competitorData} mainScore={scan.healthScore} />
      )}

      {renderComplianceScorecard(v)}

      {renderRoadmap(v)}
    </div>
  );
}
