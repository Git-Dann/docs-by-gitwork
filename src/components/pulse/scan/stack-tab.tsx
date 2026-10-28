"use client";

import type { InfrastructureStack, TechStackRecommendation } from "@/types/pulse";
import { cn } from "@/lib/format";
import { XCircleIcon } from "@heroicons/react/24/outline";

export function StackPriorityBadge({ priority }: { priority: TechStackRecommendation["priority"] }) {
  const styles =
    priority === "HIGH"
      ? "bg-red-50 text-red-700"
      : priority === "MEDIUM"
        ? "bg-amber-50 text-amber-700"
        : "bg-[var(--surface-1)] text-[var(--text-3)]";
  return (
    <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-medium", styles)}>
      {priority}
    </span>
  );
}

export const INFRA_LABELS: { key: keyof InfrastructureStack; label: string }[] = [
  { key: "frontend",       label: "Frontend" },
  { key: "backend",        label: "Backend" },
  { key: "database",       label: "Database" },
  { key: "hosting",        label: "Hosting" },
  { key: "auth",           label: "Auth" },
  { key: "payments",       label: "Payments" },
  { key: "email",          label: "Email" },
  { key: "storage",        label: "Storage" },
  { key: "caching",        label: "Caching" },
  { key: "backgroundJobs", label: "Background jobs" },
  { key: "search",         label: "Search" },
  { key: "monitoring",     label: "Monitoring" },
  { key: "analytics",      label: "Analytics" },
  { key: "cicd",           label: "CI/CD" },
];

export function StackTab({
  analysis,
  detectedStack,
}: {
  analysis: NonNullable<import("@/types/pulse").PulseAnalysisOutput["techStackAnalysis"]>;
  detectedStack: string[];
}) {
  return (
    <div className="space-y-6">
      {/* Infrastructure map — only show layers where something was detected */}
      {analysis.detectedStack && (() => {
        const detectedLayers = INFRA_LABELS.filter(({ key }) => Boolean(analysis.detectedStack[key]));
        return detectedLayers.length > 0 ? (
          <div>
            <p className="mb-3 text-sm font-semibold text-[var(--text-1)]">Infrastructure map</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {detectedLayers.map(({ key, label }) => (
                <div
                  key={key}
                  className="flex items-center justify-between gap-3 rounded-[10px] border border-[var(--border-2)] bg-white px-3 py-2.5"
                >
                  <span className="text-xs font-medium text-[var(--text-3)]">{label}</span>
                  <span className="text-xs font-semibold text-[var(--text-1)]">{analysis.detectedStack[key]}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-[10px] border border-dashed border-[var(--border-2)] bg-[var(--surface-1)] p-5 text-center">
            <p className="text-sm font-semibold text-[var(--text-2)]">Stack could not be detected from URL alone</p>
            <p className="mt-1 text-xs text-[var(--text-3)]">
              Provide a GitHub repo URL for code-level stack detection — framework, database, auth provider, and more.
            </p>
          </div>
        );
      })()}

      {/* Detected raw signals (fallback for old scans) */}
      {!analysis.detectedStack && detectedStack.length > 0 && (
        <div className="rounded-[10px] border border-[var(--border-2)] p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--text-4)]">Detected signals</p>
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
      <div className="rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] p-4">
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
          <p className="mb-3 text-sm font-semibold text-[var(--text-1)]">Recommendations</p>
          <div className="space-y-3">
            {analysis.recommendations.map((rec, i) => (
              <div key={i} className="rounded-[10px] border border-[var(--border-2)] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-[var(--text-1)]">{rec.area}</p>
                      {rec.current && (
                        <span className="rounded border border-[var(--border-2)] px-1.5 py-0.5 text-xs text-[var(--text-4)]">
                          current: {rec.current}
                        </span>
                      )}
                      <span className="text-xs font-medium text-[var(--brand-600)]">→ {rec.recommended}</span>
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

      {/* Target architecture — recommended 2026 stack per layer with migration cost/risk */}
      {analysis.targetArchitecture && analysis.targetArchitecture.length > 0 && (
        <div>
          <p className="mb-1 text-sm font-semibold text-[var(--text-1)]">Recommended architecture</p>
          <p className="mb-3 text-xs text-[var(--text-4)]">The stack we&apos;d target for this product, with the effort, cost and risk of getting there.</p>
          <div className="space-y-3">
            {analysis.targetArchitecture.map((t, i) => {
              const layerLabel = INFRA_LABELS.find((l) => l.key === t.layer)?.label ?? t.layer;
              const riskTone = t.risk.level === "LOW" ? "bg-emerald-50 text-emerald-700" : t.risk.level === "MEDIUM" ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700";
              return (
                <div key={i} className="rounded-[10px] border border-[var(--border-2)] p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="widget-data-label">{layerLabel}</span>
                    {t.current && <span className="text-xs text-[var(--text-4)]">{t.current}</span>}
                    <span className="text-sm font-semibold text-[var(--brand-600)]">→ {t.recommended}</span>
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase", riskTone)}>{t.risk.level} risk</span>
                    <span className="ml-auto text-xs text-[var(--text-4)] tabular-nums">{t.migration.effort} · ~{t.migration.weeks}w · {t.appliesAt}</span>
                  </div>
                  <p className="mt-1.5 text-sm leading-5 text-[var(--text-2)]">{t.rationale}</p>
                  {t.migration.steps.length > 0 && (
                    <ol className="mt-2 space-y-0.5">
                      {t.migration.steps.map((s, j) => (
                        <li key={j} className="text-xs leading-5 text-[var(--text-3)]">{j + 1}. {s}</li>
                      ))}
                    </ol>
                  )}
                  {t.migration.blockers.length > 0 && (
                    <p className="mt-1.5 text-[11px] leading-4 text-amber-700">⚠ {t.migration.blockers.join(" · ")}</p>
                  )}
                  {t.alternativeOptions.length > 0 && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs font-medium text-[var(--text-3)] hover:text-[var(--text-1)]">
                        {t.alternativeOptions.length} alternative{t.alternativeOptions.length !== 1 ? "s" : ""}
                      </summary>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        {t.alternativeOptions.map((alt, k) => (
                          <div key={k} className="rounded-[8px] bg-[var(--surface-1)] p-2.5">
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="text-xs font-semibold text-[var(--text-1)]">{alt.name}</span>
                              {alt.approxCostPerMonthGbp > 0 && <span className="text-[10px] text-[var(--text-4)] tabular-nums">£{alt.approxCostPerMonthGbp}/mo</span>}
                            </div>
                            {alt.pros.length > 0 && <p className="mt-0.5 text-[11px] leading-4 text-emerald-700">+ {alt.pros.join(", ")}</p>}
                            {alt.cons.length > 0 && <p className="mt-0.5 text-[11px] leading-4 text-[var(--text-4)]">− {alt.cons.join(", ")}</p>}
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Migration roadmap */}
      {analysis.architecturePhases && analysis.architecturePhases.length > 0 && (
        <div>
          <p className="mb-3 text-sm font-semibold text-[var(--text-1)]">Migration roadmap</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            {analysis.architecturePhases.map((p, i) => (
              <div key={i} className="flex-1 rounded-[10px] border border-[var(--border-2)] p-3">
                <p className="text-xs font-semibold text-[var(--text-1)]">Phase {p.phase} · {p.duration}</p>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {p.layers.map((layer) => (
                    <span key={layer} className="rounded-[4px] bg-[var(--surface-1)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-3)]">
                      {INFRA_LABELS.find((l) => l.key === layer)?.label ?? layer}
                    </span>
                  ))}
                </div>
                <p className="mt-1.5 text-[11px] leading-4 text-[var(--text-3)]">{p.outcome}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
