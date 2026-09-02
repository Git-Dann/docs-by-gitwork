import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getPublicReport, renderReportMarkdown } from "@/server/pulse-lite/public-report";
import { getPulseEmbedWorkspaceConfig } from "@/server/pulse-embed-workspace";
import { ScanEnquiry } from "./enquiry";

/**
 * PUBLIC result page for a free Pulse scan — `/scan/<id>`.
 *
 * Why this exists as a page rather than only inside the embed iframe:
 *
 *  1. **Shareable.** Nothing inside an iframe has a URL, so nobody could send their
 *     report to their CTO. This is the artefact.
 *  2. **Readable without JavaScript.** A server component, so the score is in the
 *     first byte of HTML. The embed widget is `"use client"` and its number only
 *     exists after hydration — an agent-readiness product that agents cannot read
 *     is the wrong look.
 *  3. **Negotiable.** `Accept: text/markdown` returns the same report as Markdown
 *     from this same canonical URL (see the route handler note below).
 *
 * ⚠️ `noindex` for now, deliberately. Making these pages indexable is the growth
 * engine, but publishing a named third party's score needs an explicit consent
 * checkbox at scan time and a takedown path. Until that exists this is a
 * capability URL: unguessable, shareable by its holder, invisible to crawlers.
 * `/scan/` is in robots.ts's disallow list for the same reason.
 */

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const report = await getPublicReport(id);
  if (!report) return { title: "Report not found · Gitwork Pulse", robots: { index: false, follow: false } };
  return {
    title: `${report.targetHost} scored ${report.score ?? "—"}/100 · Gitwork Pulse`,
    description:
      `A free Pulse scan of ${report.targetHost}: ${report.measured} checks measured, `
      + `${report.triage.actionable.length} to fix, ${report.triage.notEstablished.length} that could not be established.`,
    robots: { index: false, follow: false },
  };
}

const ACCENT = "#6B52FF";
const NAVY = "linear-gradient(160deg, #17172a 0%, #0C0C18 100%)";
const SERIF = "var(--font-fraunces), 'Fraunces', Georgia, serif";

function bandColour(score: number | null): string {
  if (score == null) return "#9ca3af";
  return score >= 75 ? "#16a34a" : score >= 50 ? "#d97706" : "#dc2626";
}

export default async function PublicScanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const report = await getPublicReport(id);
  if (!report) notFound();

  // Content negotiation. A page cannot set its own Content-Type, so an agent asking
  // for Markdown is served the plain-text body inside a <pre> — same bytes, same
  // canonical URL. The dedicated `/scan/[id]/md` route serves it with the correct
  // `text/markdown` header and `Vary: Accept` for anything that needs the real thing.
  const accept = (await headers()).get("accept") ?? "";
  if (accept.includes("text/markdown")) {
    return <pre style={{ whiteSpace: "pre-wrap", fontFamily: "ui-monospace, monospace", padding: 24 }}>{renderReportMarkdown(report)}</pre>;
  }

  const { bookingUrl, turnstileSiteKey } = await getPulseEmbedWorkspaceConfig();
  const colour = bandColour(report.score);
  const t = report.triage;

  return (
    <main
      style={{
        fontFamily: "var(--font-sans), ui-sans-serif, system-ui, sans-serif",
        color: "#111827",
        background: "#ffffff",
        maxWidth: 760,
        margin: "0 auto",
        padding: "clamp(24px, 5vw, 48px) 20px 72px",
      }}
    >
      <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: ACCENT, textTransform: "uppercase", margin: 0 }}>
        Gitwork Pulse
      </p>
      <h1 style={{ fontFamily: SERIF, fontSize: "clamp(26px, 5vw, 34px)", fontWeight: 700, margin: "8px 0 4px", lineHeight: 1.15, overflowWrap: "anywhere" }}>
        {report.targetHost}
      </h1>
      <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 24px", overflowWrap: "anywhere" }}>
        {report.targetUrl}
        {report.scannedAt && <> · scanned {new Date(report.scannedAt).toISOString().slice(0, 10)}</>}
      </p>

      {/* Score — plain text in the server-rendered HTML, no JS required to read it. */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <span style={{ fontFamily: SERIF, fontSize: 56, lineHeight: 1, color: colour, fontVariantNumeric: "tabular-nums" }}>
          {report.score ?? "—"}
        </span>
        <span style={{ fontSize: 14, color: "#9ca3af" }}>/ 100</span>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, color: colour, textTransform: "uppercase" }}>
          {report.band}
        </span>
      </div>

      <p style={{ fontSize: 14, color: "#374151", margin: "16px 0 0", lineHeight: 1.6 }}>
        <strong>{report.measured}</strong> checks measured — {report.pass} passed, {report.warn} warnings,{" "}
        {report.fail} failures{report.inconclusive > 0 && <> , {report.inconclusive} inconclusive</>}.{" "}
        {t.notEstablished.length > 0 && (
          <><strong>{t.notEstablished.length}</strong> could not be established, and are listed below rather than counted either way.</>
        )}
      </p>

      {report.techStack.length > 0 && (
        <p style={{ fontSize: 13, color: "#6b7280", margin: "10px 0 0" }}>
          Detected: {report.techStack.join(" · ")}
        </p>
      )}

      {/* FREE — the actionable report, in full, with evidence. */}
      <section style={{ marginTop: 36 }}>
        <h2 style={{ fontFamily: SERIF, fontSize: 20, fontWeight: 700, margin: "0 0 4px" }}>
          What to fix ({t.actionable.length})
        </h2>
        <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 14px" }}>
          Ranked worst-first by severity and certainty. All of it, free.
        </p>
        {t.actionable.length === 0 ? (
          <p style={{ fontSize: 14, color: "#374151" }}>Nothing reached the actionable threshold on this scan.</p>
        ) : (
          <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
            {t.actionable.map((f) => {
              const isFail = f.status === "FAIL";
              return (
                <li
                  key={f.checkKey}
                  style={{
                    display: "flex",
                    gap: 12,
                    padding: "12px 14px",
                    border: `1px solid ${isFail ? "#fecaca" : "#fde68a"}`,
                    borderRadius: 10,
                    background: isFail ? "#fef2f2" : "#fffbeb",
                  }}
                >
                  <span style={{ color: isFail ? "#dc2626" : "#d97706", fontWeight: 800, fontSize: 16, lineHeight: 1.4, flexShrink: 0 }}>
                    {isFail ? "✕" : "!"}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>
                      {f.label}
                      <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, color: "#6b7280", letterSpacing: 0.5 }}>{f.tier}</span>
                      <span style={{ marginLeft: 8, fontSize: 11, color: "#9ca3af", fontWeight: 400 }}>{f.category}</span>
                    </p>
                    {f.detail && <p style={{ fontSize: 13, color: "#4b5563", margin: "4px 0 0", lineHeight: 1.5 }}>{f.detail}</p>}
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        {t.advisoryCount > 0 && (
          <p style={{ fontSize: 13, color: "#6b7280", marginTop: 14 }}>
            Plus <strong style={{ color: "#374151" }}>{t.advisoryCount}</strong> lower-priority advisory checks
            {t.advisoryByCategory.length > 0 && (
              <> — largest groups {t.advisoryByCategory.slice(0, 4).map((a) => `${a.category} (${a.count})`).join(", ")}</>
            )}
            . Those come with the in-depth review.
          </p>
        )}
      </section>

      {/* FREE — and the differentiator. Silence would read as a pass. */}
      {t.notEstablished.length > 0 && (
        <section style={{ marginTop: 36 }}>
          <h2 style={{ fontFamily: SERIF, fontSize: 20, fontWeight: 700, margin: "0 0 4px" }}>
            What we could not establish ({t.notEstablished.length})
          </h2>
          <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 14px" }}>
            Neither passes nor failures. These are excluded from the score rather than counted either way,
            because an unanswered question is not a clean bill of health.
          </p>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            {t.notEstablished.slice(0, 30).map((n) => (
              <li key={n.checkKey} style={{ padding: "10px 12px", border: "1px solid #e5e7eb", borderRadius: 10, background: "#f9fafb" }}>
                <p style={{ fontSize: 13, fontWeight: 600, margin: 0, color: "#374151" }}>{n.label}</p>
                <p style={{ fontSize: 12.5, color: "#6b7280", margin: "3px 0 0", lineHeight: 1.5 }}>{n.reason}</p>
              </li>
            ))}
          </ul>
          {t.notEstablished.length > 30 && (
            <p style={{ fontSize: 12.5, color: "#6b7280", marginTop: 10 }}>
              …and {t.notEstablished.length - 30} more.
            </p>
          )}
        </section>
      )}

      {/* THE GATE — everything above is free and needed no email. */}
      <section style={{ marginTop: 40, background: NAVY, borderRadius: 14, padding: "clamp(20px, 4vw, 28px)" }}>
        <ScanEnquiry
          scanId={report.id}
          alreadyEnquired={report.enquired}
          failCount={report.fail}
          advisoryCount={t.advisoryCount}
          bookingUrl={bookingUrl}
          targetHost={report.targetHost}
          turnstileSiteKey={turnstileSiteKey}
        />
      </section>

      <p style={{ fontSize: 12, color: "#9ca3af", marginTop: 28, lineHeight: 1.6 }}>
        This is an unauthenticated scan of one public URL at a point in time. It reads responses, headers,
        HTML and DNS; it does not sign in, exercise payments, attempt authorisation, or run the site&apos;s
        JavaScript. Anything needing a repository, a session or a rendered page is reported above as not
        established rather than guessed.
      </p>
      <p style={{ fontSize: 12, color: "#9ca3af", marginTop: 12 }}>
        Powered by <strong style={{ color: "#6b7280" }}>Gitwork Foundry</strong>
      </p>
    </main>
  );
}
