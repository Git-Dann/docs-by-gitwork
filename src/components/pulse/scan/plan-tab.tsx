"use client";

import { PulseEffortBadge, PulseValueBadge } from "@/components/pulse/pulse-shared";
import { ArrowRightIcon } from "@heroicons/react/24/outline";
import { AiUnavailable } from "./score-explainer";
import { StackTab } from "./stack-tab";
import type { ScanView } from "./use-scan-view";

export function renderPlanOpportunitiesAndStack(v: ScanView) {
  const { activeTab, llm, scan, sectionNo, techStackInfo } = v;
  return (
    <>
      {activeTab === "opportunities" && !llm && <AiUnavailable aiError={scan.aiError} />}

      {activeTab === "opportunities" && llm && (
        <div className="widget-card">
          <div className="widget-header">
            <span className="widget-header-label">{`${sectionNo()} // BUILD OPPORTUNITIES`}</span>
            <span className="widget-header-right">{llm.buildOpportunities.length}</span>
          </div>
          <div className="widget-body space-y-3">
            {llm.buildOpportunities.length === 0 && (
              <p className="text-sm text-[var(--text-3)]">No build opportunities identified.</p>
            )}
            {llm.buildOpportunities.map((opp, i) => (
              <div key={i} className="rounded-[10px] border border-[var(--border-2)] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[var(--text-1)]">{opp.title}</p>
                    <p className="mt-1 text-sm text-[var(--text-3)]">{opp.description}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <span className="rounded-full border border-[var(--border-2)] bg-[var(--surface-1)] px-2 py-0.5 text-xs text-[var(--text-4)]">
                        {opp.category}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <PulseEffortBadge effort={opp.estimatedEffort} />
                    <PulseValueBadge value={opp.businessValue} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === "stack" && !llm && <AiUnavailable aiError={scan.aiError} />}

      {activeTab === "stack" && llm?.techStackAnalysis && (
        <div className="widget-card">
          <div className="widget-header">
            <span className="widget-header-label">{`${sectionNo()} // TECH STACK`}</span>
            <span className="widget-header-right">{llm.techStackAnalysis.recommendations.length} recommendations</span>
          </div>
          <div className="widget-body">
            <StackTab analysis={llm.techStackAnalysis} detectedStack={techStackInfo.stack} />
          </div>
        </div>
      )}
    </>
  );
}

export function renderRoadmap(v: ScanView) {
  const { activeTab, llm, scan, sectionNo } = v;
  return (
    <>
      {activeTab === "roadmap" && !llm && <AiUnavailable aiError={scan.aiError} />}

      {activeTab === "roadmap" && llm && (
        <div className="widget-card">
          <div className="widget-header">
            <span className="widget-header-label">{`${sectionNo()} // SCALING ROADMAP`}</span>
            <span className="widget-header-right">{llm.scalingRoadmap.length} phases</span>
          </div>
          <div className="widget-body space-y-4">
            {llm.scalingRoadmap.length === 0 && (
              <p className="text-sm text-[var(--text-3)]">No roadmap generated.</p>
            )}
            {llm.scalingRoadmap.map((phase) => (
              <div key={phase.phase} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-[var(--brand-500)] bg-[var(--brand-50)] text-sm font-bold text-[var(--brand-700)]">
                    {phase.phase}
                  </div>
                  <div className="mt-2 w-px flex-1 bg-[var(--border-2)]" />
                </div>
                <div className="pb-6">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-[var(--text-1)]">{phase.title}</p>
                    <span className="text-xs text-[var(--text-4)]">· {phase.duration}</span>
                  </div>
                  <ul className="mt-2 space-y-1">
                    {phase.goals.map((goal, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-[var(--text-3)]">
                        <ArrowRightIcon className="mt-0.5 h-3 w-3 shrink-0 text-[var(--text-4)]" />
                        {goal}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
