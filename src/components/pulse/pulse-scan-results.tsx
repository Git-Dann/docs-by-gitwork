"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowRightIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  MinusCircleIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { useGeneratePulseProposal, useCreatePulseScan } from "@/hooks/use-pulse";
import { cn } from "@/lib/format";
import type { PulseScanRecord, PulseScanCheckRecord, ProductionReadinessItem, TechStackRecommendation } from "@/types/pulse";
import {
  ScoreRing,
  PulseCheckStatusIcon,
  PulseUrgencyBadge,
  PulseEffortBadge,
  PulseValueBadge,
} from "@/components/pulse/pulse-shared";

function groupChecksByCategory(checks: PulseScanCheckRecord[]) {
  const map = new Map<string, PulseScanCheckRecord[]>();
  for (const check of checks) {
    const list = map.get(check.category) ?? [];
    list.push(check);
    map.set(check.category, list);
  }
  return map;
}

function categoryScore(checks: PulseScanCheckRecord[]): number {
  const applicable = checks.filter((c) => c.status !== "SKIPPED");
  if (!applicable.length) return 0;
  const passing = applicable.filter((c) => c.status === "PASS").length;
  return Math.round((passing / applicable.length) * 100);
}

type Tab = "overview" | "checks" | "gaps" | "opportunities" | "roadmap" | "readiness" | "stack";

function ReadinessStatusIcon({ status }: { status: ProductionReadinessItem["status"] }) {
  if (status === "DONE") return <CheckCircleIcon className="h-4 w-4 text-emerald-500" />;
  if (status === "PARTIAL") return <MinusCircleIcon className="h-4 w-4 text-amber-500" />;
  return <XCircleIcon className="h-4 w-4 text-red-500" />;
}

function groupReadinessByCategory(items: ProductionReadinessItem[]) {
  const map = new Map<string, ProductionReadinessItem[]>();
  for (const item of items) {
    const list = map.get(item.category) ?? [];
    list.push(item);
    map.set(item.category, list);
  }
  return map;
}

function StackPriorityBadge({ priority }: { priority: TechStackRecommendation["priority"] }) {
  const styles =
    priority === "HIGH"
      ? "bg-red-50 text-red-700"
      : priority === "MEDIUM"
        ? "bg-amber-50 text-amber-700"
        : "bg-slate-50 text-slate-600";
  return (
    <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-medium", styles)}>
      {priority}
    </span>
  );
}

function StackTab({
  analysis,
  detectedStack,
}: {
  analysis: NonNullable<import("@/types/pulse").PulseAnalysisOutput["techStackAnalysis"]>;
  detectedStack: string[];
}) {
  return (
    <div className="space-y-6">
      {/* Detected stack */}
      {detectedStack.length > 0 && (
        <div className="rounded-[12px] border border-[var(--border-2)] p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--text-4)]">Detected stack</p>
          <div className="flex flex-wrap gap-2">
            {detectedStack.map((tech) => (
              <span
                key={tech}
                className="inline-flex items-center rounded-full border border-[var(--border-2)] bg-[var(--surface-1)] px-2.5 py-1 text-xs font-medium text-[var(--text-2)]"
              >
                {tech}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Assessment */}
      <div className="rounded-[12px] border border-[var(--border-2)] bg-[var(--surface-1)] p-4">
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--text-4)]">Stack assessment</p>
        <p className="text-sm leading-relaxed text-[var(--text-2)]">{analysis.assessment}</p>
      </div>

      {/* Missing for production */}
      {analysis.missingForProduction.length > 0 && (
        <div>
          <p className="mb-3 text-sm font-semibold text-[var(--text-1)]">Missing for production</p>
          <div className="flex flex-wrap gap-2">
            {analysis.missingForProduction.map((item, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700"
              >
                <XCircleIcon className="h-3 w-3" />
                {item}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Recommendations */}
      {analysis.recommendations.length > 0 && (
        <div>
          <p className="mb-3 text-sm font-semibold text-[var(--text-1)]">Stack recommendations</p>
          <div className="space-y-3">
            {analysis.recommendations.map((rec, i) => (
              <div key={i} className="rounded-[12px] border border-[var(--border-2)] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-[var(--text-1)]">{rec.area}</p>
                      {rec.current && (
                        <span className="rounded border border-[var(--border-2)] px-1.5 py-0.5 text-xs text-[var(--text-4)]">
                          current: {rec.current}
                        </span>
                      )}
                      <span className="text-xs text-[var(--brand-600)]">→ {rec.recommended}</span>
                    </div>
                    <p className="mt-1 text-sm text-[var(--text-3)]">{rec.reason}</p>
                  </div>
                  <StackPriorityBadge priority={rec.priority} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function PulseScanResults({ scan }: { scan: PulseScanRecord }) {
  const router = useRouter();
  const { mutateAsync: generateProposal, isPending: generatingProposal } = useGeneratePulseProposal();
  const { mutateAsync: createScan, isPending: rescanning } = useCreatePulseScan();
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  function toggleCategory(category: string) {
    setExpandedCategories((prev: Set<string>) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  const llm = scan.llmAnalysis;
  const checksByCategory = groupChecksByCategory(scan.checks);

  async function handleRescan() {
    const result = await createScan({
      projectName: scan.projectName,
      inputType: scan.inputType,
      inputUrl: scan.inputUrl ?? undefined,
      inputGithubRepo: scan.inputGithubRepo ?? undefined,
      inputDescription: scan.inputDescription ?? undefined,
      clientId: scan.clientId ?? undefined,
    });
    router.push(`/app/pulse/${result.scan.id}`);
  }

  async function handleGenerateProposal() {
    setGenerateError(null);
    try {
      const result = await generateProposal(scan.id);
      router.push(`/app/proposals/${result.proposalId}`);
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : "Failed to generate proposal.");
    }
  }

  const readinessByCategory = llm ? groupReadinessByCategory(llm.productionReadinessChecklist ?? []) : new Map();
  const missingCount = llm?.productionReadinessChecklist?.filter((i) => i.status === "MISSING").length ?? 0;

  const tabs: Array<{ id: Tab; label: string; count?: number }> = [
    { id: "overview", label: "Overview" },
    { id: "readiness", label: "Readiness", count: missingCount },
    { id: "checks", label: "Health Checks", count: scan.checks.filter((c) => c.status !== "SKIPPED").length },
    { id: "gaps", label: "Gaps", count: llm?.criticalGaps.length },
    { id: "opportunities", label: "Opportunities", count: llm?.buildOpportunities.length },
    { id: "roadmap", label: "Roadmap", count: llm?.scalingRoadmap.length },
    { id: "stack", label: "Tech Stack", count: llm?.techStackAnalysis?.recommendations.length },
  ];

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-5">
          {scan.healthScore !== null && (
            <div className="relative">
              <ScoreRing score={scan.healthScore} size={100} />
              {scan.previousHealthScore !== null && scan.healthScore !== scan.previousHealthScore && (
                <span className={cn(
                  "absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums",
                  scan.healthScore > scan.previousHealthScore
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-red-100 text-red-700",
                )}>
                  {scan.healthScore > scan.previousHealthScore ? "+" : ""}{scan.healthScore - scan.previousHealthScore}
                </span>
              )}
            </div>
          )}
          <div>
            <h2 className="text-xl font-semibold text-[var(--text-1)]">{scan.projectName}</h2>
            {scan.inputUrl && (
              <a
                href={scan.inputUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-[var(--brand-600)] hover:underline"
              >
                {scan.inputUrl}
              </a>
            )}
            {scan.inputGithubRepo && (
              <p className="text-sm text-[var(--text-3)]">github.com/{scan.inputGithubRepo}</p>
            )}
            {scan.techStack && scan.techStack.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {scan.techStack.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center rounded-full border border-[var(--border-2)] bg-[var(--surface-1)] px-2 py-0.5 text-xs font-medium text-[var(--text-2)]"
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRescan}
            loading={rescanning}
            leadingIcon={<ArrowPathIcon className="h-4 w-4" />}
          >
            Re-scan
          </Button>
          {scan.generatedProposalId ? (
            <Link href={`/app/proposals/${scan.generatedProposalId}`}>
              <Button variant="secondary" size="sm" leadingIcon={<DocumentTextIcon className="h-4 w-4" />}>
                View proposal
              </Button>
            </Link>
          ) : (
            <Button
              variant="primary"
              size="sm"
              onClick={handleGenerateProposal}
              loading={generatingProposal}
              leadingIcon={<DocumentTextIcon className="h-4 w-4" />}
            >
              Generate proposal
            </Button>
          )}
          {generateError && (
            <p className="text-xs text-red-600">{generateError}</p>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-[var(--border-2)]">
        <div className="flex gap-0 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-1.5 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition",
                activeTab === tab.id
                  ? "border-[var(--brand-600)] text-[var(--brand-700)]"
                  : "border-transparent text-[var(--text-3)] hover:text-[var(--text-1)]",
              )}
            >
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span className="rounded-full bg-[var(--surface-2)] px-1.5 py-0.5 text-xs text-[var(--text-3)]">
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      {activeTab === "overview" && llm && (
        <div className="space-y-6">
          <div className="rounded-[14px] border border-[var(--border-2)] p-5">
            <p className="app-eyebrow mb-2">Executive summary</p>
            <p className="text-sm leading-7 text-[var(--text-2)]">{llm.executiveSummary}</p>
          </div>

          {llm.strengths.length > 0 && (
            <div>
              <p className="app-eyebrow mb-3">Strengths</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {llm.strengths.map((s) => (
                  <div key={s.title} className="rounded-[12px] border border-emerald-200 bg-emerald-50 p-4">
                    <p className="text-sm font-medium text-emerald-800">{s.title}</p>
                    <p className="mt-1 text-sm text-emerald-700">{s.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {llm.proposalHook && (
            <div className="rounded-[14px] border border-[var(--border-2)] bg-[var(--surface-1)] p-5">
              <p className="app-eyebrow mb-2">Discovery call opener</p>
              <p className="text-sm italic leading-7 text-[var(--text-1)]">&ldquo;{llm.proposalHook}&rdquo;</p>
            </div>
          )}
        </div>
      )}

      {activeTab === "checks" && (
        <div className="space-y-2">
          {Array.from(checksByCategory.entries()).map(([category, checks]) => {
            const applicable = checks.filter((c) => c.status !== "SKIPPED");
            if (!applicable.length) return null;
            const score = categoryScore(checks);
            const failed = checks.filter((c) => c.status === "FAIL").length;
            const warned = checks.filter((c) => c.status === "WARN").length;
            const passed = checks.filter((c) => c.status === "PASS").length;
            const isExpanded = expandedCategories.has(category);
            const hasIssues = failed > 0 || warned > 0;

            return (
              <div key={category} className="rounded-[12px] border border-[var(--border-2)] overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleCategory(category)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-[var(--surface-1)] transition-colors"
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
                    {!hasIssues && (
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
                    {checks.filter((c) => c.status !== "SKIPPED").map((check) => (
                      <div key={check.id} className="flex items-start gap-3 bg-[var(--surface-1)] px-4 py-3">
                        <span className="mt-0.5 text-base">
                          <PulseCheckStatusIcon status={check.status} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-[var(--text-1)]">{check.label}</p>
                          {check.detail && (
                            <p className="mt-0.5 text-xs text-[var(--text-3)]">{check.detail}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {activeTab === "gaps" && llm && (
        <div className="space-y-3">
          {llm.criticalGaps.length === 0 && (
            <p className="text-sm text-[var(--text-3)]">No critical gaps identified.</p>
          )}
          {llm.criticalGaps.map((gap, i) => (
            <div
              key={i}
              className="rounded-[12px] border border-[var(--border-2)] p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <ExclamationTriangleIcon className={cn("mt-0.5 h-4 w-4 shrink-0", gap.urgency === "CRITICAL" ? "text-red-500" : gap.urgency === "HIGH" ? "text-orange-500" : "text-amber-500")} />
                  <div>
                    <p className="text-sm font-medium text-[var(--text-1)]">{gap.gap}</p>
                    <p className="mt-1 text-xs text-[var(--text-3)]">{gap.impact}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="rounded-full border border-[var(--border-2)] bg-[var(--surface-1)] px-2 py-0.5 text-xs text-[var(--text-4)]">
                    {gap.category}
                  </span>
                  <PulseUrgencyBadge urgency={gap.urgency} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === "opportunities" && llm && (
        <div className="space-y-3">
          {llm.buildOpportunities.length === 0 && (
            <p className="text-sm text-[var(--text-3)]">No build opportunities identified.</p>
          )}
          {llm.buildOpportunities.map((opp, i) => (
            <div key={i} className="rounded-[12px] border border-[var(--border-2)] p-4">
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
      )}

      {activeTab === "readiness" && llm && (
        <div className="space-y-6">
          {(!llm.productionReadinessChecklist || llm.productionReadinessChecklist.length === 0) && (
            <p className="text-sm text-[var(--text-3)]">No readiness checklist available.</p>
          )}
          {Array.from(readinessByCategory.entries()).map(([category, items]) => {
            const done = items.filter((item: ProductionReadinessItem) => item.status === "DONE").length;
            return (
              <div key={category}>
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-semibold text-[var(--text-1)]">{category}</p>
                  <span className="text-xs text-[var(--text-4)]">{done}/{items.length} done</span>
                </div>
                <div className="divide-y divide-[var(--border-2)] rounded-[12px] border border-[var(--border-2)]">
                  {(items as ProductionReadinessItem[]).map((item: ProductionReadinessItem, i: number) => (
                    <div key={i} className="flex items-start gap-3 px-4 py-3">
                      <span className="mt-0.5 shrink-0">
                        <ReadinessStatusIcon status={item.status} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className={cn(
                          "text-sm font-medium",
                          item.status === "DONE" ? "text-[var(--text-2)]" : "text-[var(--text-1)]",
                        )}>
                          {item.item}
                        </p>
                        <p className="mt-0.5 text-xs text-[var(--text-3)]">{item.notes}</p>
                      </div>
                      <span className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                        item.status === "DONE"
                          ? "bg-emerald-50 text-emerald-700"
                          : item.status === "PARTIAL"
                            ? "bg-amber-50 text-amber-700"
                            : "bg-red-50 text-red-700",
                      )}>
                        {item.status === "DONE" ? "Done" : item.status === "PARTIAL" ? "Partial" : "Missing"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {activeTab === "stack" && llm?.techStackAnalysis && (
        <StackTab analysis={llm.techStackAnalysis} detectedStack={scan.techStack ?? []} />
      )}

      {activeTab === "roadmap" && llm && (
        <div className="space-y-4">
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
      )}
    </div>
  );
}
