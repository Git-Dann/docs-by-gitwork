import type { Metadata } from "next";
import { EXTRAS, PULSE_INPUTS, PULSE_PLATFORMS, PULSE_SUMMARY } from "@/lib/pulse-capabilities";
import { pulseCapabilityCounts } from "@/server/pulse-capabilities";

/**
 * PUBLIC, shareable — what Pulse is and everything it does, for sending to someone.
 * Opened from the "About Pulse" card on /app/pulse.
 *
 * Nothing here is typed by hand that the code already knows: the check total and every
 * area's count come from `CHECKS_REGISTRY`, the area descriptions and features from
 * `src/lib/pulse-capabilities.ts`, the product types from the scan form's own list. So the
 * page is current on every deploy. It describes Pulse as it is — no "new", no dates.
 *
 * Not indexed: /pulse-overview and /production-ready are the pages meant to rank.
 */

const PAPER = "#F2EDE4";
const PANEL = "#FFFFFF";
const INK = "#1A1A1E";
const MUTED = "#6B6B6B";
const LINE = "#EAE5DC";
const ACCENT = "#6B52FF";
const DISPLAY = "var(--font-fraunces), 'Fraunces', Georgia, serif";
const SANS = "var(--font-sans), Inter, -apple-system, system-ui, sans-serif";
const MONO = "var(--font-mono), 'JetBrains Mono', ui-monospace, monospace";

export const metadata: Metadata = {
  title: "What Pulse checks · Gitwork",
  description: PULSE_SUMMARY,
  robots: { index: false, follow: false },
  openGraph: { title: "What Pulse checks", description: PULSE_SUMMARY, type: "website" },
};

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, letterSpacing: 1.6, textTransform: "uppercase", color: ACCENT, margin: "0 0 12px" }}>
      {children}
    </p>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{ fontFamily: DISPLAY, fontSize: "clamp(24px, 3.6vw, 34px)", fontWeight: 700, color: INK, lineHeight: 1.15, letterSpacing: "-0.02em", margin: "0 0 20px" }}>
      {children}
    </h2>
  );
}

function Section({ children, ground = PAPER }: { children: React.ReactNode; ground?: string }) {
  return (
    <section style={{ background: ground, borderTop: `1px solid ${LINE}`, padding: "clamp(44px, 7vw, 72px) 16px" }}>
      <div style={{ maxWidth: 1000, margin: "0 auto" }}>{children}</div>
    </section>
  );
}

export default function PulseFeaturesPage() {
  const { checks, areas } = pulseCapabilityCounts();
  const figures: [string, string][] = [
    [checks.toLocaleString("en-GB"), "checks"],
    [String(areas.length), "areas"],
    [String(PULSE_PLATFORMS.length), "product types"],
  ];

  return (
    <main style={{ background: PAPER, color: INK, fontFamily: SANS, minHeight: "100vh" }}>
      {/* Hero */}
      <section style={{ padding: "clamp(48px, 9vw, 96px) 16px clamp(40px, 6vw, 64px)" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto" }}>
          <Eyebrow>Pulse by Gitwork</Eyebrow>
          <h1 style={{ fontFamily: DISPLAY, fontSize: "clamp(34px, 6vw, 56px)", fontWeight: 700, lineHeight: 1.05, letterSpacing: "-0.03em", margin: "0 0 20px" }}>
            What Pulse checks
          </h1>
          <p style={{ fontSize: 18, color: MUTED, lineHeight: 1.65, margin: 0, maxWidth: 680 }}>{PULSE_SUMMARY}</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "12px 40px", marginTop: 32 }}>
            {figures.map(([n, label]) => (
              <div key={label}>
                <div style={{ fontFamily: DISPLAY, fontSize: 40, fontWeight: 700, lineHeight: 1, letterSpacing: "-0.02em" }}>{n}</div>
                <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 1.4, textTransform: "uppercase", color: MUTED, marginTop: 6 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What it scans */}
      <Section ground={PANEL}>
        <Eyebrow>What you give it</Eyebrow>
        <H2>Three ways in</H2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
          {PULSE_INPUTS.map((i) => (
            <div key={i.name} style={{ border: `1px solid ${LINE}`, borderRadius: 10, padding: "18px 18px 16px", background: PAPER }}>
              <p style={{ fontWeight: 600, fontSize: 16, margin: "0 0 6px" }}>{i.name}</p>
              <p style={{ color: MUTED, fontSize: 14, lineHeight: 1.55, margin: 0 }}>{i.detail}</p>
            </div>
          ))}
        </div>
        <p style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", color: MUTED, margin: "28px 0 10px" }}>
          Products it understands
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {PULSE_PLATFORMS.map((p) => (
            <span key={p} style={{ border: `1px solid ${LINE}`, borderRadius: 6, padding: "5px 10px", fontSize: 13, background: PAPER }}>
              {p}
            </span>
          ))}
        </div>
      </Section>

      {/* Checks by area */}
      <Section>
        <Eyebrow>The checks</Eyebrow>
        <H2>{checks.toLocaleString("en-GB")} checks, by area</H2>
        <div style={{ border: `1px solid ${LINE}`, borderRadius: 12, background: PANEL, overflow: "hidden" }}>
          {areas.map((a, i) => (
            <div
              key={a.category}
              className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 sm:grid-cols-[200px_70px_1fr]"
              style={{ padding: "14px 18px", borderTop: i === 0 ? undefined : `1px solid ${LINE}` }}
            >
              <span style={{ fontWeight: 600, fontSize: 15 }}>{a.name}</span>
              <span className="text-right sm:text-left" style={{ fontFamily: MONO, fontSize: 14, color: ACCENT, fontVariantNumeric: "tabular-nums" }}>
                {a.checks.toLocaleString("en-GB")}
              </span>
              <span className="col-span-2 sm:col-span-1" style={{ color: MUTED, fontSize: 14, lineHeight: 1.55 }}>
                {a.covers}
              </span>
            </div>
          ))}
        </div>
        <p style={{ color: MUTED, fontSize: 13, lineHeight: 1.6, margin: "14px 0 0" }}>
          A scan runs only the checks that apply to what is being scanned, so no single scan runs all of them.
        </p>
      </Section>

      {/* On top of the checks */}
      <Section ground={PANEL}>
        <Eyebrow>On top of the checks</Eyebrow>
        <H2>What else Pulse does</H2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
          {EXTRAS.map((e) => (
            <div key={e.name} style={{ border: `1px solid ${LINE}`, borderRadius: 10, padding: "16px 18px", background: PAPER }}>
              <p style={{ fontWeight: 600, fontSize: 15, margin: "0 0 6px" }}>{e.name}</p>
              <p style={{ color: MUTED, fontSize: 14, lineHeight: 1.55, margin: 0 }}>{e.detail}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Close */}
      <Section>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <div>
            <H2>See it on your own product</H2>
            <p style={{ color: MUTED, fontSize: 15, margin: 0 }}>A free check of any live site. No signup.</p>
          </div>
          <a
            href="/production-ready"
            style={{ background: ACCENT, color: "#FFFFFF", fontWeight: 600, fontSize: 15, padding: "13px 22px", borderRadius: 8, textDecoration: "none" }}
          >
            Run a free check →
          </a>
        </div>
        <p style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", color: MUTED, margin: "40px 0 0" }}>
          Pulse by Gitwork · gitwork.co.uk
        </p>
      </Section>
    </main>
  );
}
