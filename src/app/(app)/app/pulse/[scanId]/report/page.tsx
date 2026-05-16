import { notFound } from "next/navigation";
import { getPulseScan } from "@/server/pulse";
import { PrintButton } from "./print-button";
import type { PulseScanCheckRecord } from "@/types/pulse";

export const dynamic = "force-dynamic";

function groupByCategory(checks: PulseScanCheckRecord[]) {
  const map = new Map<string, PulseScanCheckRecord[]>();
  for (const c of checks) {
    const list = map.get(c.category) ?? [];
    list.push(c);
    map.set(c.category, list);
  }
  return map;
}

function statusIcon(status: string) {
  if (status === "PASS") return "✓";
  if (status === "WARN") return "⚠";
  if (status === "FAIL") return "✗";
  return "–";
}

function scoreColor(score: number) {
  if (score >= 75) return "#16a34a";
  if (score >= 50) return "#d97706";
  return "#dc2626";
}

export default async function PulseReportPage({
  params,
}: {
  params: Promise<{ scanId: string }>;
}) {
  const { scanId } = await params;
  const scan = await getPulseScan(scanId);

  if (!scan || scan.status !== "COMPLETED") notFound();

  const analysis = scan.llmAnalysis;
  const checksByCategory = groupByCategory(scan.checks);
  const score = scan.healthScore ?? 0;
  const scoreStr = String(score);
  const generatedAt = new Date(scan.completedAt ?? scan.createdAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const passCount = scan.checks.filter((c) => c.status === "PASS").length;
  const warnCount = scan.checks.filter((c) => c.status === "WARN").length;
  const failCount = scan.checks.filter((c) => c.status === "FAIL").length;
  const skipCount = scan.checks.filter((c) => c.status === "SKIPPED").length;

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white; }
          .page-break { page-break-before: always; }
        }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; }
        .report { max-width: 820px; margin: 0 auto; background: white; }
        @media screen { .report { padding: 48px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); } }
        @media print { .report { padding: 24px; } }
      `}</style>

      {/* Print button — hidden in print */}
      <div className="no-print sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
        <a href={`/app/pulse/${scanId}`} className="text-sm text-gray-500 hover:text-gray-800">
          ← Back to scan
        </a>
        <PrintButton />
      </div>

      <div className="report">
        {/* Header */}
        <div style={{ borderBottom: "2px solid #e5e7eb", paddingBottom: 24, marginBottom: 32 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 24 }}>
            <div>
              <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "#6b7280", marginBottom: 6 }}>
                Pulse — Project Health Report
              </p>
              <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.03em", color: "#111827", marginBottom: 4 }}>
                {scan.projectName}
              </h1>
              <p style={{ fontSize: 13, color: "#6b7280" }}>
                Scan generated {generatedAt}
                {scan.inputUrl ? ` · ${scan.inputUrl}` : scan.inputGithubRepo ? ` · ${scan.inputGithubRepo}` : ""}
              </p>
            </div>
            <div style={{ textAlign: "center", flexShrink: 0 }}>
              <div style={{ fontSize: 48, fontWeight: 800, lineHeight: 1, color: scoreColor(score) }}>
                {scoreStr}
              </div>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "#6b7280", marginTop: 2 }}>
                Health score
              </div>
              <div style={{ marginTop: 8, display: "flex", gap: 8, fontSize: 12, justifyContent: "center" }}>
                <span style={{ color: "#16a34a" }}>✓ {passCount}</span>
                <span style={{ color: "#d97706" }}>⚠ {warnCount}</span>
                <span style={{ color: "#dc2626" }}>✗ {failCount}</span>
                {skipCount > 0 && <span style={{ color: "#9ca3af" }}>– {skipCount}</span>}
              </div>
            </div>
          </div>
        </div>

        {/* Executive summary */}
        {analysis && (
          <div style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "#111827", marginBottom: 10, letterSpacing: "-0.02em" }}>
              Executive summary
            </h2>
            <p style={{ fontSize: 14, lineHeight: 1.7, color: "#374151" }}>{analysis.executiveSummary}</p>
            {analysis.healthNarrative && (
              <p style={{ fontSize: 14, lineHeight: 1.7, color: "#374151", marginTop: 10 }}>{analysis.healthNarrative}</p>
            )}
            {analysis.proposalHook && (
              <div style={{ marginTop: 14, borderLeft: "3px solid #4f46e5", paddingLeft: 14, fontStyle: "italic", fontSize: 14, color: "#4f46e5" }}>
                {analysis.proposalHook}
              </div>
            )}
          </div>
        )}

        {/* Check results by category */}
        <div style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: "#111827", marginBottom: 14, letterSpacing: "-0.02em" }}>
            Automated checks
          </h2>
          {Array.from(checksByCategory.entries()).map(([category, checks]) => {
            const applicable = checks.filter((c) => c.status !== "SKIPPED");
            const pass = applicable.filter((c) => c.status === "PASS").length;
            const total = applicable.length;
            const issues = checks.filter((c) => c.status === "FAIL" || c.status === "WARN");

            return (
              <div key={category} style={{ marginBottom: 20 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>{category}</span>
                  <span style={{ fontSize: 12, color: "#6b7280" }}>{pass}/{total} passing</span>
                </div>
                {issues.length > 0 && (
                  <div style={{ background: "#f9fafb", borderRadius: 8, padding: "8px 12px" }}>
                    {issues.map((c) => (
                      <div key={c.checkKey} style={{ display: "flex", gap: 8, padding: "4px 0", borderBottom: "1px solid #f3f4f6", fontSize: 13 }}>
                        <span style={{ flexShrink: 0, color: c.status === "FAIL" ? "#dc2626" : "#d97706", fontWeight: 600, width: 14 }}>
                          {statusIcon(c.status)}
                        </span>
                        <div>
                          <span style={{ fontWeight: 500, color: "#111827" }}>{c.label}</span>
                          {c.detail && <span style={{ color: "#6b7280", marginLeft: 6 }}>— {c.detail}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {issues.length === 0 && (
                  <p style={{ fontSize: 12, color: "#16a34a", paddingLeft: 4 }}>All checks passing ✓</p>
                )}
              </div>
            );
          })}
        </div>

        {/* Critical gaps */}
        {analysis?.criticalGaps && analysis.criticalGaps.length > 0 && (
          <div style={{ marginBottom: 32 }} className="page-break">
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "#111827", marginBottom: 14, letterSpacing: "-0.02em" }}>
              Critical gaps
            </h2>
            {analysis.criticalGaps.map((gap, i) => (
              <div key={i} style={{ marginBottom: 12, borderLeft: `3px solid ${gap.urgency === "CRITICAL" ? "#dc2626" : gap.urgency === "HIGH" ? "#d97706" : "#6b7280"}`, paddingLeft: 14 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 2 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{gap.gap}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, padding: "1px 6px", borderRadius: 4, background: gap.urgency === "CRITICAL" ? "#fee2e2" : "#fef3c7", color: gap.urgency === "CRITICAL" ? "#991b1b" : "#92400e" }}>
                    {gap.urgency}
                  </span>
                  <span style={{ fontSize: 11, color: "#6b7280" }}>{gap.category}</span>
                </div>
                <p style={{ fontSize: 13, color: "#6b7280", margin: 0 }}>{gap.impact}</p>
              </div>
            ))}
          </div>
        )}

        {/* Build opportunities */}
        {analysis?.buildOpportunities && analysis.buildOpportunities.length > 0 && (
          <div style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "#111827", marginBottom: 14, letterSpacing: "-0.02em" }}>
              Build opportunities
            </h2>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #e5e7eb" }}>
                  <th style={{ textAlign: "left", padding: "4px 8px 8px 0", color: "#6b7280", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>Opportunity</th>
                  <th style={{ textAlign: "left", padding: "4px 8px 8px 0", color: "#6b7280", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>Category</th>
                  <th style={{ textAlign: "center", padding: "4px 8px 8px 0", color: "#6b7280", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>Effort</th>
                  <th style={{ textAlign: "center", padding: "4px 0 8px 0", color: "#6b7280", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>Value</th>
                </tr>
              </thead>
              <tbody>
                {analysis.buildOpportunities.map((opp, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <td style={{ padding: "8px 8px 8px 0", verticalAlign: "top" }}>
                      <div style={{ fontWeight: 500, color: "#111827" }}>{opp.title}</div>
                      <div style={{ color: "#6b7280", marginTop: 2 }}>{opp.description}</div>
                    </td>
                    <td style={{ padding: "8px 8px 8px 0", verticalAlign: "top", color: "#6b7280", whiteSpace: "nowrap" }}>{opp.category}</td>
                    <td style={{ padding: "8px 8px 8px 0", verticalAlign: "top", textAlign: "center", fontWeight: 600, color: "#374151" }}>{opp.estimatedEffort}</td>
                    <td style={{ padding: "8px 0", verticalAlign: "top", textAlign: "center", fontWeight: 600, color: opp.businessValue === "HIGH" ? "#16a34a" : opp.businessValue === "MEDIUM" ? "#d97706" : "#6b7280" }}>{opp.businessValue}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Scaling roadmap */}
        {analysis?.scalingRoadmap && analysis.scalingRoadmap.length > 0 && (
          <div style={{ marginBottom: 32 }} className="page-break">
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "#111827", marginBottom: 14, letterSpacing: "-0.02em" }}>
              Scaling roadmap
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {analysis.scalingRoadmap.map((phase) => (
                <div key={phase.phase} style={{ display: "flex", gap: 16, padding: "12px 16px", background: "#f9fafb", borderRadius: 8 }}>
                  <div style={{ flexShrink: 0, width: 28, height: 28, borderRadius: "50%", background: "#4f46e5", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700 }}>
                    {phase.phase}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>{phase.title}</span>
                      <span style={{ fontSize: 12, color: "#6b7280" }}>{phase.duration}</span>
                    </div>
                    <ul style={{ margin: 0, padding: "0 0 0 16px" }}>
                      {phase.goals.map((goal, gi) => (
                        <li key={gi} style={{ fontSize: 13, color: "#374151", marginBottom: 2 }}>{goal}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tech stack */}
        {analysis?.techStackAnalysis && (
          <div style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "#111827", marginBottom: 10, letterSpacing: "-0.02em" }}>
              Tech stack assessment
            </h2>
            {scan.techStack && scan.techStack.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
                {scan.techStack.map((t) => (
                  <span key={t} style={{ fontSize: 12, fontWeight: 500, padding: "2px 8px", borderRadius: 999, border: "1px solid #e5e7eb", color: "#374151" }}>{t}</span>
                ))}
              </div>
            )}
            <p style={{ fontSize: 14, lineHeight: 1.7, color: "#374151", marginBottom: 12 }}>{analysis.techStackAnalysis.assessment}</p>
            {analysis.techStackAnalysis.missingForProduction?.length > 0 && (
              <div style={{ background: "#fef3c7", borderRadius: 8, padding: "10px 14px" }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: "#92400e", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>Missing for production</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {analysis.techStackAnalysis.missingForProduction.map((item, i) => (
                    <span key={i} style={{ fontSize: 12, padding: "2px 8px", borderRadius: 4, background: "#fde68a", color: "#78350f" }}>{item}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 16, marginTop: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "#9ca3af" }}>Generated by Gitwork Pulse</span>
          <span style={{ fontSize: 12, color: "#9ca3af" }}>{generatedAt}</span>
        </div>
      </div>
    </>
  );
}
