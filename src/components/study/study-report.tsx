"use client";

import { BUILT_IN_PERSONAS, PERSONA_COLORS } from "@/config/study-personas";
import { cn } from "@/lib/format";
import type { StudyReportPayload } from "@/server/study-agents/types";
import type { StudyRecord } from "@/server/study";

const PRIORITY_TONE: Record<string, string> = {
  HIGH: "bg-red-50 text-red-700 border border-red-200",
  MEDIUM: "bg-amber-50 text-amber-700 border border-amber-200",
  LOW: "bg-[var(--surface-1)] text-[var(--text-3)] border border-[var(--border-2)]",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-[var(--text-2)]">{title}</h3>
      {children}
    </div>
  );
}

export function StudyReport({ report }: { report: StudyRecord["report"] }) {
  if (!report) return null;

  const payload = report.payload as StudyReportPayload;

  return (
    <div className="space-y-6">
      {/* Executive Summary */}
      <div className="app-card p-6">
        <Section title="Executive summary">
          <p className="text-sm leading-relaxed text-[var(--text-2)]">{payload.executiveSummary}</p>
        </Section>
      </div>

      {/* Key Findings */}
      {payload.keyFindings?.length > 0 && (
        <div className="app-card p-6">
          <Section title="Key findings">
            <ul className="space-y-2">
              {payload.keyFindings.map((finding, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--brand-700)]" />
                  <p className="text-sm text-[var(--text-2)]">{finding}</p>
                </li>
              ))}
            </ul>
          </Section>
        </div>
      )}

      {/* Themes */}
      {payload.themes?.length > 0 && (
        <div className="app-card p-6">
          <Section title="Themes">
            <div className="space-y-3">
              {payload.themes.map((theme, i) => (
                <div key={i} className="rounded-[10px] bg-[var(--surface-1)] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-semibold text-[var(--text-1)]">{theme.theme}</p>
                    <div className="flex flex-wrap gap-1">
                      {theme.personaIds.map((id) => {
                        const p = BUILT_IN_PERSONAS.find((x) => x.id === id);
                        if (!p) return null;
                        const colors = PERSONA_COLORS[p.color] ?? PERSONA_COLORS.violet;
                        return (
                          <span key={id} className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", colors.bg, colors.text)}>
                            {p.initials}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--text-3)]">{theme.description}</p>
                </div>
              ))}
            </div>
          </Section>
        </div>
      )}

      {/* Per-persona findings */}
      {payload.perPersonaFindings?.length > 0 && (
        <div className="app-card p-6">
          <Section title="Per-persona findings">
            <div className="space-y-4">
              {payload.perPersonaFindings.map((pf) => {
                const persona = BUILT_IN_PERSONAS.find((x) => x.id === pf.personaId);
                const colors = PERSONA_COLORS[persona?.color ?? "violet"] ?? PERSONA_COLORS.violet;
                return (
                  <div key={pf.personaId} className="rounded-[10px] border border-[var(--border-2)] p-4">
                    <div className="mb-3 flex items-center gap-3">
                      <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold", colors.bg, colors.text)}>
                        {persona?.initials ?? pf.personaName[0]}
                      </span>
                      <p className="text-sm font-semibold text-[var(--text-1)]">{pf.personaName}</p>
                    </div>
                    <p className="mb-3 text-[13px] leading-relaxed text-[var(--text-3)]">{pf.summary}</p>
                    {pf.topInsights.length > 0 && (
                      <ul className="space-y-1.5">
                        {pf.topInsights.map((insight, i) => (
                          <li key={i} className="flex items-start gap-2 text-[13px] text-[var(--text-2)]">
                            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[var(--text-4)]" />
                            {insight}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          </Section>
        </div>
      )}

      {/* Recommendations */}
      {payload.recommendations?.length > 0 && (
        <div className="app-card p-6">
          <Section title="Recommendations">
            <div className="space-y-3">
              {payload.recommendations.map((rec, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className={cn("mt-0.5 inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold", PRIORITY_TONE[rec.priority] ?? PRIORITY_TONE.LOW)}>
                    {rec.priority}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[var(--text-1)]">{rec.title}</p>
                    <p className="mt-0.5 text-[13px] text-[var(--text-3)]">{rec.rationale}</p>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        </div>
      )}

      {/* Open questions */}
      {payload.openQuestions?.length > 0 && (
        <div className="app-card p-6">
          <Section title="Open questions">
            <ul className="space-y-2">
              {payload.openQuestions.map((q, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="mt-0.5 shrink-0 text-xs font-medium text-[var(--text-4)]">{i + 1}.</span>
                  <p className="text-sm text-[var(--text-2)]">{q}</p>
                </li>
              ))}
            </ul>
          </Section>
        </div>
      )}
    </div>
  );
}
