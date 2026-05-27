import { notFound } from "next/navigation";
import { getPulseScan } from "@/server/pulse";
import { PrintButton } from "./print-button";
import type { PulseScanCheckRecord } from "@/types/pulse";

export const dynamic = "force-dynamic";

// ─── Domain groupings ────────────────────────────────────────────────────────

interface DomainDef {
  label: string;
  categories: string[];
  color: string;
}

const DOMAIN_DEFS: DomainDef[] = [
  { label: "Infrastructure & DevOps",      categories: ["Infrastructure", "Observability", "Performance"],                       color: "#4f46e5" },
  { label: "Security & Authentication",    categories: ["Security", "Authentication", "Payments"],                               color: "#dc2626" },
  { label: "Code Quality",                 categories: ["Code Quality"],                                                         color: "#0891b2" },
  { label: "Legal & Compliance",           categories: ["Legal & Compliance"],                                                   color: "#7c3aed" },
  { label: "Production Readiness",         categories: ["SaaS Readiness", "Missing Pages"],                                      color: "#d97706" },
  { label: "SEO & Presence",               categories: ["SEO", "Store Listing", "Trust & Brand", "Global Distribution"],        color: "#059669" },
  { label: "Mobile & Accessibility",       categories: ["Mobile & Accessibility", "App Store & Mobile", "Accessibility"],       color: "#db2777" },
  { label: "Roles & Permissions",          categories: ["Roles & Permissions"],                                                  color: "#7c3aed" },
  { label: "Email Deliverability",         categories: ["Email Deliverability"],                                                 color: "#0891b2" },
  { label: "Business Operations",          categories: ["Business Operations"],                                                  color: "#d97706" },
  { label: "API Quality",                  categories: ["API Quality"],                                                          color: "#059669" },
];

interface DomainEntry {
  label: string;
  color: string;
  categories: { name: string; checks: PulseScanCheckRecord[] }[];
}

function groupByCategory(checks: PulseScanCheckRecord[]) {
  const map = new Map<string, PulseScanCheckRecord[]>();
  for (const c of checks) {
    const list = map.get(c.category) ?? [];
    list.push(c);
    map.set(c.category, list);
  }
  return map;
}

function buildDomainGroups(byCat: Map<string, PulseScanCheckRecord[]>): DomainEntry[] {
  const result: DomainEntry[] = [];
  const assigned = new Set<string>();

  for (const def of DOMAIN_DEFS) {
    const cats = def.categories
      .filter((cat) => byCat.has(cat))
      .map((cat) => { assigned.add(cat); return { name: cat, checks: byCat.get(cat)! }; });
    if (cats.length > 0) result.push({ label: def.label, color: def.color, categories: cats });
  }

  // Catch any categories not in a domain
  const other: { name: string; checks: PulseScanCheckRecord[] }[] = [];
  for (const [cat, checks] of byCat.entries()) {
    if (!assigned.has(cat)) other.push({ name: cat, checks });
  }
  if (other.length > 0) result.push({ label: "Other", color: "#6b7280", categories: other });

  return result;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

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

function scoreLabel(score: number) {
  if (score >= 90) return "Excellent";
  if (score >= 75) return "Good";
  if (score >= 50) return "Needs Work";
  return "At Risk";
}

// ─── Score ring SVG (server-rendered, print-safe) ───────────────────────────

function ScoreRing({ score }: { score: number }) {
  const r = 52;
  const circ = 2 * Math.PI * r;
  const filled = (score / 100) * circ;
  const color = scoreColor(score);
  const label = scoreLabel(score);
  return (
    <svg width="132" height="132" viewBox="0 0 132 132" style={{ display: "block" }}>
      <circle cx="66" cy="66" r={r} fill="none" stroke="#e5e7eb" strokeWidth="9" />
      <circle
        cx="66" cy="66" r={r}
        fill="none"
        stroke={color}
        strokeWidth="9"
        strokeDasharray={`${filled} ${circ}`}
        strokeLinecap="round"
        transform="rotate(-90 66 66)"
      />
      <text x="66" y="61" textAnchor="middle" fontFamily="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" fontWeight="800" fontSize="30" fill={color}>{score}</text>
      <text x="66" y="77" textAnchor="middle" fontFamily="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" fontWeight="400" fontSize="12" fill="#9ca3af">/100</text>
      <text x="66" y="94" textAnchor="middle" fontFamily="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" fontWeight="600" fontSize="11" fill={color}>{label}</text>
    </svg>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default async function PulseReportPage({
  params,
}: {
  params: Promise<{ scanId: string }>;
}) {
  const { scanId } = await params;
  const scan = await getPulseScan(scanId);

  if (!scan || scan.status !== "COMPLETED") notFound();

  const analysis = scan.llmAnalysis;
  const byCat = groupByCategory(scan.checks);
  const domains = buildDomainGroups(byCat);

  const score = scan.healthScore ?? 0;
  const generatedAt = new Date(scan.completedAt ?? scan.createdAt).toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric",
  });

  const passCount = scan.checks.filter((c) => c.status === "PASS").length;
  const warnCount = scan.checks.filter((c) => c.status === "WARN").length;
  const failCount = scan.checks.filter((c) => c.status === "FAIL").length;
  const skipCount = scan.checks.filter((c) => c.status === "SKIPPED").length;

  const stats = [
    { count: passCount, label: "Passing",  color: "#16a34a", bg: "#f0fdf4" },
    { count: warnCount, label: "Warnings", color: "#d97706", bg: "#fffbeb" },
    { count: failCount, label: "Failed",   color: "#dc2626", bg: "#fef2f2" },
    ...(skipCount > 0 ? [{ count: skipCount, label: "Skipped", color: "#9ca3af", bg: "#f9fafb" }] : []),
  ];

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; }

        @page { size: A4; margin: 18mm 16mm; }
        @page :first { margin: 0; }

        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          background: #f3f4f6;
          margin: 0;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        p, li {
          orphans: 3;
          widows: 3;
          word-break: break-word;
          overflow-wrap: break-word;
          hyphens: auto;
        }

        h1, h2, h3 {
          word-break: break-word;
          overflow-wrap: break-word;
        }

        .report-wrap {
          max-width: 860px;
          margin: 0 auto;
          background: white;
        }

        @media screen {
          .report-wrap { box-shadow: 0 1px 4px rgba(0,0,0,0.12); }
        }

        /* ── Cover ─────────────────────────────── */
        .rp-cover {
          min-height: 100vh;
          padding: 56px 60px 40px;
          display: flex;
          flex-direction: column;
          background: white;
        }

        /* ── Content ────────────────────────────── */
        .rp-content {
          padding: 44px 60px 56px;
        }

        /* ── Section heading ─────────────────────── */
        .rp-h2 {
          margin: 0 0 22px 0;
          font-size: 18px;
          font-weight: 700;
          letter-spacing: -0.02em;
          color: #111827;
          padding-bottom: 10px;
          border-bottom: 2px solid #111827;
        }

        /* ── Print overrides ─────────────────────── */
        @media print {
          .no-print { display: none !important; }

          .rp-cover {
            min-height: 297mm;
            padding: 48px 52px 36px;
            page-break-after: always;
            break-after: page;
          }

          .rp-content { padding: 0 0 24px; }

          .kb { break-inside: avoid; page-break-inside: avoid; }
          .pb { break-before: page; page-break-before: always; }
        }
      `}</style>

      {/* ── Nav bar (screen only) ─────────────────────────────────────── */}
      <div
        className="no-print"
        style={{
          position: "sticky", top: 0, zIndex: 10,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          borderBottom: "1px solid #e5e7eb", background: "white",
          padding: "10px 24px",
        }}
      >
        <a href={`/app/pulse/${scanId}`} style={{ fontSize: 13, color: "#6b7280", textDecoration: "none" }}>
          ← Back to scan
        </a>
        <PrintButton />
      </div>

      <div className="report-wrap">

        {/* ═══════════════════════ COVER PAGE ═══════════════════════ */}
        <div className="rp-cover">

          {/* Top row: title (left) · score ring (right) */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 32, marginBottom: 32 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: "0 0 14px 0", fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "#9ca3af" }}>
                Pulse · Project Health Report
              </p>
              <h1 style={{ margin: "0 0 10px 0", fontSize: 36, fontWeight: 800, letterSpacing: "-0.04em", lineHeight: 1.1, color: "#111827" }}>
                {scan.projectName}
              </h1>
              {(scan.inputUrl ?? scan.inputGithubRepo) && (
                <p style={{ margin: 0, fontSize: 13, color: "#9ca3af" }}>
                  {scan.inputUrl ?? scan.inputGithubRepo}
                </p>
              )}
            </div>
            <div style={{ flexShrink: 0 }}>
              <ScoreRing score={score} />
            </div>
          </div>

          {/* Stats bar */}
          <div style={{ display: "flex", gap: 0, marginBottom: 32, borderRadius: 10, overflow: "hidden", border: "1px solid #e5e7eb" }}>
            {stats.map((stat, i) => (
              <div key={stat.label} style={{
                flex: 1, textAlign: "center", padding: "16px 8px",
                background: stat.bg,
                borderRight: i < stats.length - 1 ? "1px solid #e5e7eb" : "none",
              }}>
                <div style={{ fontSize: 26, fontWeight: 800, color: stat.color, lineHeight: 1 }}>{stat.count}</div>
                <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "#9ca3af", marginTop: 5 }}>{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Executive summary */}
          {analysis && (
            <div style={{ flex: 1 }}>
              <p style={{ margin: "0 0 12px 0", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#9ca3af" }}>
                Executive Summary
              </p>
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.8, color: "#374151" }}>
                {analysis.executiveSummary}
              </p>
              {analysis.healthNarrative && (
                <p style={{ margin: "14px 0 0", fontSize: 14, lineHeight: 1.8, color: "#374151" }}>
                  {analysis.healthNarrative}
                </p>
              )}
              {analysis.proposalHook && (
                <div style={{ margin: "22px 0 0", borderLeft: "3px solid #4f46e5", paddingLeft: 18, fontSize: 14, fontStyle: "italic", color: "#4338ca", lineHeight: 1.7 }}>
                  {analysis.proposalHook}
                </div>
              )}
            </div>
          )}

          {/* Cover footer: logo left · date right */}
          <div style={{ marginTop: "auto", paddingTop: 24, borderTop: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/foundry-logo.png" alt="Foundry by Gitwork" style={{ height: 26, objectFit: "contain", display: "block" }} />
            <span style={{ fontSize: 12, color: "#9ca3af" }}>Generated {generatedAt}</span>
          </div>
        </div>

        {/* ═══════════════════════ CONTENT PAGES ═══════════════════════ */}
        <div className="rp-content">

          {/* ── Automated Checks ─────────────────────────────────── */}
          <div style={{ marginBottom: 48 }}>
            <h2 className="rp-h2">Automated Checks</h2>

            {domains.map((domain) => {
              const allChecks = domain.categories.flatMap((c) => c.checks);
              const applicable = allChecks.filter((c) => c.status !== "SKIPPED");
              const pass = applicable.filter((c) => c.status === "PASS").length;
              const total = applicable.length;
              const allPass = pass === total;

              return (
                <div key={domain.label} style={{ marginBottom: 28 }}>
                  {/* Domain header */}
                  <div style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    marginBottom: 10, padding: "9px 14px",
                    background: "#f9fafb", borderRadius: 8,
                    borderLeft: `4px solid ${domain.color}`,
                  }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>{domain.label}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: allPass ? "#16a34a" : "#6b7280" }}>
                      {pass}/{total} passing
                    </span>
                  </div>

                  {/* Categories within domain */}
                  <div style={{ paddingLeft: 18, display: "flex", flexDirection: "column", gap: 8 }}>
                    {domain.categories.map(({ name, checks }) => {
                      const catApp = checks.filter((c) => c.status !== "SKIPPED");
                      const catPass = catApp.filter((c) => c.status === "PASS").length;
                      const catTotal = catApp.length;
                      const issues = checks.filter((c) => c.status === "FAIL" || c.status === "WARN");

                      return (
                        <div key={name} className="kb" style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid #f3f4f6", background: "white" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: issues.length > 0 ? 8 : 0 }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>{name}</span>
                            <span style={{ fontSize: 11, color: catPass === catTotal ? "#16a34a" : "#6b7280" }}>
                              {catPass}/{catTotal}
                            </span>
                          </div>

                          {issues.length === 0 ? (
                            <p style={{ margin: "3px 0 0", fontSize: 11, color: "#16a34a" }}>All checks passing ✓</p>
                          ) : (
                            <div>
                              {issues.map((c) => (
                                <div key={c.checkKey} className="kb" style={{ display: "flex", gap: 8, padding: "5px 0", borderTop: "1px solid #f9fafb", fontSize: 12 }}>
                                  <span style={{ flexShrink: 0, width: 14, fontWeight: 700, color: c.status === "FAIL" ? "#dc2626" : "#d97706", paddingTop: 1 }}>
                                    {statusIcon(c.status)}
                                  </span>
                                  <div style={{ flex: 1, minWidth: 0, lineHeight: 1.55 }}>
                                    <span style={{ fontWeight: 500, color: "#111827" }}>{c.label}</span>
                                    {c.detail && (
                                      <span style={{ color: "#9ca3af", marginLeft: 4 }}>— {c.detail}</span>
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
                </div>
              );
            })}
          </div>

          {/* ── Critical Gaps ────────────────────────────────────── */}
          {analysis?.criticalGaps && analysis.criticalGaps.length > 0 && (
            <div className="pb" style={{ marginBottom: 48 }}>
              <h2 className="rp-h2">Critical Gaps</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {analysis.criticalGaps.map((gap, i) => {
                  const uc = gap.urgency === "CRITICAL" ? "#dc2626" : gap.urgency === "HIGH" ? "#d97706" : "#6b7280";
                  const ubg = gap.urgency === "CRITICAL" ? "#fee2e2" : gap.urgency === "HIGH" ? "#fef3c7" : "#f3f4f6";
                  const utx = gap.urgency === "CRITICAL" ? "#991b1b" : gap.urgency === "HIGH" ? "#92400e" : "#374151";
                  return (
                    <div key={i} className="kb" style={{ borderLeft: `3px solid ${uc}`, paddingLeft: 16, paddingTop: 4, paddingBottom: 4 }}>
                      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: 5 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{gap.gap}</span>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4, background: ubg, color: utx, textTransform: "uppercase", letterSpacing: "0.06em", flexShrink: 0 }}>
                          {gap.urgency}
                        </span>
                        <span style={{ fontSize: 11, color: "#9ca3af", flexShrink: 0 }}>{gap.category}</span>
                      </div>
                      <p style={{ margin: 0, fontSize: 13, color: "#6b7280", lineHeight: 1.65 }}>{gap.impact}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Build Opportunities ───────────────────────────── */}
          {analysis?.buildOpportunities && analysis.buildOpportunities.length > 0 && (
            <div style={{ marginBottom: 48 }}>
              <h2 className="rp-h2">Build Opportunities</h2>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #e5e7eb" }}>
                    <th style={{ textAlign: "left", padding: "0 10px 10px 0", fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.07em" }}>Opportunity</th>
                    <th style={{ textAlign: "left", padding: "0 10px 10px 0", fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.07em", whiteSpace: "nowrap" }}>Category</th>
                    <th style={{ textAlign: "center", padding: "0 10px 10px 0", fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.07em", whiteSpace: "nowrap" }}>Effort</th>
                    <th style={{ textAlign: "center", padding: "0 0 10px", fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.07em", whiteSpace: "nowrap" }}>Value</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.buildOpportunities.map((opp, i) => (
                    <tr key={i} className="kb" style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td style={{ padding: "10px 10px 10px 0", verticalAlign: "top" }}>
                        <div style={{ fontWeight: 600, color: "#111827", marginBottom: 3 }}>{opp.title}</div>
                        <div style={{ color: "#6b7280", lineHeight: 1.55, fontSize: 11 }}>{opp.description}</div>
                      </td>
                      <td style={{ padding: "10px 10px 10px 0", verticalAlign: "top", color: "#6b7280", whiteSpace: "nowrap" }}>{opp.category}</td>
                      <td style={{ padding: "10px 10px 10px 0", verticalAlign: "top", textAlign: "center", fontWeight: 600, color: "#374151" }}>{opp.estimatedEffort}</td>
                      <td style={{ padding: "10px 0", verticalAlign: "top", textAlign: "center", fontWeight: 600, color: opp.businessValue === "HIGH" ? "#16a34a" : opp.businessValue === "MEDIUM" ? "#d97706" : "#6b7280" }}>{opp.businessValue}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Scaling Roadmap ──────────────────────────────── */}
          {analysis?.scalingRoadmap && analysis.scalingRoadmap.length > 0 && (
            <div className="pb" style={{ marginBottom: 48 }}>
              <h2 className="rp-h2">Scaling Roadmap</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {analysis.scalingRoadmap.map((phase) => (
                  <div key={phase.phase} className="kb" style={{ display: "flex", gap: 16, padding: "14px 18px", background: "#f9fafb", borderRadius: 10 }}>
                    <div style={{ flexShrink: 0, width: 30, height: 30, borderRadius: "50%", background: "#111827", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700 }}>
                      {phase.phase}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, marginBottom: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>{phase.title}</span>
                        <span style={{ fontSize: 12, color: "#9ca3af" }}>{phase.duration}</span>
                      </div>
                      <ul style={{ margin: 0, padding: "0 0 0 16px" }}>
                        {phase.goals.map((goal, gi) => (
                          <li key={gi} style={{ fontSize: 12, color: "#374151", marginBottom: 3, lineHeight: 1.55 }}>{goal}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Tech Stack Assessment ────────────────────────── */}
          {analysis?.techStackAnalysis && (
            <div style={{ marginBottom: 48 }}>
              <h2 className="rp-h2">Tech Stack Assessment</h2>
              {scan.techStack && scan.techStack.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
                  {scan.techStack.map((t) => (
                    <span key={t} style={{ fontSize: 11, fontWeight: 500, padding: "3px 10px", borderRadius: 999, border: "1px solid #e5e7eb", color: "#374151", background: "#f9fafb" }}>
                      {t}
                    </span>
                  ))}
                </div>
              )}
              <p style={{ margin: "0 0 14px", fontSize: 13, lineHeight: 1.75, color: "#374151" }}>
                {analysis.techStackAnalysis.assessment}
              </p>
              {analysis.techStackAnalysis.missingForProduction?.length > 0 && (
                <div className="kb" style={{ background: "#fef3c7", borderRadius: 8, padding: "12px 16px" }}>
                  <p style={{ margin: "0 0 8px", fontSize: 10, fontWeight: 700, color: "#92400e", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    Missing for production
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {analysis.techStackAnalysis.missingForProduction.map((item, i) => (
                      <span key={i} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: "#fde68a", color: "#78350f" }}>{item}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Report footer */}
          <div style={{ paddingTop: 16, borderTop: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 11, color: "#9ca3af" }}>Generated by Foundry · Gitwork Pulse</span>
            <span style={{ fontSize: 11, color: "#9ca3af" }}>{generatedAt}</span>
          </div>

        </div>
      </div>
    </>
  );
}
