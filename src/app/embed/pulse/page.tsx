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
  const r = 52;
  const c = 2 * Math.PI * r;
  const pct = score == null ? 0 : Math.max(0, Math.min(100, score)) / 100;
  const color = scoreColor(score);
  return (
    <div style={{ position: "relative", width: 128, height: 128 }}>
      <svg width={128} height={128} viewBox="0 0 128 128">
        <circle cx={64} cy={64} r={r} fill="none" stroke="#e5e7eb" strokeWidth={10} />
        <circle
          cx={64}
          cy={64}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={10}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          transform="rotate(-90 64 64)"
          style={{ transition: "stroke-dashoffset 600ms ease, stroke 300ms ease" }}
        />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: 30, fontWeight: 800, color, fontVariantNumeric: "tabular-nums" }}>
          {score ?? "—"}
        </span>
        <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: 1, color: "#9ca3af" }}>/ 100</span>
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
  const [scanId, setScanId] = useState<string | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const [email, setEmail] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [displayScore, setDisplayScore] = useState<number | null>(null);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [emailAlreadyUsed, setEmailAlreadyUsed] = useState(false);

  const [scanHoneypot, setScanHoneypot] = useState("");
  const [unlockHoneypot, setUnlockHoneypot] = useState("");
  const [turnstileReady, setTurnstileReady] = useState(false);
  const [scanToken, setScanToken] = useState<string | null>(null);
  const [unlockToken, setUnlockToken] = useState<string | null>(null);
  const scanTurnstileRef = useRef<HTMLDivElement>(null);
  const unlockTurnstileRef = useRef<HTMLDivElement>(null);

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

  // Render the Turnstile widgets once the script has loaded. Re-runs as the DOM
  // changes (e.g. the unlock form's container only exists once a scan completes),
  // guarding against double-render with a hasChildNodes() check.
  useEffect(() => {
    if (!turnstileReady || !turnstileSiteKey || !window.turnstile) return;
    if (scanTurnstileRef.current && !scanTurnstileRef.current.hasChildNodes()) {
      window.turnstile.render(scanTurnstileRef.current, { sitekey: turnstileSiteKey, callback: setScanToken });
    }
    if (unlockTurnstileRef.current && !unlockTurnstileRef.current.hasChildNodes()) {
      window.turnstile.render(unlockTurnstileRef.current, { sitekey: turnstileSiteKey, callback: setUnlockToken });
    }
    // Re-check whenever the conditionally-rendered containers might have (dis)appeared.
  }, [turnstileReady, turnstileSiteKey, view?.status, view?.emailCaptured, emailAlreadyUsed]);

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

  const startScan = useCallback(async () => {
    if (!url.trim() || starting) return;
    setStarting(true);
    setError(null);
    setView(null);
    setScanId(null);
    try {
      const res = await fetch("/api/public/pulse/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), honeypot: scanHoneypot, turnstileToken: scanToken }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Couldn't start the scan.");
      setScanId(data.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setStarting(false);
    }
  }, [url, starting, scanHoneypot, scanToken]);

  const unlock = useCallback(async () => {
    if (!scanId || unlocking) return;
    setUnlocking(true);
    setUnlockError(null);
    setEmailAlreadyUsed(false);
    try {
      const res = await fetch(`/api/public/pulse/scan/${scanId}/unlock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), honeypot: unlockHoneypot, turnstileToken: unlockToken, source }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409) { setEmailAlreadyUsed(true); return; }
        throw new Error(data?.error ?? "Couldn't verify that email.");
      }
      // Re-fetch to pull the now-unlocked detail.
      const refreshed = await fetch(`/api/public/pulse/scan/${scanId}`, { cache: "no-store" });
      if (refreshed.ok) setView((await refreshed.json()) as View);
    } catch (e) {
      setUnlockError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setUnlocking(false);
    }
  }, [scanId, email, unlocking, unlockHoneypot, unlockToken, source]);

  const running = view?.status === "RUNNING" || (scanId !== null && !view);
  const done = view?.status === "COMPLETED";
  const failedScan = view?.status === "FAILED";
  const issues = view ? view.warn + view.fail : 0;

  // When Turnstile is configured, don't let a click through before it's actually
  // produced a token — submitting without one always fails server-side ("Verification
  // failed"), which reads as a broken form rather than "still checking you're human".
  const awaitingScanVerification = Boolean(turnstileSiteKey) && !scanToken;
  const awaitingUnlockVerification = Boolean(turnstileSiteKey) && !unlockToken;

  const findings = (view?.checks ?? [])
    .filter((c) => c.status === "FAIL" || c.status === "WARN")
    .sort((a, b) => (a.status === "FAIL" ? 0 : 1) - (b.status === "FAIL" ? 0 : 1));

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
        A quick check across performance, SEO, security & mobile — in seconds. No signup to see your score.
      </p>

      {/* Input */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          type="url"
          inputMode="url"
          placeholder="yourwebsite.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") startScan(); }}
          disabled={running || starting}
          style={{
            flex: "1 1 240px",
            padding: "12px 14px",
            border: "1px solid #d1d5db",
            borderRadius: 10,
            fontSize: 15,
            outline: "none",
          }}
        />
        <Honeypot value={scanHoneypot} onChange={setScanHoneypot} />
        <button
          onClick={startScan}
          disabled={running || starting || !url.trim() || awaitingScanVerification}
          style={{
            padding: "12px 20px",
            borderRadius: 10,
            border: "none",
            background: running || starting || !url.trim() || awaitingScanVerification ? "#a5b4fc" : ACCENT,
            color: "white",
            fontSize: 15,
            fontWeight: 700,
            cursor: running || starting || !url.trim() || awaitingScanVerification ? "default" : "pointer",
          }}
        >
          {running ? "Scanning…" : starting ? "Starting…" : awaitingScanVerification ? "Verifying…" : "Scan my site"}
        </button>
      </div>
      {turnstileSiteKey && <div ref={scanTurnstileRef} style={{ marginTop: 10 }} />}

      {error && (
        <p style={{ marginTop: 12, fontSize: 13, color: "#dc2626" }}>{error}</p>
      )}

      {/* Results */}
      {(running || done || failedScan) && view && (
        <div style={{ marginTop: 24 }}>
          {failedScan ? (
            <p style={{ fontSize: 14, color: "#dc2626" }}>
              {view.errorMessage ?? "We couldn't complete the scan for that URL."}
            </p>
          ) : (
            <>
              {/* Score + stat strip */}
              <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
                <ScoreRing score={displayScore} />
                <div style={{ flex: "1 1 200px" }}>
                  <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 8px", wordBreak: "break-all" }}>
                    {view.targetUrl}
                  </p>
                  <div style={{ display: "flex", gap: 14, fontSize: 14, fontWeight: 700 }}>
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
              </div>

              {/* Category tiles (fill in live) */}
              {view.categories.length > 0 && (
                <div
                  style={{
                    marginTop: 18,
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
                    gap: 8,
                  }}
                >
                  {view.categories.map((cat) => {
                    const total = cat.pass + cat.warn + cat.fail;
                    const s = total > 0 ? Math.round(((cat.pass + cat.warn * 0.5) / total) * 100) : 100;
                    const barColor = s >= 75 ? "#16a34a" : s >= 50 ? "#d97706" : "#dc2626";
                    const bg = s >= 75 ? "#f0fdf4" : s >= 50 ? "#fffbeb" : "#fef2f2";
                    const bd = s >= 75 ? "#bbf7d0" : s >= 50 ? "#fde68a" : "#fecaca";
                    return (
                      <div key={cat.category} style={{ border: `1px solid ${bd}`, background: bg, borderRadius: 10, padding: "8px 10px" }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6 }}>{cat.category}</div>
                        <div style={{ background: "#e5e7eb", borderRadius: 4, height: 4, marginBottom: 6, overflow: "hidden" }}>
                          <div style={{
                            height: "100%",
                            borderRadius: 4,
                            background: barColor,
                            width: `${s}%`,
                            transition: "width 600ms ease",
                          }} />
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div style={{ display: "flex", gap: 6, fontSize: 11, fontWeight: 700 }}>
                            {cat.pass > 0 && <span style={{ color: "#16a34a" }}>{cat.pass}P</span>}
                            {cat.warn > 0 && <span style={{ color: "#d97706" }}>{cat.warn}W</span>}
                            {cat.fail > 0 && <span style={{ color: "#dc2626" }}>{cat.fail}F</span>}
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 700, color: barColor }}>{s}%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Already claimed their free scan with this email */}
              {done && !view.emailCaptured && emailAlreadyUsed && (
                <div style={{ marginTop: 22, border: "1px solid #e5e7eb", borderRadius: 12, padding: 18, background: "#f9fafb" }}>
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

              {/* Email gate (detail locked) */}
              {done && !view.emailCaptured && !emailAlreadyUsed && (
                <div style={{ marginTop: 22, border: "1px solid #e5e7eb", borderRadius: 12, padding: 18, background: "#f9fafb" }}>
                  <p style={{ fontSize: 15, fontWeight: 700, margin: "0 0 4px" }}>
                    {view.fail > 0
                      ? `${view.fail} check${view.fail === 1 ? "" : "s"} failing — here's what to fix.`
                      : `${issues} thing${issues === 1 ? "" : "s"} to improve before you launch.`}
                  </p>
                  <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 12px" }}>
                    Drop your email to unlock the full breakdown — exactly what&apos;s broken, why it matters, and how to fix it.
                  </p>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <input
                      type="email"
                      inputMode="email"
                      placeholder="you@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") unlock(); }}
                      style={{ flex: "1 1 220px", padding: "11px 13px", border: "1px solid #d1d5db", borderRadius: 10, fontSize: 14, outline: "none" }}
                    />
                    <Honeypot value={unlockHoneypot} onChange={setUnlockHoneypot} />
                    <button
                      onClick={unlock}
                      disabled={unlocking || !email.trim() || awaitingUnlockVerification}
                      style={{
                        padding: "11px 18px",
                        borderRadius: 10,
                        border: "none",
                        background: unlocking || !email.trim() || awaitingUnlockVerification ? "#a5b4fc" : ACCENT,
                        color: "white",
                        fontSize: 14,
                        fontWeight: 700,
                        cursor: unlocking || !email.trim() || awaitingUnlockVerification ? "default" : "pointer",
                      }}
                    >
                      {unlocking ? "Unlocking…" : awaitingUnlockVerification ? "Verifying…" : "Show me the issues"}
                    </button>
                  </div>
                  {turnstileSiteKey && <div ref={unlockTurnstileRef} style={{ marginTop: 10 }} />}
                  {unlockError && <p style={{ marginTop: 8, fontSize: 13, color: "#dc2626" }}>{unlockError}</p>}
                </div>
              )}

              {/* Unlocked findings */}
              {done && view.emailCaptured && findings.length > 0 && (
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
