"use client";

import { useEffect, useRef } from "react";

// Colours/fonts sampled live from gitwork.co.uk (Aug 2026) — not guessed. Cream
// background, near-black ink, and the site's own `--signal` purple; logo face
// is Playfair Display, headline face is Fraunces, both already loaded via
// next/font in the root layout as --font-playfair / --font-fraunces.
const CREAM = "#F6F4EE";
const INK = "#0B0C0F";
const ACCENT = "#4F46E5";
const SANS = "var(--font-sans), Inter, -apple-system, system-ui, sans-serif";
const SERIF = "var(--font-fraunces), Fraunces, Georgia, serif";
const LOGO_SERIF = "var(--font-playfair), 'Playfair Display', Georgia, serif";

function NavLink({ children }: { children: React.ReactNode }) {
  return <span style={{ fontSize: 15, color: INK, whiteSpace: "nowrap" }}>{children}</span>;
}

// Matches gitwork.co.uk's own real breakpoint (verified live, Aug 2026): the
// text nav + "Book a call" collapse into a static hamburger below ~640px
// (this repo's own `sm`, per docs/mobile-playbook.md), keeping only the logo
// and the Portal pill — the same two elements the real site keeps. The
// hamburger is decorative (this page is inert by design), not a working menu.
const HEADER_STYLE = `
  .faux-gw-links { display: flex; align-items: center; gap: clamp(14px, 2vw, 28px); flex-wrap: nowrap; }
  .faux-gw-cta { display: inline-flex; }
  .faux-gw-hamburger { display: none; }
  @media (max-width: 640px) {
    .faux-gw-links { display: none; }
    .faux-gw-cta { display: none; }
    .faux-gw-hamburger { display: inline-flex; }
  }
`;

/**
 * Not a real page — a static mockup of gitwork.co.uk's own header and hero
 * grammar, with the Pulse embed (?example=1 — see src/app/embed/pulse/page.tsx)
 * dropped in as it would actually sit on the real site. Exists purely so the
 * widget can be judged in its real hosting context rather than in isolation on
 * white. Reached only from Settings → Public Embed → "View example"; inert by
 * design (nav links don't go anywhere) — see the marketing-pages removal note
 * in CLAUDE.md §4 for why gitwork.co.uk itself isn't rebuilt here for real.
 */
export default function PulseEmbedFauxGitworkPage() {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Mirrors embed.js's own resize protocol (including the origin+source check
  // fixed in the Aug 2026 embed audit — see src/__tests__/embed-js-resize.test.ts)
  // rather than loading the real embed.js loader, which hardcodes a bare
  // /embed/pulse src with no room for the ?example=1 query string.
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      const iframe = iframeRef.current;
      if (!iframe || e.origin !== window.location.origin || e.source !== iframe.contentWindow) return;
      const data = e.data as { type?: string; height?: number } | null;
      if (data?.type === "pulse-embed-height" && typeof data.height === "number") {
        iframe.style.height = `${data.height}px`;
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: CREAM, fontFamily: SANS, color: INK }}>
      <style>{HEADER_STYLE}</style>
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          padding: "16px clamp(16px, 4vw, 28px)",
          background: "rgba(246,244,238,0.85)",
          backdropFilter: "blur(6px)",
          borderBottom: "1px solid rgba(11,12,15,0.08)",
        }}
      >
        <span style={{ fontFamily: LOGO_SERIF, fontWeight: 700, fontSize: 26, letterSpacing: "-0.02em", display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
          Gitwork<span style={{ color: ACCENT }}>.</span>
        </span>
        <nav style={{ display: "flex", alignItems: "center", gap: 16, minWidth: 0 }}>
          <div className="faux-gw-links">
            <NavLink>Services</NavLink>
            <NavLink>How we work</NavLink>
            <NavLink>Work</NavLink>
            <NavLink>FAQ</NavLink>
          </div>
          <span style={{ fontSize: 14, padding: "8px 16px", borderRadius: 999, border: "1px solid rgba(11,12,15,0.18)", whiteSpace: "nowrap", flexShrink: 0 }}>
            Portal
          </span>
          <span
            className="faux-gw-cta"
            style={{ fontSize: 14, fontWeight: 700, padding: "10px 18px", borderRadius: 999, background: INK, color: CREAM, whiteSpace: "nowrap", flexShrink: 0, alignItems: "center" }}
          >
            Book a call →
          </span>
          <span
            className="faux-gw-hamburger"
            aria-hidden="true"
            style={{ fontSize: 20, lineHeight: 1, color: INK, flexShrink: 0, alignItems: "center" }}
          >
            ☰
          </span>
        </nav>
      </header>

      <main style={{ maxWidth: 720, margin: "0 auto", padding: "clamp(40px, 8vw, 64px) 24px 96px" }}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            fontSize: 13,
            fontWeight: 600,
            color: ACCENT,
            background: "rgba(79,70,229,0.12)",
            borderRadius: 999,
            padding: "6px 14px",
            marginBottom: 20,
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: ACCENT }} />
          Free tool
        </span>

        <h1 style={{ fontFamily: SERIF, fontSize: "clamp(28px, 6vw, 40px)", lineHeight: 1.15, margin: "0 0 14px", fontWeight: 700 }}>
          How healthy is your <span style={{ color: ACCENT }}>build?</span>
        </h1>
        <p style={{ fontSize: 16, color: "rgba(11,12,15,0.65)", margin: "0 0 40px", maxWidth: 480 }}>
          Run Gitwork Pulse for a free read on performance, SEO, security and mobile —
          the same checks we run before we take on a build.
        </p>

        <div
          style={{
            background: "#ffffff",
            borderRadius: 20,
            border: "1px solid rgba(11,12,15,0.08)",
            boxShadow: "0 20px 40px -20px rgba(11,12,15,0.15)",
            overflow: "hidden",
          }}
        >
          <iframe
            ref={iframeRef}
            src="/embed/pulse?example=1"
            title="Gitwork Pulse — free site health check"
            style={{ width: "100%", minHeight: 460, border: 0, display: "block" }}
          />
        </div>
      </main>
    </div>
  );
}
