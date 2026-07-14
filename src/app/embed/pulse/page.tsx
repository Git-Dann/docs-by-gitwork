"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Script from "next/script";

// ── Types (mirror PublicScanView from /api/public/pulse/scan/[id]) ─────────────
type Check = {
  category: string;
  checkKey: string;
  label: string;
  status: "PASS" | "WARN" | "FAIL" | "SKIPPED";
  detail?: string | null;
};
type View = {
  id: string;
  status: "RUNNING" | "COMPLETED" | "FAILED";
  targetUrl: string;
  healthScore: number | null;
  techStack: string[];
  totalChecks: number;
  pass: number;
  warn: number;
  fail: number;
  categories: { category: string; pass: number; warn: number; fail: number }[];
  emailCaptured: boolean;
  checks: Check[] | null;
  errorMessage: string | null;
};

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: { sitekey: string; callback: (token: string) => void; "expired-callback"?: () => void },
      ) => string;
    };
  }
}

const ACCENT = "#6B52FF"; // Gitwork purple
const NAVY_GRADIENT = "linear-gradient(160deg, #17172a 0%, #0C0C18 100%)";
const SERIF = "var(--font-fraunces), 'Fraunces', Georgia, serif";
// Fallback only — used for the brief window before /api/public/pulse/config resolves.
// Mirrors DEFAULT_BOOKING_URL in src/server/pulse-embed-config.ts (can't import a
// server module from this client component).
const FALLBACK_BOOKING_URL = "https://calendar.google.com/calendar/appointments/schedules/AcZssZ3uLzvxU1kbocUtjtGtYTTLqKuGCCjnvHAM1dLRJsbMhvYjOdaamfywtrHEHQxqEQTZ_YbNLGEf?gv=true";

function scoreColor(score: number | null): string {
  if (score == null) return "#9ca3af";
  if (score >= 75) return "#16a34a";
  if (score >= 50) return "#d97706";
  return "#dc2626";
}

function ScoreRing({ score }: { score: number | null }) {
  const r = 58;
  const c = 2 * Math.PI * r;
  const pct = score == null ? 0 : Math.max(0, Math.min(100, score)) / 100;
  const color = scoreColor(score);
  return (
    <div style={{ position: "relative", width: 148, height: 148, filter: `drop-shadow(0 6px 16px ${color}33)` }}>
      <svg width={148} height={148} viewBox="0 0 148 148">
        <circle cx={74} cy={74} r={r} fill="none" stroke="#eef0f4" strokeWidth={11} />
        <circle
          cx={74}
          cy={74}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={11}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          transform="rotate(-90 74 74)"
          style={{ transition: "stroke-dashoffset 700ms ease, stroke 300ms ease" }}
        />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontFamily: SERIF, fontSize: 38, fontWeight: 400, color, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
          {score ?? "—"}
        </span>
        <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: 1, color: "#9ca3af", marginTop: 2 }}>/ 100</span>
      </div>
    </div>
  );
}

function CategoryTile({ cat }: { cat: { category: string; pass: number; warn: number; fail: number } }) {
  const total = cat.pass + cat.warn + cat.fail;
  const s = total > 0 ? Math.round(((cat.pass + cat.warn * 0.5) / total) * 100) : 100;
  const tone = s >= 75 ? "#16a34a" : s >= 50 ? "#d97706" : "#dc2626";
  return (
    <div style={{ display: "flex", background: "#ffffff", border: "1px solid #eceef2", borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 2px rgba(15,23,42,0.04)" }}>
      <div style={{ width: 4, background: tone, flexShrink: 0 }} />
      <div style={{ flex: 1, padding: "10px 12px" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: "#374151" }}>{cat.category}</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: tone, fontVariantNumeric: "tabular-nums" }}>{s}%</span>
        </div>
        <div style={{ background: "#eef0f4", borderRadius: 4, height: 4, marginBottom: 6, overflow: "hidden" }}>
          <div style={{ height: "100%", borderRadius: 4, background: tone, width: `${s}%`, transition: "width 600ms ease" }} />
        </div>
        <div style={{ display: "flex", gap: 8, fontSize: 10.5, fontWeight: 600, color: "#9ca3af" }}>
          {cat.pass > 0 && <span style={{ color: "#16a34a" }}>{cat.pass} pass</span>}
          {cat.warn > 0 && <span style={{ color: "#d97706" }}>{cat.warn} warn</span>}
          {cat.fail > 0 && <span style={{ color: "#dc2626" }}>{cat.fail} fail</span>}
        </div>
      </div>
    </div>
  );
}

/** Off-screen honeypot input — real visitors never see or fill it; naive bots that
 * fill every field will, and the server rejects the request when it's non-empty. */
function Honeypot({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="text"
      name="company"
      tabIndex={-1}
      autoComplete="off"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{ position: "absolute", left: -9999, width: 1, height: 1, opacity: 0 }}
      aria-hidden="true"
    />
  );
}

export default function EmbedPulsePage() {
  const [url, setUrl] = useState("");
  const [email, setEmail] = useState("");
  const [scanId, setScanId] = useState<string | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [emailAlreadyUsed, setEmailAlreadyUsed] = useState(false);
  const [displayScore, setDisplayScore] = useState<number | null>(null);

  const [honeypot, setHoneypot] = useState("");
  const [turnstileReady, setTurnstileReady] = useState(false);
  const [scanToken, setScanToken] = useState<string | null>(null);
  const scanTurnstileRef = useRef<HTMLDivElement>(null);

  const [source, setSource] = useState<"gitwork.co.uk" | "foundry-demo">("foundry-demo");
  const [remoteConfig, setRemoteConfig] = useState<{ turnstileSiteKey: string | null; bookingUrl: string } | null>(null);
  const turnstileSiteKey = remoteConfig?.turnstileSiteKey ?? null;
  const bookingUrl = remoteConfig?.bookingUrl ?? FALLBACK_BOOKING_URL;

  const rootRef = useRef<HTMLDivElement>(null);

  // Which site referred this embed — attributes leads to a placement in the Foundry
  // leads dashboard. Same-origin (e.g. /pulse-overview's self-embed) or no referrer
  // falls back to "foundry-demo".
  useEffect(() => {
    try {
      const ref = document.referrer;
      if (ref && /(^|\.)gitwork\.co\.uk$/.test(new URL(ref).hostname)) setSource("gitwork.co.uk");
    } catch { /* not embedded / no referrer */ }
  }, []);

  // Workspace-configurable Turnstile site key + CTA link — fetched once, not baked
  // in at build time, since they're editable from Settings → Public Embed.
  useEffect(() => {
    fetch("/api/public/pulse/config")
      .then((r) => r.json())
      .then((d) => setRemoteConfig({ turnstileSiteKey: d.turnstileSiteKey ?? null, bookingUrl: d.bookingUrl ?? FALLBACK_BOOKING_URL }))
      .catch(() => {});
  }, []);

  // Auto-resize the host iframe as content grows/shrinks.
  useEffect(() => {
    const send = () => {
      try {
        window.parent?.postMessage(
          { type: "pulse-embed-height", height: Math.ceil(document.documentElement.scrollHeight) },
          "*",
        );
      } catch { /* not embedded */ }
    };
    send();
    const ro = new ResizeObserver(send);
    if (rootRef.current) ro.observe(rootRef.current);
    return () => ro.disconnect();
  });

  // Render the Turnstile widget once the script has loaded, guarding against
  // double-render with a hasChildNodes() check.
  useEffect(() => {
    if (!turnstileReady || !turnstileSiteKey || !window.turnstile) return;
    if (scanTurnstileRef.current && !scanTurnstileRef.current.hasChildNodes()) {
      window.turnstile.render(scanTurnstileRef.current, { sitekey: turnstileSiteKey, callback: setScanToken });
    }
  }, [turnstileReady, turnstileSiteKey]);

  // Poll while a scan is running.
  useEffect(() => {
    if (!scanId) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      try {
        const res = await fetch(`/api/public/pulse/scan/${scanId}`, { cache: "no-store" });
        const data = (await res.json()) as View;
        if (!active) return;
        if (res.ok) {
          setView(data);
          if (data.status === "RUNNING") timer = setTimeout(poll, 1500);
        } else {
          timer = setTimeout(poll, 2500);
        }
      } catch {
        if (active) timer = setTimeout(poll, 2500);
      }
    };
    poll();
    return () => { active = false; clearTimeout(timer); };
  }, [scanId]);

  // Animate score count-up when it first arrives.
  useEffect(() => {
    if (view?.healthScore == null) { setDisplayScore(null); return; }
    const target = view.healthScore;
    if (displayScore === target) return;
    if (displayScore === null) {
      let current = 0;
      const step = Math.ceil(target / 30);
      const tick = () => {
        current = Math.min(current + step, target);
        setDisplayScore(current);
        if (current < target) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    } else {
      setDisplayScore(target);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view?.healthScore]);

  // Email is required up front — one combined submission starts the scan and
  // captures the lead in the same call (see POST /api/public/pulse/scan).
  const startScan = useCallback(async () => {
    if (!url.trim() || !email.trim() || starting) return;
    setStarting(true);
    setError(null);
    setEmailAlreadyUsed(false);
    setView(null);
    setScanId(null);
    try {
      const res = await fetch("/api/public/pulse/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), email: email.trim(), honeypot, turnstileToken: scanToken, source }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409) { setEmailAlreadyUsed(true); return; }
        throw new Error(data?.error ?? "Couldn't start the scan.");
      }
      setScanId(data.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setStarting(false);
    }
  }, [url, email, starting, honeypot, scanToken, source]);

  const running = view?.status === "RUNNING" || (scanId !== null && !view);
  const done = view?.status === "COMPLETED";
  const failedScan = view?.status === "FAILED";

  // Don't let a click through before Turnstile has actually produced a token —
  // submitting without one always fails server-side ("Verification failed"),
  // which reads as a broken form rather than "still checking you're human".
  const awaitingVerification = Boolean(turnstileSiteKey) && !scanToken;

  // Findings are visible as soon as they're discovered — email was already
  // required to start the scan, so there's no separate "unlock" gate anymore.
  const findings = (view?.checks ?? [])
    .filter((c) => c.status === "FAIL" || c.status === "WARN")
    .sort((a, b) => (a.status === "FAIL" ? 0 : 1) - (b.status === "FAIL" ? 0 : 1));

  const formDisabled = running || starting;
  const submitDisabled = formDisabled || !url.trim() || !email.trim() || awaitingVerification;

  return (
    <div
      ref={rootRef}
      style={{
        fontFamily: "var(--font-sans), ui-sans-serif, system-ui, sans-serif",
        color: "#111827",
        background: "#ffffff",
        padding: "28px 20px",
        maxWidth: 640,
        margin: "0 auto",
      }}
    >
      {turnstileSiteKey && (
        <Script
          src="https://challenges.cloudflare.com/turnstile/v0/api.js"
          strategy="afterInteractive"
          onLoad={() => setTurnstileReady(true)}
        />
      )}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: ACCENT, textTransform: "uppercase" }}>
          Pulse
        </span>
      </div>

      <h1 style={{ fontFamily: SERIF, fontSize: 26, fontWeight: 700, margin: "0 0 6px", lineHeight: 1.2 }}>
        Free site health check
      </h1>
      <p style={{ fontSize: 14, color: "#6b7280", margin: "0 0 18px" }}>
        A quick check across performance, SEO, security & mobile — in seconds.
      </p>

      {/* Form — URL, then email directly underneath. Both required to run a scan. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <input
          type="url"
          inputMode="url"
          placeholder="yourwebsite.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") startScan(); }}
          disabled={formDisabled}
          style={{
            padding: "12px 14px",
            border: "1px solid #d1d5db",
            borderRadius: 10,
            fontSize: 15,
            outline: "none",
          }}
        />
        <input
          type="email"
          inputMode="email"
          placeholder="you@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") startScan(); }}
          disabled={formDisabled}
          style={{
            padding: "12px 14px",
            border: "1px solid #d1d5db",
            borderRadius: 10,
            fontSize: 15,
            outline: "none",
          }}
        />
        <Honeypot value={honeypot} onChange={setHoneypot} />
        <button
          onClick={startScan}
          disabled={submitDisabled}
          style={{
            padding: "13px 20px",
            borderRadius: 10,
            border: "none",
            background: submitDisabled ? "#a5b4fc" : ACCENT,
            color: "white",
            fontSize: 15,
            fontWeight: 700,
            cursor: submitDisabled ? "default" : "pointer",
          }}
        >
          {running ? "Scanning…" : starting ? "Starting…" : awaitingVerification ? "Verifying…" : "Scan my site"}
        </button>
      </div>
      {turnstileSiteKey && <div ref={scanTurnstileRef} style={{ marginTop: 10 }} />}
      <p style={{ marginTop: 8, fontSize: 11.5, color: "#9ca3af" }}>
        We&apos;ll email you the full results too — no spam, just your report.
      </p>

      {error && (
        <p style={{ marginTop: 12, fontSize: 13, color: "#dc2626" }}>{error}</p>
      )}

      {/* Already claimed their free scan with this email */}
      {emailAlreadyUsed && (
        <div style={{ marginTop: 22, border: "1px solid #eceef2", borderRadius: 12, padding: 18, background: "#f9fafb" }}>
          <p style={{ fontSize: 15, fontWeight: 700, margin: "0 0 4px" }}>
            You&apos;ve already used your free scan.
          </p>
          <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 12px" }}>
            Each email gets one free unlock. Want the full picture for this site too?
          </p>
          <a
            href={bookingUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: "inline-block", background: ACCENT, color: "white", fontSize: 14, fontWeight: 700, padding: "11px 18px", borderRadius: 10, textDecoration: "none" }}
          >
            Book a call →
          </a>
        </div>
      )}

      {/* Results — updates live as the scan runs */}
      {(running || done || failedScan) && view && (
        <div style={{ marginTop: 24 }}>
          {failedScan ? (
            <p style={{ fontSize: 14, color: "#dc2626" }}>
              {view.errorMessage ?? "We couldn't complete the scan for that URL."}
            </p>
          ) : (
            <>
              {/* Score + stat strip — centered column */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
                <ScoreRing score={displayScore} />
                <p style={{ fontSize: 13, color: "#6b7280", margin: "14px 0 8px", wordBreak: "break-all" }}>
                  {view.targetUrl}
                </p>
                <div style={{ display: "flex", justifyContent: "center", gap: 14, fontSize: 14, fontWeight: 700, flexWrap: "wrap" }}>
                  <span style={{ color: "#16a34a" }}>✓ {view.pass}</span>
                  <span style={{ color: "#d97706" }}>! {view.warn}</span>
                  <span style={{ color: "#dc2626" }}>✕ {view.fail}</span>
                  <span style={{ color: "#9ca3af", fontWeight: 500 }}>{view.totalChecks} checks</span>
                </div>
                {running && (
                  <p style={{ fontSize: 12, color: ACCENT, marginTop: 8 }}>
                    Running checks live… {view.totalChecks} done
                  </p>
                )}
              </div>

              {/* Category tiles (fill in live) */}
              {view.categories.length > 0 && (
                <div
                  style={{
                    marginTop: 18,
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
                    gap: 10,
                  }}
                >
                  {view.categories.map((cat) => (
                    <CategoryTile key={cat.category} cat={cat} />
                  ))}
                </div>
              )}

              {/* Findings — appear as they're discovered */}
              {findings.length > 0 && (
                <div style={{ marginTop: 22 }}>
                  <p style={{ fontSize: 14, fontWeight: 700, margin: "0 0 10px" }}>
                    {`What to fix (${findings.length})`}
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {findings.slice(0, 5).map((f) => (
                      <div key={f.checkKey} style={{ display: "flex", gap: 10, padding: "10px 12px", border: `1px solid ${f.status === "FAIL" ? "#fecaca" : "#fde68a"}`, borderRadius: 10, background: f.status === "FAIL" ? "#fef2f2" : "#fffbeb" }}>
                        <span style={{ color: f.status === "FAIL" ? "#dc2626" : "#d97706", fontWeight: 800, fontSize: 16, lineHeight: 1 }}>
                          {f.status === "FAIL" ? "✕" : "!"}
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{f.label}</div>
                          {f.detail && <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{f.detail}</div>}
                        </div>
                      </div>
                    ))}
                    {findings.length > 5 && (
                      <p style={{ fontSize: 12, color: "#6b7280", textAlign: "center", margin: 0 }}>
                        +{findings.length - 5} more issues — book a call to get them all fixed.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* CTA */}
              {done && (
                <div style={{ marginTop: 22, textAlign: "center", background: NAVY_GRADIENT, borderRadius: 12, padding: 20 }}>
                  <p style={{ fontFamily: SERIF, fontSize: 16, fontWeight: 700, color: "white", margin: "0 0 4px" }}>
                    {view.fail > 0
                      ? `${view.fail} failing check${view.fail === 1 ? "" : "s"}. We can fix them.`
                      : "Ready to take this further?"}
                  </p>
                  <p style={{ fontSize: 13, color: "#9ca3af", margin: "0 0 14px" }}>
                    Gitwork builds and ships products — from fast fixes to full-stack delivery.
                  </p>
                  <a
                    href={bookingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ display: "inline-block", background: "white", color: "#111827", fontSize: 14, fontWeight: 700, padding: "10px 22px", borderRadius: 10, textDecoration: "none" }}
                  >
                    Book a call →
                  </a>
                </div>
              )}
            </>
          )}
        </div>
      )}

      <p style={{ marginTop: 20, fontSize: 11, color: "#9ca3af", textAlign: "center" }}>
        Powered by <span style={{ color: "#6b7280", fontWeight: 600 }}>Gitwork Foundry</span>
      </p>
    </div>
  );
}
