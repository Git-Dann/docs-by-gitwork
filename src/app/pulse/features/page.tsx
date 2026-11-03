import type { Metadata } from "next";
import Image from "next/image";
import {
  AREA_GROUPS,
  EXTRAS,
  PULSE_INPUTS,
  PULSE_PLATFORMS,
  PULSE_STEPS,
  PULSE_SUMMARY,
} from "@/lib/pulse-capabilities";
import { pulseCapabilityCounts } from "@/server/pulse-capabilities";
import { PULSE_PLATFORM_LABEL } from "@/lib/pulse-store-url";
import { CheckExplorer } from "./check-explorer";
import { ExampleScanDemo } from "./example-scan";
import { PILLARS } from "@/server/pulse-checks/pillars";
import { EXAMPLE_REPORTS } from "@/lib/pulse-example-reports";
import { scoreGrade } from "@/lib/badge/pulse-badge";

/**
 * What Pulse is and everything it does — an internal overview for sharing a link with the
 * team (Dan to Harry), not a sales page: no call to action, not indexed.
 *
 * Laid out in the Gitwork brand system (paper and ink pages, one purple thing, Fraunces /
 * Inter / JetBrains Mono, flat white cards on hairlines, pills). Its copy rules apply too:
 * no em dashes, never "free".
 *
 * Nothing here is typed by hand that the code already knows: the check total, every area's
 * count and every check's name come from `CHECKS_REGISTRY`; the words from
 * `src/lib/pulse-capabilities.ts`; the product types from the scan form's own list. It is
 * current on every deploy, and describes Pulse as it is (no "new", no dates).
 */

const PAPER = "#F2EDE4";
const INK = "#0C0C18";
const TEXT = "#1A1A1E";
const MUTED = "#6B6B6B";
const INK_MUTED = "rgba(242, 237, 228, 0.62)";
const INK_RULE = "rgba(242, 237, 228, 0.16)";
const RULE = "rgba(12, 12, 24, 0.12)";
const SIGNAL = "#6B52FF";
const DISPLAY = "var(--font-fraunces), 'Fraunces', Georgia, serif";
const BODY = "var(--font-sans), Inter, -apple-system, Helvetica, Arial, sans-serif";
const MONO = "var(--font-mono), 'JetBrains Mono', 'SF Mono', Menlo, monospace";

export const metadata: Metadata = {
  title: "Pulse · what it is and what it does",
  description: PULSE_SUMMARY,
  // Kept off search engines: this is a link for the team, not a public page.
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

function Eyebrow({ children, onInk = false }: { children: React.ReactNode; onInk?: boolean }) {
  return (
    <p style={{ fontFamily: MONO, fontSize: 11, fontWeight: 600, letterSpacing: "0.2em", textTransform: "uppercase", color: onInk ? PAPER : MUTED, margin: "0 0 14px" }}>
      {children}
    </p>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{ fontFamily: DISPLAY, fontSize: "clamp(32px, 5vw, 52px)", fontWeight: 700, lineHeight: 1.08, letterSpacing: "-0.018em", margin: "0 0 12px", color: TEXT }}>
      {children}
    </h2>
  );
}

function Lede({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 18, fontWeight: 300, lineHeight: 1.55, color: MUTED, margin: "0 0 32px", maxWidth: "80ch", textWrap: "balance" }}>{children}</p>;
}

function Wrap({ children }: { children: React.ReactNode }) {
  return <div style={{ maxWidth: 1080, margin: "0 auto", padding: "0 20px" }}>{children}</div>;
}

const card: React.CSSProperties = { background: "#FFFFFF", border: `1px solid ${RULE}`, borderRadius: 14, padding: "22px 22px 20px" };

export default function PulseFeaturesPage() {
  const { checks, areas } = pulseCapabilityCounts();
  // A section with no live checks (Standards, until evidence lets one show) has nothing to list.
  const groups = AREA_GROUPS.filter((g) => areas.some((a) => a.group === g.id));
  const figures: [string, string][] = [
    [checks.toLocaleString("en-GB"), "Checks"],
    [String(areas.length), "Areas"],
    [String(PULSE_PLATFORMS.length), "Product types"],
    [String(PULSE_INPUTS.length), "Ways in"],
  ];

  return (
    <main style={{ background: PAPER, color: TEXT, fontFamily: BODY, minHeight: "100vh" }}>
      {/* Top bar — paper, ink wordmark (the one logo on the page) */}
      <header style={{ borderBottom: `1px solid ${RULE}` }}>
        <Wrap>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 64 }}>
            <Image src="/gitwork-logo-home-page.png" alt="Gitwork" width={104} height={19} priority />
            <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 500, letterSpacing: "0.14em", textTransform: "uppercase", color: MUTED }}>
              Pulse · Overview
            </span>
          </div>
        </Wrap>
      </header>

      {/* Hero — the ink page */}
      <section style={{ background: INK, color: PAPER, padding: "clamp(56px, 9vw, 104px) 0 clamp(48px, 7vw, 80px)" }}>
        <Wrap>
          <Eyebrow onInk>Pulse</Eyebrow>
          <h1 style={{ fontFamily: DISPLAY, fontSize: "clamp(40px, 7vw, 76px)", fontWeight: 700, lineHeight: 1.02, letterSpacing: "-0.022em", margin: "0 0 22px", maxWidth: "16ch" }}>
            Is it ready to launch? <em style={{ fontStyle: "italic", color: SIGNAL }}>Pulse answers that.</em>
          </h1>
          <p style={{ fontSize: 20, fontWeight: 300, lineHeight: 1.5, color: INK_MUTED, margin: 0, maxWidth: "52ch" }}>{PULSE_SUMMARY}</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 1, marginTop: 44, borderTop: `1px solid ${INK_RULE}` }}>
            {figures.map(([n, label]) => (
              <div key={label} style={{ padding: "22px 0 0" }}>
                <div style={{ fontFamily: DISPLAY, fontSize: 54, fontWeight: 700, lineHeight: 1, letterSpacing: "-0.03em", color: PAPER, fontVariantNumeric: "tabular-nums" }}>{n}</div>
                <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 500, letterSpacing: "0.14em", textTransform: "uppercase", color: INK_MUTED, marginTop: 10 }}>{label}</div>
              </div>
            ))}
          </div>
        </Wrap>
      </section>

      {/* How a scan works */}
      <section style={{ padding: "clamp(56px, 8vw, 96px) 0" }}>
        <Wrap>
          <Eyebrow>How it works</Eyebrow>
          <H2>One scan, four steps</H2>
          <Lede>It never guesses. Anything it could not check is reported as exactly that.</Lede>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 18 }}>
            {PULSE_STEPS.map((s, i) => (
              <div key={s.title} style={card}>
                <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 600, letterSpacing: "0.2em", color: MUTED }}>{String(i + 1).padStart(2, "0")}</div>
                <h3 style={{ fontFamily: DISPLAY, fontSize: 22, fontWeight: 700, letterSpacing: "-0.012em", lineHeight: 1.2, margin: "14px 0 8px" }}>{s.title}</h3>
                <p style={{ fontSize: 14, lineHeight: 1.55, color: MUTED, margin: 0 }}>{s.detail}</p>
              </div>
            ))}
          </div>
        </Wrap>
      </section>

      {/* What a result looks like — example data that moves */}
      <section style={{ padding: "clamp(56px, 8vw, 96px) 0", borderTop: `1px solid ${RULE}`, background: "#EAE5DC" }}>
        <Wrap>
          <Eyebrow>See it work</Eyebrow>
          <H2>What a result looks like</H2>
          <Lede>Pick a kind of product. These are example results, not a client&apos;s, but every finding is the kind Pulse really reports.</Lede>
          <ExampleScanDemo pillars={PILLARS.map((p) => ({ key: p.key, label: p.label, weight: p.weight }))} />
        </Wrap>
      </section>

      {/* Example reports — the real report design, as PDFs, at three levels */}
      <section style={{ padding: "clamp(56px, 8vw, 96px) 0", borderTop: `1px solid ${RULE}` }}>
        <Wrap>
          <Eyebrow>The report</Eyebrow>
          <H2>Three example reports</H2>
          <Lede>The PDF a client receives, in the same design, for a strong, a middling and a weak result. Example data, not a client&apos;s.</Lede>
          <div className="pf-reports">
            {EXAMPLE_REPORTS.map((r) => (
              <article key={r.id} className="pf-report">
                <div className="pf-report-cover">
                  <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 500, letterSpacing: "0.16em", textTransform: "uppercase", color: INK_MUTED }}>Pulse // Example report</div>
                  <div className="pf-report-head">
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontFamily: DISPLAY, fontSize: 22, fontWeight: 700, letterSpacing: "-0.012em", lineHeight: 1.15, color: PAPER }}>{breakable(r.subject)}</div>
                      <div style={{ fontSize: 13, color: INK_MUTED, marginTop: 4 }}>{r.kind}</div>
                    </div>
                    <div className="pf-report-score" style={{ ["--band" as string]: bandColour(r.score) }}>
                      <span>{r.score}</span>
                    </div>
                  </div>
                </div>
                <div style={{ padding: "18px 20px 20px", display: "flex", flexDirection: "column", gap: 12, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: MONO, fontSize: 10, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase" }}>
                    <span style={{ width: 8, height: 8, borderRadius: 999, background: bandColour(r.score) }} />
                    <span>{r.label}</span>
                    <span style={{ color: MUTED }}>· {scoreGrade(r.score)}</span>
                  </div>
                  <p style={{ fontSize: 14, lineHeight: 1.55, color: MUTED, margin: 0, flex: 1 }}>{r.summary}</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    <a className="pf-report-btn pf-report-btn--primary" href={`/api/public/pulse/examples/${r.id}/pdf`} target="_blank" rel="noopener">Open the PDF</a>
                    <a className="pf-report-btn" href={`/pulse/features/examples/${r.id}`} target="_blank" rel="noopener">View in the browser</a>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </Wrap>
      </section>

      {/* What it checks — the explorer */}
      <section style={{ padding: "clamp(56px, 8vw, 96px) 0", borderTop: `1px solid ${RULE}` }}>
        <Wrap>
          <Eyebrow>What it checks</Eyebrow>
          <H2>{checks.toLocaleString("en-GB")} checks, in {groups.length} sections</H2>
          <Lede>Search for anything, narrow it to a section, or open an area to see every check in it.</Lede>
          <CheckExplorer
            total={checks}
            groups={groups.map((g) => ({ id: g.id, name: g.name, line: g.line }))}
            areas={areas.map((a) => ({ category: a.category, group: a.group, name: a.name, covers: a.covers, labels: a.labels }))}
          />
          <p style={{ color: MUTED, fontSize: 13, lineHeight: 1.6, margin: "8px 0 0" }}>
            A scan runs only the checks that apply to what is being scanned, so no single scan runs all of them.
          </p>
        </Wrap>
      </section>

      {/* What it scans — three ways in, each listing the product types it covers */}
      <section style={{ padding: "clamp(56px, 8vw, 96px) 0", borderTop: `1px solid ${RULE}`, background: "#EAE5DC" }}>
        <Wrap>
          <Eyebrow>What it scans</Eyebrow>
          <H2>Three ways in, {PULSE_PLATFORMS.length} kinds of product</H2>
          <div className="pf-ways">
            {PULSE_INPUTS.map((i, n) => (
              <div key={i.name} className="pf-way">
                <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 600, letterSpacing: "0.2em", color: MUTED }}>{String(n + 1).padStart(2, "0")}</div>
                <h3 style={{ fontFamily: DISPLAY, fontSize: 24, fontWeight: 700, letterSpacing: "-0.012em", lineHeight: 1.15, margin: "12px 0 8px" }}>{i.name}</h3>
                <p style={{ fontSize: 14, lineHeight: 1.55, color: MUTED, margin: 0 }}>{i.detail}</p>
                <ul className="pf-way-list">
                  {i.products.map((p) => (
                    <li key={p}>{PULSE_PLATFORM_LABEL[p]}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Wrap>
      </section>

      {/* Beyond the checks — a two-column list, not a wall of boxes */}
      <section style={{ padding: "clamp(56px, 8vw, 96px) 0", borderTop: `1px solid ${RULE}` }}>
        <Wrap>
          <Eyebrow>Beyond the checks</Eyebrow>
          <H2>What else Pulse does</H2>
          <dl className="pf-extras">
            {EXTRAS.map((e) => (
              <div key={e.name} className="pf-extra">
                <dt style={{ fontSize: 15, fontWeight: 600, margin: "0 0 4px", color: TEXT }}>{e.name}</dt>
                <dd style={{ fontSize: 14, lineHeight: 1.55, color: MUTED, margin: 0 }}>{e.detail}</dd>
              </div>
            ))}
          </dl>
        </Wrap>
      </section>

      <style>{PAGE_STYLES}</style>

      <footer style={{ borderTop: `1px solid ${RULE}` }}>
        <Wrap>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: "24px 0 32px", fontFamily: MONO, fontSize: 10, fontWeight: 500, letterSpacing: "0.14em", textTransform: "uppercase", color: MUTED }}>
            <span>gitwork.co.uk</span>
            <span>Pulse overview</span>
          </div>
        </Wrap>
      </footer>
    </main>
  );
}

/** A domain or repo name that may wrap only after a dot or slash, never mid-word. */
function breakable(name: string): React.ReactNode {
  return name.split(/(?<=[./])/).map((part, i) => (
    <span key={i}>
      {i > 0 && <wbr />}
      {part}
    </span>
  ));
}

/** The report's own score bands (HealthScoreRing / scoreBand): 75+ good, 50+ needs work, under 50 at risk. */
function bandColour(score: number): string {
  return score >= 75 ? "#1F9D63" : score >= 50 ? "#C98A0B" : "#D2463C";
}

/** Layout rules inline styles cannot express: column counts per width, and the hairline rows. */
const PAGE_STYLES = `
.pf-ways{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));grid-template-rows:auto auto auto 1fr;margin-top:32px;background:#fff;border:1px solid ${RULE};border-radius:14px;overflow:hidden}
/* Subgrid: the number, title, description and list are four shared rows, so every column's
   divider lines up however long its description runs. */
.pf-way{padding:26px 26px 24px;display:grid;grid-row:span 4;grid-template-rows:subgrid;row-gap:0;align-content:start}
.pf-way + .pf-way{border-left:1px solid ${RULE}}
.pf-way-list{list-style:none;margin:20px 0 0;padding:16px 0 0;border-top:1px solid ${RULE};display:grid;gap:9px}
.pf-way-list li{display:flex;align-items:center;gap:10px;font-size:14px;color:${TEXT}}
.pf-way-list li::before{content:"";flex:0 0 auto;width:6px;height:6px;border-radius:999px;background:${SIGNAL}}
.pf-extras{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:48px;margin:28px 0 0;border-top:1px solid ${RULE}}
.pf-extra{padding:18px 0;border-bottom:1px solid ${RULE}}
.pf-reports{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));grid-template-rows:auto auto;column-gap:18px;row-gap:0}
/* Subgrid: every card's dark cover and white body share one row each, so a name that
   wraps in one card makes all three covers taller together, not just its own. */
.pf-report{grid-row:span 2;display:grid;grid-template-rows:subgrid;row-gap:0;background:#fff;border:1px solid ${RULE};border-radius:14px;overflow:hidden}
.pf-report-cover{background:${INK};padding:20px 20px 22px;display:flex;flex-direction:column}
.pf-report-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding-top:28px}
.pf-report-score{flex:0 0 auto;width:64px;height:64px;border-radius:999px;display:grid;place-items:center;border:4px solid var(--band);}
.pf-report-score span{font-family:var(--font-fraunces),'Fraunces',Georgia,serif;font-size:24px;font-weight:700;color:${PAPER};font-variant-numeric:tabular-nums lining-nums}
.pf-report-btn{display:inline-flex;align-items:center;min-height:36px;padding:0 14px;border-radius:999px;border:1px solid ${RULE};font-size:13px;font-weight:500;color:${TEXT};text-decoration:none}
.pf-report-btn:hover{border-color:${TEXT}}
.pf-report-btn:focus-visible{outline:2px solid ${SIGNAL};outline-offset:2px}
.pf-report-btn--primary{background:${INK};border-color:${INK};color:${PAPER}}
.pf-report-btn--primary:hover{background:${SIGNAL};border-color:${SIGNAL}}
@media (max-width: 760px){
  .pf-reports{grid-template-columns:minmax(0,1fr);grid-template-rows:none;row-gap:18px}
  .pf-report{grid-row:auto;grid-template-rows:none;display:flex;flex-direction:column}
  .pf-ways{grid-template-columns:minmax(0,1fr);grid-template-rows:none}
  .pf-way{grid-row:auto;grid-template-rows:none;display:flex;flex-direction:column}
  .pf-way + .pf-way{border-left:0;border-top:1px solid ${RULE}}
  .pf-way{padding:22px 20px}
  .pf-extras{grid-template-columns:minmax(0,1fr)}
  .pf-way-list{grid-template-columns:repeat(2,minmax(0,1fr))}
}
`;
