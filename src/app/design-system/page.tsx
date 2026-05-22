"use client";

import { useState } from "react";

const colorGroups = [
  {
    label: "Brand Blue",
    swatches: [
      { name: "primary", hex: "#1D4ED8", label: "Primary" },
      { name: "primary-deep", hex: "#1E3A8A", label: "Deep" },
      { name: "primary-bright", hex: "#3B82F6", label: "Bright" },
      { name: "primary-soft", hex: "#DBEAFE", label: "Soft" },
      { name: "primary-tint", hex: "#EFF6FF", label: "Tint" },
    ],
  },
  {
    label: "Surface",
    swatches: [
      { name: "canvas", hex: "#FAFAF9", label: "Canvas" },
      { name: "surface", hex: "#F5F5F4", label: "Surface" },
      { name: "surface-raised", hex: "#FFFFFF", label: "Raised" },
      { name: "surface-dark", hex: "#0F172A", label: "Dark" },
      { name: "surface-dark-raised", hex: "#1E293B", label: "Dark Raised" },
      { name: "surface-code", hex: "#0F172A", label: "Code" },
    ],
  },
  {
    label: "Text",
    swatches: [
      { name: "ink", hex: "#0F172A", label: "Ink" },
      { name: "charcoal", hex: "#1E293B", label: "Charcoal" },
      { name: "slate", hex: "#475569", label: "Slate" },
      { name: "steel", hex: "#64748B", label: "Steel" },
      { name: "stone", hex: "#94A3B8", label: "Stone" },
      { name: "muted", hex: "#CBD5E1", label: "Muted" },
    ],
  },
  {
    label: "Semantic",
    swatches: [
      { name: "success", hex: "#16A34A", label: "Success" },
      { name: "success-soft", hex: "#DCFCE7", label: "Success Soft" },
      { name: "warning", hex: "#D97706", label: "Warning" },
      { name: "warning-soft", hex: "#FEF3C7", label: "Warning Soft" },
      { name: "danger", hex: "#DC2626", label: "Danger" },
      { name: "danger-soft", hex: "#FEE2E2", label: "Danger Soft" },
    ],
  },
];

const typeScale = [
  { token: "stat-large", size: "64px", weight: "400", family: "serif", sample: "7,842", label: "Hero metric" },
  { token: "stat-display", size: "48px", weight: "400", family: "serif", sample: "09:16", label: "Stat callout" },
  { token: "heading-1", size: "44px", weight: "400", family: "serif", sample: "Good afternoon.", label: "Page headline" },
  { token: "heading-2", size: "32px", weight: "600", family: "sans", sample: "Dashboard overview", label: "Section headline" },
  { token: "heading-3", size: "24px", weight: "600", family: "sans", sample: "Active proposals", label: "Card title" },
  { token: "body-md", size: "15px", weight: "400", family: "sans", sample: "The proposal pipeline is on track for Q2 delivery.", label: "Body text" },
  { token: "body-sm", size: "13px", weight: "400", family: "sans", sample: "Last updated 4 minutes ago · 3 active monitors", label: "Secondary body" },
  { token: "widget-header", size: "10px", weight: "500", family: "mono", sample: "01 // WIDGET NAME", label: "Widget header — THE SIGNATURE" },
  { token: "data-label", size: "11px", weight: "500", family: "mono", sample: "STEPS · BPM · NET · LIVE", label: "Data unit label" },
  { token: "timestamp", size: "12px", weight: "400", family: "mono", sample: "2026-05-22 · 09:16:08 UTC+00:00", label: "Timestamp" },
  { token: "code-md", size: "13px", weight: "400", family: "mono", sample: "const scan = await pulse.run({ repo: 'gitwork/foundry' })", label: "Code" },
];

const familyClass: Record<string, string> = {
  sans: "font-sans",
  serif: "font-[family-name:var(--font-display)]",
  mono: "font-mono",
};

const radii = [
  { token: "xs", value: "3px", size: 40 },
  { token: "sm", value: "4px", size: 48 },
  { token: "md", value: "6px", size: 56 },
  { token: "lg", value: "10px", size: 72 },
  { token: "xl", value: "14px", size: 88 },
  { token: "full", value: "9999px", size: 40, label: "dots only" },
];

const shadows = [
  { level: "0", label: "Flat", shadow: "none", border: "1px solid #ededed", desc: "Widget cards, table rows" },
  { level: "1", label: "Subtle", shadow: "0 1px 3px rgba(0,0,0,0.06)", border: "1px solid #ededed", desc: "Hover-elevated tiles" },
  { level: "2", label: "Card", shadow: "0 4px 12px rgba(0,0,0,0.08)", border: "1px solid #ededed", desc: "Modals, dropdowns" },
  { level: "3", label: "Overlay", shadow: "0 12px 32px -4px rgba(0,0,0,0.12)", border: "none", desc: "Overlays, command palette" },
];

const sections = ["Overview", "Colors", "Typography", "Widget Cards", "Bento Demo", "Buttons", "Badges", "Forms", "Shapes", "Elevation"];

export default function DesignSystemPage() {
  const [_activeBadge, setActiveBadge] = useState<string | null>(null);
  void setActiveBadge;

  return (
    <div className="min-h-screen" style={{ background: "#FAFAF9", color: "#0F172A" }}>
      <header style={{
        position: "sticky", top: 0, zIndex: 50,
        background: "rgba(250,250,249,0.92)", backdropFilter: "blur(12px)",
        borderBottom: "1px solid rgba(0,0,0,0.08)",
        height: 52, display: "flex", alignItems: "center",
        padding: "0 32px", gap: 32,
      }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, letterSpacing: "1px", color: "#1D4ED8" }}>
          FOUNDRY / DESIGN SYSTEM
        </span>
        <nav style={{ display: "flex", gap: 4, flex: 1, overflowX: "auto" }}>
          {sections.map(s => (
            <a key={s} href={`#${s.toLowerCase().replace(/ /g, "-")}`} style={{
              fontFamily: "var(--font-sans,sans-serif)", fontSize: 12, fontWeight: 500,
              color: "#64748B", padding: "4px 10px", borderRadius: 5, whiteSpace: "nowrap",
              textDecoration: "none",
            }}>
              {s}
            </a>
          ))}
        </nav>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#94A3B8", letterSpacing: "0.6px" }}>v1.0</span>
      </header>

      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "0 32px 120px" }}>

        {/* Hero */}
        <section id="overview" style={{ padding: "72px 0 56px" }}>
          <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600, letterSpacing: "1.2px", color: "#1D4ED8", marginBottom: 16, textTransform: "uppercase" }}>
            01 // OVERVIEW
          </p>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 64, fontWeight: 400, lineHeight: 1.05, letterSpacing: "-1.5px", margin: "0 0 20px", color: "#0F172A" }}>
            Foundry <em>Design</em> System
          </h1>
          <p style={{ fontSize: 18, color: "#475569", maxWidth: 600, lineHeight: 1.6, margin: "0 0 32px" }}>
            The visual grammar of Foundry by Gitwork. Blue primary. Editorial serif figures. Monospaced widget headers. Instrument-grade geometry.
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {["Inter (UI)", "DM Serif Display (stat figures)", "JetBrains Mono (headers, data)", "Tailwind v4", "Next.js 15"].map(t => (
              <span key={t} style={{
                fontFamily: "var(--font-mono)", fontSize: 11, color: "#475569",
                border: "1px solid rgba(0,0,0,0.10)", borderRadius: 4, padding: "3px 10px",
              }}>{t}</span>
            ))}
          </div>
        </section>

        <Divider />

        {/* Colors */}
        <section id="colors" style={{ padding: "56px 0" }}>
          <SectionHeader number="02" title="COLORS" />
          <div style={{ display: "flex", flexDirection: "column", gap: 36 }}>
            {colorGroups.map(group => (
              <div key={group.label}>
                <p style={{ fontSize: 11, fontWeight: 600, color: "#94A3B8", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: 12 }}>
                  {group.label}
                </p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {group.swatches.map(sw => (
                    <div key={sw.name} style={{ width: 120 }}>
                      <div style={{
                        height: 64, borderRadius: 8, background: sw.hex,
                        border: ["#FFFFFF", "#FAFAF9", "#F5F5F4"].includes(sw.hex) ? "1px solid rgba(0,0,0,0.08)" : "none",
                        marginBottom: 8,
                      }} />
                      <p style={{ fontSize: 12, fontWeight: 600, color: "#1E293B", margin: "0 0 2px" }}>{sw.label}</p>
                      <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#94A3B8", margin: 0 }}>{sw.hex}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <Divider />

        {/* Typography */}
        <section id="typography" style={{ padding: "56px 0" }}>
          <SectionHeader number="03" title="TYPOGRAPHY" />
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {typeScale.map((t, i) => (
              <div key={t.token} style={{
                display: "grid", gridTemplateColumns: "180px 1fr 120px",
                alignItems: "center", gap: 24,
                padding: "20px 0",
                borderBottom: i < typeScale.length - 1 ? "1px solid rgba(0,0,0,0.06)" : "none",
              }}>
                <div>
                  <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#1D4ED8", letterSpacing: "0.6px", margin: "0 0 2px" }}>
                    {`{${t.token}}`}
                  </p>
                  <p style={{ fontSize: 11, color: "#94A3B8", margin: 0 }}>{t.size} / {t.weight}</p>
                </div>
                <p className={familyClass[t.family]} style={{
                  fontSize: t.size, fontWeight: parseInt(t.weight),
                  lineHeight: 1.1, margin: 0,
                  letterSpacing: parseInt(t.size) >= 44 ? "-1px" : 0,
                  color: "#0F172A",
                  fontStyle: t.token === "heading-1" ? "italic" : "normal",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {t.sample}
                </p>
                <p style={{ fontSize: 11, color: "#94A3B8", textAlign: "right" }}>{t.label}</p>
              </div>
            ))}
          </div>
        </section>

        <Divider />

        {/* Widget Cards */}
        <section id="widget-cards" style={{ padding: "56px 0" }}>
          <SectionHeader number="04" title="WIDGET CARDS — THE SIGNATURE" />
          <p style={{ fontSize: 14, color: "#64748B", marginBottom: 40, maxWidth: 560 }}>
            Every data surface opens with <code style={{ fontFamily: "var(--font-mono)", fontSize: 12, background: "#F5F5F4", padding: "1px 6px", borderRadius: 3 }}>01 // WIDGET NAME</code> in JetBrains Mono. Non-negotiable on every card.
          </p>

          <div style={{ marginBottom: 48 }}>
            <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#94A3B8", letterSpacing: "0.8px", marginBottom: 12, textTransform: "uppercase" }}>Structure</p>
            <div style={{ border: "1.5px dashed #CBD5E1", borderRadius: 10, overflow: "hidden", maxWidth: 480 }}>
              <div style={{ background: "#F5F5F4", borderBottom: "1px solid rgba(0,0,0,0.08)", height: 36, padding: "0 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 500, letterSpacing: "1.2px", color: "#475569" }}>01 // WIDGET NAME</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600, letterSpacing: "0.8px", color: "#16A34A", textTransform: "uppercase" }}>LIVE</span>
              </div>
              <div style={{ padding: 16, background: "#fff" }}>
                <p style={{ fontFamily: "var(--font-display)", fontSize: 42, margin: 0, color: "#0F172A" }}>7,842</p>
                <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "#94A3B8", letterSpacing: "0.6px", margin: "4px 0 0" }}>STEPS TODAY · GOAL 10,000</p>
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
            <WidgetCard number="01" name="SESSION" rightSlot="SATURDAY">
              <p style={{ fontFamily: "var(--font-display)", fontSize: 36, margin: "0 0 6px", lineHeight: 1, color: "#0F172A" }}>Good <em>afternoon</em>, Dan.</p>
              <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "#94A3B8", margin: 0 }}>2026-05-22 · DAY 142 OF 365</p>
            </WidgetCard>

            <WidgetCard number="02" name="PIPELINE" rightSlot={<LiveDot />}>
              <p style={{ fontFamily: "var(--font-display)", fontSize: 48, margin: "0 0 4px", lineHeight: 1, color: "#0F172A" }}>£84k</p>
              <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#94A3B8", letterSpacing: "0.6px", margin: "0 0 16px" }}>ACTIVE PROPOSAL VALUE</p>
              <div style={{ height: 4, background: "#F1F5F9", borderRadius: 999 }}>
                <div style={{ height: "100%", width: "68%", background: "#1D4ED8", borderRadius: 999 }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#94A3B8" }}>PROGRESS</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#1D4ED8", fontWeight: 600 }}>68%</span>
              </div>
            </WidgetCard>

            <WidgetCard number="03" name="PULSE CHECKS" rightSlot="4 ISSUES">
              {[
                { label: "SEO metadata", status: "pass" },
                { label: "Accessibility audit", status: "warn" },
                { label: "Core Web Vitals", status: "pass" },
                { label: "Security headers", status: "fail" },
              ].map(row => (
                <div key={row.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid rgba(0,0,0,0.05)" }}>
                  <span style={{ fontSize: 13, color: "#475569" }}>{row.label}</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600, letterSpacing: "0.4px", color: row.status === "pass" ? "#16A34A" : row.status === "warn" ? "#D97706" : "#DC2626" }}>
                    {row.status.toUpperCase()}
                  </span>
                </div>
              ))}
            </WidgetCard>

            <WidgetCard number="04" name="INBOX" rightSlot="3 UNREAD">
              {[
                { initials: "AL", name: "Alice Lim", preview: "Re: v2.1 scope — please review", time: "12m", urgent: true },
                { initials: "TK", name: "Tom Kirk", preview: "Moved our sync to Thursday", time: "45m", urgent: false },
                { initials: "JW", name: "James Wu", preview: "Invoice attached — Q2 retainer", time: "2h", urgent: false },
              ].map(row => (
                <div key={row.name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid rgba(0,0,0,0.05)" }}>
                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#EFF6FF", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "#1D4ED8" }}>{row.initials}</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "#0F172A" }}>{row.name}</span>
                      {row.urgent && <span style={{ background: "#1D4ED8", color: "#fff", fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 3, letterSpacing: "0.4px" }}>URGENT</span>}
                    </div>
                    <p style={{ fontSize: 11, color: "#94A3B8", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.preview}</p>
                  </div>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#94A3B8", flexShrink: 0 }}>{row.time}</span>
                </div>
              ))}
            </WidgetCard>

            <WidgetCard number="05" name="ACTIVE PROJECT" rightSlot="DUE FRI" dark>
              <p style={{ fontFamily: "var(--font-display)", fontSize: 28, margin: "0 0 4px", lineHeight: 1.1, color: "#F8FAFC" }}>Foundry <em>v2.1</em></p>
              <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "rgba(248,250,252,0.4)", letterSpacing: "0.6px", margin: "0 0 16px" }}>REDESIGN · WIDGETS · MOTION</p>
              <div style={{ display: "flex", gap: 12 }}>
                {["Wireframe grid", "Type + palette", "Motion"].map((t, i) => (
                  <div key={t} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <div style={{ width: 12, height: 12, borderRadius: 2, background: i < 2 ? "#3B82F6" : "transparent", border: i < 2 ? "none" : "1px solid rgba(255,255,255,0.2)" }} />
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "rgba(248,250,252,0.5)", letterSpacing: "0.4px" }}>{t}</span>
                  </div>
                ))}
              </div>
            </WidgetCard>

            <WidgetCard number="06" name="VITALS" rightSlot="LIVE">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {[
                  { label: "UPTIME", value: "99.9%", color: "#16A34A" },
                  { label: "P95 LATENCY", value: "182ms", color: "#1D4ED8" },
                  { label: "ERROR RATE", value: "0.02%", color: "#16A34A" },
                  { label: "DEPLOYS / WK", value: "7", color: "#1D4ED8" },
                ].map(v => (
                  <div key={v.label}>
                    <p style={{ fontFamily: "var(--font-display)", fontSize: 28, margin: "0 0 2px", lineHeight: 1, color: v.color }}>{v.value}</p>
                    <p style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "#94A3B8", letterSpacing: "0.6px", margin: 0 }}>{v.label}</p>
                  </div>
                ))}
              </div>
            </WidgetCard>
          </div>
        </section>

        <Divider />

        {/* Bento Demo */}
        <section id="bento-demo" style={{ padding: "56px 0" }}>
          <SectionHeader number="05" title="BENTO GRID DEMO" />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 12 }}>
            <div style={{ gridColumn: "span 4" }}>
              <WidgetCard number="01" name="OPERATOR" rightSlot="ONLINE" compact>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 44, height: 44, borderRadius: "50%", background: "linear-gradient(135deg, #1D4ED8, #3B82F6)", flexShrink: 0 }} />
                  <div>
                    <p style={{ fontFamily: "var(--font-display)", fontSize: 20, margin: 0, lineHeight: 1 }}>Dan <em>Lindsay</em></p>
                    <p style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "#94A3B8", letterSpacing: "0.5px", margin: "4px 0 0" }}>FOUNDER · GITWORK</p>
                  </div>
                </div>
              </WidgetCard>
            </div>
            <div style={{ gridColumn: "span 8" }}>
              <WidgetCard number="02" name="SESSION" rightSlot="UTC+00:00" compact>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <p style={{ fontFamily: "var(--font-display)", fontSize: 28, margin: "0 0 4px", lineHeight: 1 }}>Good <em>afternoon</em>, Dan.</p>
                    <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#94A3B8" }}>FRIDAY · 2026-05-22 · DAY 142 OF 365</p>
                  </div>
                  <p style={{ fontFamily: "var(--font-display)", fontSize: 44, margin: 0, lineHeight: 1, letterSpacing: "-2px" }}>09<span style={{ fontSize: 24, verticalAlign: "super", color: "#94A3B8" }}>:</span>16</p>
                </div>
              </WidgetCard>
            </div>
            <div style={{ gridColumn: "span 6" }}>
              <WidgetCard number="03" name="PIPELINE VALUE" rightSlot={<LiveDot />} compact>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                  <div>
                    <p style={{ fontFamily: "var(--font-display)", fontSize: 40, margin: 0, lineHeight: 1 }}>£84k</p>
                    <p style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "#94A3B8", letterSpacing: "0.6px", marginTop: 4 }}>ACTIVE · Q2 2026</p>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <p style={{ fontFamily: "var(--font-display)", fontSize: 18, margin: 0, color: "#16A34A" }}>+12%</p>
                    <p style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "#94A3B8", letterSpacing: "0.6px" }}>VS Q1</p>
                  </div>
                </div>
              </WidgetCard>
            </div>
            <div style={{ gridColumn: "span 3" }}>
              <WidgetCard number="04" name="UPTIME" rightSlot="LIVE" compact>
                <p style={{ fontFamily: "var(--font-display)", fontSize: 36, margin: 0, lineHeight: 1, color: "#16A34A" }}>99.9%</p>
                <p style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "#94A3B8", marginTop: 4, letterSpacing: "0.5px" }}>30-DAY AVG</p>
              </WidgetCard>
            </div>
            <div style={{ gridColumn: "span 3" }}>
              <WidgetCard number="05" name="CLIENTS" compact>
                <p style={{ fontFamily: "var(--font-display)", fontSize: 36, margin: 0, lineHeight: 1 }}>14</p>
                <p style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "#94A3B8", marginTop: 4, letterSpacing: "0.5px" }}>ACTIVE PORTAL</p>
              </WidgetCard>
            </div>
          </div>
        </section>

        <Divider />

        {/* Buttons */}
        <section id="buttons" style={{ padding: "56px 0" }}>
          <SectionHeader number="06" title="BUTTONS" />
          <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
            <BtnRow label="button-primary" note="Main CTA — blue background">
              <Btn variant="primary">Get started</Btn>
              <Btn variant="primary">Run scan</Btn>
              <Btn variant="primary" disabled>Disabled</Btn>
            </BtnRow>
            <BtnRow label="button-secondary" note="Outlined secondary action">
              <Btn variant="secondary">View proposal</Btn>
              <Btn variant="secondary">Export PDF</Btn>
            </BtnRow>
            <BtnRow label="button-ghost" note="Low-emphasis tertiary">
              <Btn variant="ghost">Cancel</Btn>
              <Btn variant="ghost">Dismiss</Btn>
            </BtnRow>
            <BtnRow label="button-danger" note="Destructive confirmation">
              <Btn variant="danger">Delete scan</Btn>
            </BtnRow>
            <BtnRow label="button-dark" note="Dark CTA on light marketing surfaces">
              <Btn variant="dark">Open platform</Btn>
            </BtnRow>
            <BtnRow label="icon-button" note="Square icon-only controls">
              <IconBtn>⋯</IconBtn>
              <IconBtn>↗</IconBtn>
              <IconBtn>✕</IconBtn>
              <IconBtn>+</IconBtn>
            </BtnRow>
          </div>
        </section>

        <Divider />

        {/* Badges */}
        <section id="badges" style={{ padding: "56px 0" }}>
          <SectionHeader number="07" title="BADGES & STATUS" />
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "flex-start" }}>
            <BadgeGroup label="badge-blue">
              <Badge bg="#DBEAFE" color="#1E3A8A">Active</Badge>
              <Badge bg="#DBEAFE" color="#1E3A8A">In progress</Badge>
            </BadgeGroup>
            <BadgeGroup label="badge-green">
              <Badge bg="#DCFCE7" color="#15803D">Signed off</Badge>
              <Badge bg="#DCFCE7" color="#15803D">Passing</Badge>
            </BadgeGroup>
            <BadgeGroup label="badge-amber">
              <Badge bg="#FEF3C7" color="#B45309">Needs input</Badge>
              <Badge bg="#FEF3C7" color="#B45309">Warning</Badge>
            </BadgeGroup>
            <BadgeGroup label="badge-red">
              <Badge bg="#FEE2E2" color="#B91C1C">Critical</Badge>
              <Badge bg="#FEE2E2" color="#B91C1C">Failed</Badge>
            </BadgeGroup>
            <BadgeGroup label="badge-neutral">
              <Badge bg="#F5F5F4" color="#475569" border>Draft</Badge>
              <Badge bg="#F5F5F4" color="#475569" border>Archived</Badge>
            </BadgeGroup>
          </div>
          <div style={{ marginTop: 32 }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: "#94A3B8", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: 12 }}>status-dot — full radius, 6px only</p>
            <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
              {[{ color: "#16A34A", label: "Online" }, { color: "#D97706", label: "Away" }, { color: "#DC2626", label: "Offline" }, { color: "#CBD5E1", label: "Unknown" }].map(d => (
                <div key={d.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: d.color }} />
                  <span style={{ fontSize: 12, color: "#64748B" }}>{d.label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <Divider />

        {/* Forms */}
        <section id="forms" style={{ padding: "56px 0" }}>
          <SectionHeader number="08" title="FORMS & INPUTS" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 40, maxWidth: 800 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <FormField label="Client name" placeholder="Acme Corp" />
              <FormField label="Email address" placeholder="dan@gitwork.co.uk" />
              <FormField label="Project value" placeholder="£12,000" />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div>
                <p style={{ fontSize: 13, fontWeight: 500, color: "#1E293B", margin: "0 0 6px" }}>Focused state</p>
                <input placeholder="Focus — 2px blue border" style={{ width: "100%", height: 40, background: "#fff", border: "2px solid #1D4ED8", borderRadius: 6, padding: "0 14px", fontSize: 14, fontFamily: "inherit", color: "#0F172A", outline: "3px solid #DBEAFE", boxSizing: "border-box" }} readOnly />
              </div>
              <div>
                <p style={{ fontSize: 13, fontWeight: 500, color: "#1E293B", margin: "0 0 6px" }}>Error state</p>
                <input placeholder="Invalid format" style={{ width: "100%", height: 40, background: "#fff", border: "2px solid #DC2626", borderRadius: 6, padding: "0 14px", fontSize: 14, fontFamily: "inherit", color: "#0F172A", outline: "3px solid #FEE2E2", boxSizing: "border-box" }} readOnly />
                <p style={{ fontSize: 12, color: "#DC2626", margin: "4px 0 0" }}>Please enter a valid email address.</p>
              </div>
            </div>
          </div>
        </section>

        <Divider />

        {/* Shapes */}
        <section id="shapes" style={{ padding: "56px 0" }}>
          <SectionHeader number="09" title="SHAPES & RADIUS" />
          <div style={{ display: "flex", gap: 24, alignItems: "flex-end", flexWrap: "wrap" }}>
            {radii.map(r => (
              <div key={r.token} style={{ textAlign: "center" }}>
                <div style={{ width: r.size, height: r.size, background: r.token === "full" ? "#1D4ED8" : "#EFF6FF", border: r.token === "full" ? "none" : "2px solid #1D4ED8", borderRadius: r.value, margin: "0 auto 10px" }} />
                <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#1D4ED8", margin: "0 0 2px" }}>{`{rounded.${r.token}}`}</p>
                <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#94A3B8", margin: "0 0 2px" }}>{r.value}</p>
                {r.label && <p style={{ fontSize: 10, color: "#DC2626", margin: 0 }}>{r.label}</p>}
              </div>
            ))}
          </div>
        </section>

        <Divider />

        {/* Elevation */}
        <section id="elevation" style={{ padding: "56px 0" }}>
          <SectionHeader number="10" title="ELEVATION" />
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            {shadows.map(s => (
              <div key={s.level} style={{ width: 200, padding: 20, background: "#fff", borderRadius: 10, border: s.border, boxShadow: s.shadow }}>
                <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#1D4ED8", letterSpacing: "0.6px", margin: "0 0 4px" }}>LEVEL {s.level}</p>
                <p style={{ fontSize: 14, fontWeight: 600, color: "#0F172A", margin: "0 0 4px" }}>{s.label}</p>
                <p style={{ fontSize: 12, color: "#94A3B8", margin: 0 }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <Divider />

        {/* CTA band */}
        <section style={{ borderRadius: 16, overflow: "hidden", marginTop: 40 }}>
          <div style={{ background: "linear-gradient(135deg, #1D4ED8 0%, #1E3A8A 100%)", padding: "64px 48px", textAlign: "center" }}>
            <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600, letterSpacing: "1.2px", color: "rgba(255,255,255,0.5)", marginBottom: 16, textTransform: "uppercase" }}>
              cta-banner-blue · closes every public page
            </p>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 44, fontWeight: 400, color: "#fff", margin: "0 0 16px", lineHeight: 1.1, letterSpacing: "-0.5px" }}>
              The agency platform,<br /><em>built for delivery.</em>
            </h2>
            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              <button style={{ height: 40, padding: "0 20px", background: "#fff", color: "#0F172A", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: "pointer" }}>Open platform</button>
              <button style={{ height: 40, padding: "0 20px", background: "transparent", color: "#fff", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: "pointer" }}>Book a call</button>
            </div>
          </div>
        </section>
      </main>

      <footer style={{ borderTop: "1px solid rgba(0,0,0,0.08)", background: "#F5F5F4", padding: "24px 32px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#94A3B8", letterSpacing: "0.6px" }}>FOUNDRY BY GITWORK · DESIGN SYSTEM v1.0</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#94A3B8", letterSpacing: "0.6px" }}>2026-05-22</span>
      </footer>
    </div>
  );
}

function Divider() {
  return <div style={{ height: 1, background: "rgba(0,0,0,0.07)" }} />;
}

function SectionHeader({ number, title }: { number: string; title: string }) {
  return (
    <div style={{ marginBottom: 36 }}>
      <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 500, letterSpacing: "1.2px", color: "#1D4ED8", margin: "0 0 8px", textTransform: "uppercase" }}>
        {number} // {title}
      </p>
    </div>
  );
}

function WidgetCard({ number, name, rightSlot, dark = false, compact = false, children }: {
  number: string; name: string; rightSlot?: React.ReactNode; dark?: boolean; compact?: boolean; children: React.ReactNode;
}) {
  return (
    <div style={{ borderRadius: 10, overflow: "hidden", border: dark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(0,0,0,0.08)", background: dark ? "#0F172A" : "#fff", height: "100%" }}>
      <div style={{ height: 36, padding: "0 14px", display: "flex", alignItems: "center", justifyContent: "space-between", background: dark ? "rgba(255,255,255,0.04)" : "#FAFAF9", borderBottom: dark ? "1px solid rgba(255,255,255,0.06)" : "1px solid rgba(0,0,0,0.06)", flexShrink: 0 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 500, letterSpacing: "1.2px", color: dark ? "rgba(248,250,252,0.35)" : "#94A3B8", textTransform: "uppercase" }}>
          {number} // {name}
        </span>
        {rightSlot && (
          typeof rightSlot === "string"
            ? <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600, letterSpacing: "0.8px", color: dark ? "rgba(248,250,252,0.4)" : "#94A3B8", textTransform: "uppercase" }}>{rightSlot}</span>
            : rightSlot
        )}
      </div>
      <div style={{ padding: compact ? "12px 14px" : "16px 14px" }}>{children}</div>
    </div>
  );
}

function LiveDot() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#16A34A" }} />
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600, letterSpacing: "0.8px", color: "#16A34A" }}>LIVE</span>
    </div>
  );
}

const btnStyles: Record<string, React.CSSProperties> = {
  primary: { background: "#1D4ED8", color: "#fff", border: "none" },
  secondary: { background: "transparent", color: "#0F172A", border: "1px solid rgba(0,0,0,0.14)" },
  ghost: { background: "transparent", color: "#64748B", border: "none" },
  danger: { background: "#DC2626", color: "#fff", border: "none" },
  dark: { background: "#0F172A", color: "#fff", border: "none" },
};

function Btn({ variant, children, disabled }: { variant: keyof typeof btnStyles; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button style={{ height: 40, padding: "0 18px", borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: disabled ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: disabled ? 0.45 : 1, ...btnStyles[variant] }} disabled={disabled}>
      {children}
    </button>
  );
}

function IconBtn({ children }: { children: React.ReactNode }) {
  return (
    <button style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "1px solid rgba(0,0,0,0.12)", borderRadius: 6, cursor: "pointer", fontSize: 14, color: "#475569" }}>
      {children}
    </button>
  );
}

function BtnRow({ label, note, children }: { label: string; note: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 10 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "#1D4ED8", letterSpacing: "0.4px" }}>{label}</span>
        <span style={{ fontSize: 12, color: "#94A3B8" }}>{note}</span>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{children}</div>
    </div>
  );
}

function Badge({ bg, color, border, children }: { bg: string; color: string; border?: boolean; children: React.ReactNode }) {
  return (
    <span style={{ background: bg, color, fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 4, border: border ? "1px solid rgba(0,0,0,0.08)" : "none", display: "inline-block" }}>
      {children}
    </span>
  );
}

function BadgeGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#94A3B8", letterSpacing: "0.6px", marginBottom: 8, textTransform: "uppercase" }}>{label}</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{children}</div>
    </div>
  );
}

function FormField({ label, placeholder }: { label: string; placeholder: string }) {
  return (
    <div>
      <p style={{ fontSize: 13, fontWeight: 500, color: "#1E293B", margin: "0 0 6px" }}>{label}</p>
      <input placeholder={placeholder} style={{ width: "100%", height: 40, background: "#fff", border: "1px solid rgba(0,0,0,0.14)", borderRadius: 6, padding: "0 14px", fontSize: 14, fontFamily: "inherit", color: "#0F172A", outline: "none", boxSizing: "border-box" }} />
    </div>
  );
}
