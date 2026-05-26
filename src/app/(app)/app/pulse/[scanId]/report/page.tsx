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

  // SVG score ring — circumference of r=80 circle ≈ 502
  const R = 80;
  const CIRC = 2 * Math.PI * R;
  const offset = CIRC * (1 - score / 100);
  const ringColor = score >= 75 ? "#16a34a" : score >= 50 ? "#d97706" : "#dc2626";
  const ringBg = score >= 75 ? "#dcfce7" : score >= 50 ? "#fef3c7" : "#fee2e2";
  const projectType = analysis?.projectClassification?.type ?? null;
  const projectSubtype = analysis?.projectClassification?.subtype ?? null;
  const blockerCount = (analysis?.productionBlockers ?? []).length;

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white; margin: 0; }
          .page-break { page-break-before: always; break-before: page; }
          .cover-page { page-break-after: always; break-after: page; }
        }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; margin: 0; }
        .report { max-width: 820px; margin: 0 auto; background: white; }
        @media screen { .report { box-shadow: 0 1px 3px rgba(0,0,0,0.1); } }
      `}</style>

      {/* Print button — hidden in print */}
      <div className="no-print sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
        <a href={`/app/pulse/${scanId}`} className="text-sm text-gray-500 hover:text-gray-800">
          ← Back to scan
        </a>
        <PrintButton />
      </div>

      <div className="report">

        {/* ══════════ COVER PAGE ══════════ */}
        <div className="cover-page" style={{
          background: "linear-gradient(160deg, #0f172a 0%, #1e1b4b 60%, #1e293b 100%)",
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          padding: "48px 56px",
          boxSizing: "border-box",
          position: "relative",
          overflow: "hidden",
        }}>
          {/* Subtle background texture ring */}
          <div style={{
            position: "absolute", top: -120, right: -120,
            width: 480, height: 480,
            borderRadius: "50%",
            border: "1px solid rgba(255,255,255,0.04)",
            pointerEvents: "none",
          }} />
          <div style={{
            position: "absolute", top: -60, right: -60,
            width: 320, height: 320,
            borderRadius: "50%",
            border: "1px solid rgba(255,255,255,0.06)",
            pointerEvents: "none",
          }} />

          {/* Top bar: brand + date */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 28, height: 28, borderRadius: 6,
                background: "linear-gradient(135deg, #6d28d9, #4f46e5)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 13, fontWeight: 800, color: "white", letterSpacing: "-0.02em",
              }}>P</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "white", letterSpacing: "0.04em", textTransform: "uppercase" }}>Pulse</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", letterSpacing: "0.06em", textTransform: "uppercase", marginTop: -1 }}>by Gitwork</div>
              </div>
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", letterSpacing: "0.02em" }}>
              {generatedAt}
            </div>
          </div>

          {/* Center: score ring + project name */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 0, paddingTop: 32, paddingBottom: 32 }}>
            {/* Score ring */}
            <div style={{ position: "relative", marginBottom: 40 }}>
              <svg width={200} height={200} style={{ transform: "rotate(-90deg)" }}>
                {/* Track */}
                <circle cx={100} cy={100} r={R}
                  fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={10} />
                {/* Score arc */}
                <circle cx={100} cy={100} r={R}
                  fill="none" stroke={ringColor} strokeWidth={10}
                  strokeLinecap="round"
                  strokeDasharray={CIRC}
                  strokeDashoffset={offset}
                  style={{ transition: "stroke-dashoffset 0.6s ease" }}
                />
              </svg>
              {/* Score number overlay */}
              <div style={{
                position: "absolute", inset: 0,
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              }}>
                <div style={{ fontSize: 52, fontWeight: 800, lineHeight: 1, color: "white", letterSpacing: "-0.04em" }}>
                  {scoreStr}
                </div>
                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.45)", marginTop: 2 }}>
                  / 100
                </div>
              </div>
            </div>

            {/* Project name + label */}
            <p style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.4)", marginBottom: 10 }}>
              Project Health Report
            </p>
            <h1 style={{ fontSize: 38, fontWeight: 800, letterSpacing: "-0.04em", color: "white", textAlign: "center", marginBottom: 10, lineHeight: 1.1 }}>
              {scan.projectName}
            </h1>
            {(scan.inputUrl || scan.inputGithubRepo) && (
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginBottom: 28, letterSpacing: "-0.01em" }}>
                {scan.inputUrl ?? scan.inputGithubRepo}
              </p>
            )}

            {/* Classification badge */}
            {projectType && (
              <div style={{ marginBottom: 32 }}>
                <span style={{
                  fontSize: 12, fontWeight: 600, padding: "4px 12px", borderRadius: 999,
                  background: "rgba(109,40,217,0.3)", color: "rgba(196,181,253,1)",
                  border: "1px solid rgba(109,40,217,0.5)",
                  letterSpacing: "0.02em",
                }}>
                  {projectType}{projectSubtype ? ` · ${projectSubtype}` : ""}
                </span>
              </div>
            )}

            {/* Stat pills */}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 6, padding: "7px 14px",
                background: "rgba(22,163,74,0.15)", border: "1px solid rgba(22,163,74,0.3)",
                borderRadius: 999,
              }}>
                <span style={{ fontSize: 14, color: "#4ade80" }}>✓</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#4ade80" }}>{passCount}</span>
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>passing</span>
              </div>
              {warnCount > 0 && (
                <div style={{
                  display: "flex", alignItems: "center", gap: 6, padding: "7px 14px",
                  background: "rgba(217,119,6,0.15)", border: "1px solid rgba(217,119,6,0.3)",
                  borderRadius: 999,
                }}>
                  <span style={{ fontSize: 14, color: "#fbbf24" }}>⚠</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#fbbf24" }}>{warnCount}</span>
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>warnings</span>
                </div>
              )}
              {failCount > 0 && (
                <div style={{
                  display: "flex", alignItems: "center", gap: 6, padding: "7px 14px",
                  background: "rgba(220,38,38,0.15)", border: "1px solid rgba(220,38,38,0.3)",
                  borderRadius: 999,
                }}>
                  <span style={{ fontSize: 14, color: "#f87171" }}>✗</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#f87171" }}>{failCount}</span>
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>failed</span>
                </div>
              )}
              {skipCount > 0 && (
                <div style={{
                  display: "flex", alignItems: "center", gap: 6, padding: "7px 14px",
                  background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 999,
                }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.4)" }}>–</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.4)" }}>{skipCount}</span>
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>skipped</span>
                </div>
              )}
              {blockerCount > 0 && (
                <div style={{
                  display: "flex", alignItems: "center", gap: 6, padding: "7px 14px",
                  background: "rgba(239,68,68,0.18)", border: "1px solid rgba(239,68,68,0.4)",
                  borderRadius: 999,
                }}>
                  <span style={{ fontSize: 13, color: "#fca5a5" }}>⛔</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#fca5a5" }}>{blockerCount}</span>
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>blockers</span>
                </div>
              )}
            </div>
          </div>

          {/* Cover footer */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            paddingTop: 24, borderTop: "1px solid rgba(255,255,255,0.08)",
            marginTop: "auto",
          }}>
            <div style={{ display: "flex", align: "center", gap: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(255,255,255,0.3)" }}>
                Gitwork
              </span>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.2)" }}> · </span>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>foundry-by-gitwork.vercel.app</span>
            </div>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", letterSpacing: "0.04em" }}>
              Confidential
            </span>
          </div>
        </div>
        {/* ══════════ END COVER PAGE ══════════ */}

        {/* Page 2+ content */}
        <div style={{ padding: "48px 56px" }}>

        {/* Compact page header (page 2 onwards) */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 36, paddingBottom: 20, borderBottom: "1px solid #e5e7eb" }}>
          <div>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#9ca3af", marginBottom: 3 }}>
              Pulse · Project Health Report
            </p>
            <h2 style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em", color: "#111827", margin: 0 }}>
              {scan.projectName}
            </h2>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1, color: ringColor }}>{scoreStr}</div>
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "#9ca3af", marginTop: 2 }}>Health score</div>
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
        {/* ══════════ END PAGE 2+ CONTENT ══════════ */}

      </div>
    </>
  );
}
