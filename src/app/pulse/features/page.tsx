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
import { CheckExplorer } from "./check-explorer";

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
  return <p style={{ fontSize: 18, fontWeight: 300, lineHeight: 1.55, color: MUTED, margin: "0 0 32px", maxWidth: "52ch" }}>{children}</p>;
}

function Wrap({ children }: { children: React.ReactNode }) {
  return <div style={{ maxWidth: 1080, margin: "0 auto", padding: "0 20px" }}>{children}</div>;
}

const card: React.CSSProperties = { background: "#FFFFFF", border: `1px solid ${RULE}`, borderRadius: 14, padding: "22px 22px 20px" };

export default function PulseFeaturesPage() {
  const { checks, areas } = pulseCapabilityCounts();
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

      {/* What it checks — the explorer */}
      <section style={{ padding: "clamp(56px, 8vw, 96px) 0", borderTop: `1px solid ${RULE}` }}>
        <Wrap>
          <Eyebrow>What it checks</Eyebrow>
          <H2>{checks.toLocaleString("en-GB")} checks, in {AREA_GROUPS.length} sections</H2>
          <Lede>Search for anything, or pick a section and open an area to see every check in it.</Lede>
          <CheckExplorer
            total={checks}
            groups={AREA_GROUPS.map((g) => ({ id: g.id, name: g.name, line: g.line }))}
            areas={areas.map((a) => ({ category: a.category, group: a.group, name: a.name, covers: a.covers, labels: a.labels }))}
          />
          <p style={{ color: MUTED, fontSize: 13, lineHeight: 1.6, margin: "8px 0 0" }}>
            A scan runs only the checks that apply to what is being scanned, so no single scan runs all of them.
          </p>
        </Wrap>
      </section>

      {/* What it understands */}
      <section style={{ padding: "clamp(56px, 8vw, 96px) 0", borderTop: `1px solid ${RULE}`, background: "#EAE5DC" }}>
        <Wrap>
          <Eyebrow>What it scans</Eyebrow>
          <H2>Three ways in, {PULSE_PLATFORMS.length} kinds of product</H2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 18, margin: "28px 0 24px" }}>
            {PULSE_INPUTS.map((i) => (
              <div key={i.name} style={card}>
                <h3 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 6px" }}>{i.name}</h3>
                <p style={{ fontSize: 14, lineHeight: 1.55, color: TEXT, margin: 0 }}>{i.detail}</p>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {PULSE_PLATFORMS.map((p) => (
              <span key={p} style={{ border: `1px solid ${RULE}`, background: "#FFFFFF", borderRadius: 999, padding: "6px 14px", fontSize: 13 }}>
                {p}
              </span>
            ))}
          </div>
        </Wrap>
      </section>

      {/* Beyond the checks */}
      <section style={{ padding: "clamp(56px, 8vw, 96px) 0", borderTop: `1px solid ${RULE}` }}>
        <Wrap>
          <Eyebrow>Beyond the checks</Eyebrow>
          <H2>What else Pulse does</H2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 18, marginTop: 28 }}>
            {EXTRAS.map((e) => (
              <div key={e.name} style={card}>
                <h3 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 6px" }}>{e.name}</h3>
                <p style={{ fontSize: 14, lineHeight: 1.55, color: MUTED, margin: 0 }}>{e.detail}</p>
              </div>
            ))}
          </div>
        </Wrap>
      </section>

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
