"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Script from "next/script";
import { DEFAULT_BOOKING_URL, isPulseScanSource, type PulseScanSource } from "@/server/pulse-embed-config";

/**
 * The public scanner — one implementation, rendered at two entry points.
 *
 *   variant="embed"  →  /embed/pulse, the iframe THIRD PARTIES embed. Self-contained:
 *                       its own card, its own "Pulse / Free site health check" header,
 *                       a "Powered by Gitwork Foundry" credit, and the postMessage
 *                       auto-resize the host page listens for.
 *
 *   variant="page"   →  /production-ready, a first-class section of a Gitwork page.
 *                       No card, no header, no credit, no postMessage: the page around
 *                       it already does all four, and iframing our own site to get them
 *                       twice is what made that page look broken.
 *
 * ⚠️ /embed/pulse is an EXTERNAL CONTRACT (allow-listed for gitwork.co.uk in
 * next.config.ts, and the only route exempt from the baseline security headers). The
 * embed variant must keep rendering exactly what it rendered before this split — which
 * is what __tests__/variant-chrome.test.tsx pins, in both directions.
 *
 * ⚠️ `checkCountLabel` is a PROP, not an import. src/server/checks-registry.ts is 135KB
 * of check definitions; importing it here to render one number would ship all of it to
 * every visitor. The server component that renders this reads it instead.
 */
export type PublicScannerVariant = "embed" | "page";

type PublicScannerProps = {
  variant?: PublicScannerVariant;
  /**
   * Attribution for the door this scan came through, when the caller already knows it.
   * Supplying it SKIPS referrer sniffing entirely — a page that frames nothing has no
   * referrer to read, and guessing where a known visitor came from is how leads get
   * filed against the wrong placement.
   */
  defaultSource?: PulseScanSource;
  /** e.g. "over 1,600" — from ADVERTISED_CHECK_COUNT_LABEL, read server-side. */
  checkCountLabel: string;
};

// ── Types (mirror PublicScanView from /api/public/pulse/scan/[id]) ─────────────
type Check = {
  category: string;
  checkKey: string;
  label: string;
  // The full PulseCheckStatus union. It was "PASS" | "WARN" | "FAIL" | "SKIPPED" while the API
  // could already return four more — and since this is a fetch response, TypeScript never
  // noticed. Narrowing a wire type to the cases you happen to handle is a lie the compiler
  // cannot check, and it hid that inconclusive results were reaching this widget unlabelled.
  status:
    | "PASS" | "WARN" | "FAIL" | "SKIPPED"
    | "NOT_APPLICABLE" | "INCONCLUSIVE" | "ERROR" | "NOT_TESTED" | "EVIDENCE_REQUIRED";
  detail?: string | null;
};
type CategorySummary = {
  category: string;
  pass: number;
  warn: number;
  fail: number;
  inconclusive: number;
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
  /** Ran without reaching a verdict. Absent on a scan stored before this field existed. */
  inconclusive?: number;
  categories: CategorySummary[];
  emailCaptured: boolean;
  checks: Check[] | null;
  errorMessage: string | null;
  /**
   * The triaged report — FREE. `actionable` is every P1/P2 finding with its evidence
   * (typically 5-20); `advisoryCount` is the P3 tail, which belongs to the in-depth
   * review; `notEstablished` is what the scan could not answer, and why.
   *
   * Optional because a scan stored before this field existed replays without it.
   */
  triage?: {
    actionable: { checkKey: string; category: string; label: string; status: string; detail: string; tier: "P1" | "P2" }[];
    advisoryCount: number;
    advisoryByCategory: { category: string; count: number }[];
    notEstablished: { checkKey: string; category: string; label: string; reason: string }[];
  };
};

// The Window.turnstile shape is declared once in
// src/components/pulse/turnstile-box.tsx. Two `declare global` blocks for the same
// property must describe the identical type or TS errors, so this file no longer
// declares its own.

const ACCENT = "#6B52FF"; // Gitwork purple
const NAVY_GRADIENT = "linear-gradient(160deg, #17172a 0%, #0C0C18 100%)";
const SERIF = "var(--font-fraunces), 'Fraunces', Georgia, serif";
// Max consecutive polling failures (network error / non-2xx / 404) before giving up
// and surfacing an error instead of polling forever. At the 2500ms backoff delay,
// 40 attempts is ~100s — generous for a transient blip, but finite.
const MAX_POLL_FAILURES = 40;

// ?example=1 shows a fixed, fabricated completed scan — no API call, no real scan
// row — so the full branded results view can be previewed (e.g. from Settings →
// Public Embed) without running one. This id is never polled; see the guard at
// the top of the polling effect below.
const EXAMPLE_SCAN_ID = "example-preview";
const EXAMPLE_VIEW: View = {
  id: EXAMPLE_SCAN_ID,
  status: "COMPLETED",
  targetUrl: "https://acme-app.io/",
  healthScore: 71,
  techStack: ["Next.js", "Vercel", "Stripe"],
  totalChecks: 40,
  pass: 30,
  warn: 7,
  fail: 3,
  // `inconclusive: 0` is deliberate, not filler: this example is a server-rendered site whose
  // every control resolved. A fixture carrying inconclusive counts would advertise the
  // "NOT ASSESSED" state as the normal look of a scan.
  categories: [
    { category: "Performance", pass: 9, warn: 2, fail: 1, inconclusive: 0 },
    { category: "SEO", pass: 7, warn: 1, fail: 1, inconclusive: 0 },
    { category: "Security", pass: 6, warn: 2, fail: 1, inconclusive: 0 },
    { category: "Mobile", pass: 8, warn: 2, fail: 0, inconclusive: 0 },
  ],
  emailCaptured: false,
  // Mirrors the real triaged shape a visitor now receives: P1/P2 findings in full
  // with evidence (free), the advisory tail counted, and what could not be
  // established named. Numbers taken from a real measured scan so the example does
  // not advertise a shape the product does not produce.
  triage: {
    actionable: [
      { checkKey: "example_csp", category: "Security", label: "No Content-Security-Policy header", status: "FAIL", detail: "The site sends no CSP header, leaving pages more exposed to injected scripts.", tier: "P1" },
      { checkKey: "example_sitemap", category: "SEO", label: "Missing sitemap.xml", status: "FAIL", detail: "Search engines can't discover pages that aren't linked internally.", tier: "P1" },
      { checkKey: "example_render_blocking", category: "Performance", label: "Render-blocking JavaScript delays first paint", status: "FAIL", detail: "Two scripts in <head> block rendering before they've finished loading.", tier: "P2" },
      { checkKey: "example_lcp", category: "Performance", label: "Largest Contentful Paint is slow on mobile", status: "WARN", detail: "Measured at 4.1s on a throttled connection — above the 2.5s target.", tier: "P2" },
      { checkKey: "example_hsts", category: "Security", label: "Missing Strict-Transport-Security header", status: "WARN", detail: "Without HSTS a first visit over http can be intercepted before the redirect.", tier: "P2" },
    ],
    advisoryCount: 512,
    advisoryByCategory: [
      { category: "SEO", count: 190 },
      { category: "Accessibility", count: 168 },
      { category: "Observability", count: 84 },
      { category: "Performance", count: 70 },
    ],
    notEstablished: [
      { checkKey: "example_mfa", category: "Authentication", label: "Multi-factor authentication", reason: "Skipped — no authentication system was detected on this site." },
      { checkKey: "example_ios", category: "App Store", label: "iOS build configuration", reason: "Needs a connected GitHub repository; this was a URL-only scan." },
    ],
  },
  checks: [
    { category: "Security", checkKey: "example_csp", label: "No Content-Security-Policy header", status: "FAIL", detail: "The site sends no CSP header, leaving pages more exposed to injected scripts." },
    { category: "SEO", checkKey: "example_sitemap", label: "Missing sitemap.xml", status: "FAIL", detail: "Search engines can't discover pages that aren't linked internally." },
    { category: "Performance", checkKey: "example_render_blocking", label: "Render-blocking JavaScript delays first paint", status: "FAIL", detail: "Two scripts in <head> block rendering before they've finished loading." },
    { category: "Performance", checkKey: "example_lcp", label: "Largest Contentful Paint is slow on mobile", status: "WARN", detail: "Measured at 4.1s on a throttled connection — above the 2.5s target." },
    { category: "Security", checkKey: "example_hsts", label: "Missing Strict-Transport-Security header", status: "WARN" },
    { category: "Mobile", checkKey: "example_tap_targets", label: "Tap targets smaller than 44px on the pricing page", status: "WARN" },
    { category: "SEO", checkKey: "example_meta_desc", label: "3 pages are missing a meta description", status: "WARN" },
    { category: "Security", checkKey: "example_secure_cookie", label: "Cookies set without the Secure flag", status: "WARN" },
    { category: "Mobile", checkKey: "example_viewport", label: "Viewport not configured for small screens on /checkout", status: "WARN" },
    { category: "Performance", checkKey: "example_image_format", label: "Images aren't served in a modern format (WebP/AVIF)", status: "WARN" },
  ],
  errorMessage: null,
};

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

function CategoryTile({ cat }: { cat: CategorySummary }) {
  const total = cat.pass + cat.warn + cat.fail;
  // ⚠️ A category where nothing resolved used to render 100% and a full green bar — a perfect
  // score awarded for measuring nothing. It is reachable whenever every check in a category is
  // inconclusive, which client-rendered pages make routine. Say "not assessed" instead.
  const unmeasured = total === 0;
  const s = unmeasured ? 0 : Math.round(((cat.pass + cat.warn * 0.5) / total) * 100);
  const tone = unmeasured ? "#9ca3af" : s >= 75 ? "#16a34a" : s >= 50 ? "#d97706" : "#dc2626";
  return (
    <div style={{ display: "flex", background: "#ffffff", border: "1px solid #eceef2", borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 2px rgba(15,23,42,0.04)" }}>
      <div style={{ width: 4, background: tone, flexShrink: 0 }} />
      <div style={{ flex: 1, padding: "10px 12px" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: "#374151" }}>{cat.category}</span>
          <span style={{ fontSize: unmeasured ? 10.5 : 13, fontWeight: 700, color: tone, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
            {unmeasured ? "NOT ASSESSED" : `${s}%`}
          </span>
        </div>
        <div style={{ background: "#eef0f4", borderRadius: 4, height: 4, marginBottom: 6, overflow: "hidden" }}>
          <div style={{ height: "100%", borderRadius: 4, background: tone, width: `${s}%`, transition: "width 600ms ease" }} />
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, fontSize: 10.5, fontWeight: 600, color: "#9ca3af" }}>
          {cat.pass > 0 && <span style={{ color: "#16a34a" }}>{cat.pass} pass</span>}
          {cat.warn > 0 && <span style={{ color: "#d97706" }}>{cat.warn} warn</span>}
          {cat.fail > 0 && <span style={{ color: "#dc2626" }}>{cat.fail} fail</span>}
          {cat.inconclusive > 0 && <span>{cat.inconclusive} inconclusive</span>}
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

export function PublicScanner({ variant = "embed", defaultSource, checkCountLabel }: PublicScannerProps) {
  const isEmbed = variant === "embed";
  const [url, setUrl] = useState("");
  const [email, setEmail] = useState("");
  const [scanId, setScanId] = useState<string | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [emailAlreadyUsed, setEmailAlreadyUsed] = useState(false);
  // The enquiry gate — asked only after the free report has been shown.
  const [enquirySending, setEnquirySending] = useState(false);
  const [enquirySent, setEnquirySent] = useState(false);
  const [enquiryError, setEnquiryError] = useState<string | null>(null);
  const [displayScore, setDisplayScore] = useState<number | null>(null);
  const [isExample, setIsExample] = useState(false);

  const [honeypot, setHoneypot] = useState("");
  const [turnstileReady, setTurnstileReady] = useState(false);
  const [scanToken, setScanToken] = useState<string | null>(null);
  const scanTurnstileRef = useRef<HTMLDivElement>(null);

  const [source, setSource] = useState<PulseScanSource>(defaultSource ?? "foundry-demo");
  const [remoteConfig, setRemoteConfig] = useState<{ turnstileSiteKey: string | null; bookingUrl: string } | null>(null);
  const turnstileSiteKey = remoteConfig?.turnstileSiteKey ?? null;
  const bookingUrl = remoteConfig?.bookingUrl ?? DEFAULT_BOOKING_URL;

  const rootRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const emailUsedRef = useRef<HTMLDivElement>(null);

  // Move focus to newly-appeared error/notice content — otherwise a keyboard or
  // screen-reader user's focus stays on the submit button with no cue that new
  // content appeared below it.
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  useEffect(() => {
    if (emailAlreadyUsed) emailUsedRef.current?.focus();
  }, [emailAlreadyUsed]);

  // Which site referred this embed — attributes leads to a placement in the Foundry
  // leads dashboard. Same-origin (e.g. /pulse-overview's self-embed) or no referrer
  // falls back to "foundry-demo".
  useEffect(() => {
    // The caller already told us which door this is — believe it, and do not let a
    // referrer or a query string relabel it.
    if (defaultSource) return;
    try {
      // An explicit ?source= still wins over the referrer: an embed on a page that
      // proxies or rewrites us has a referrer naming the wrong site.
      const declared = new URLSearchParams(window.location.search).get("source");
      if (isPulseScanSource(declared)) {
        setSource(declared);
        return;
      }
      const ref = document.referrer;
      if (ref && /(^|\.)gitwork\.co\.uk$/.test(new URL(ref).hostname)) setSource("gitwork.co.uk");
    } catch { /* not embedded / no referrer */ }
  }, [defaultSource]);

  // ?example=1 shows a fixed, fabricated completed scan for previewing the full
  // branded results view (Settings → Public Embed → View example) without
  // running a real one — reads the query string directly rather than
  // next/navigation's useSearchParams, which would require a Suspense boundary
  // around this page just to support an admin-only preview link.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).get("example") !== "1") return;
    setIsExample(true);
    setUrl(EXAMPLE_VIEW.targetUrl);
    setEmail("you@company.com");
    setScanId(EXAMPLE_SCAN_ID);
    setView(EXAMPLE_VIEW);
  }, []);

  // Workspace-configurable Turnstile site key + CTA link — fetched once, not baked
  // in at build time, since they're editable from Settings → Public Embed.
  useEffect(() => {
    fetch("/api/public/pulse/config")
      .then((r) => r.json())
      .then((d) => setRemoteConfig({ turnstileSiteKey: d.turnstileSiteKey ?? null, bookingUrl: d.bookingUrl ?? DEFAULT_BOOKING_URL }))
      .catch(() => {});
  }, []);

  // Auto-resize the host iframe as content grows/shrinks. Embed only: rendered
  // inline, `window.parent` IS this window, so this would post height messages to
  // the host page's own listeners.
  useEffect(() => {
    if (!isEmbed) return;
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

  // Poll while a scan is running. A 404 (scan row missing/expired) can never
  // resolve by retrying, so it stops immediately; any other failure (network
  // blip, transient 5xx, unparseable body) retries with a hard cap so a
  // persistently broken backend surfaces an error instead of spinning forever.
  useEffect(() => {
    // The example scan id is never real — nothing to poll, and its view was
    // already seeded directly by the ?example=1 effect above.
    if (!scanId || scanId === EXAMPLE_SCAN_ID) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    let failures = 0;

    // Stop polling AND clear scanId — otherwise `running` (derived from
    // scanId !== null) stays true forever, leaving the button stuck on
    // "Scanning…" underneath the error that's now showing.
    const giveUp = (message: string) => {
      setError(message);
      setScanId(null);
    };

    const poll = async () => {
      let res: Response;
      try {
        res = await fetch(`/api/public/pulse/scan/${scanId}`, { cache: "no-store" });
      } catch {
        if (!active) return;
        failures += 1;
        if (failures >= MAX_POLL_FAILURES) {
          giveUp("We lost the connection while checking your scan. Please try again.");
          return;
        }
        timer = setTimeout(poll, 2500);
        return;
      }
      if (!active) return;
      if (res.status === 404) {
        giveUp("We couldn't find that scan — it may have expired. Please try again.");
        return;
      }
      if (res.ok) {
        let data: View;
        try {
          data = (await res.json()) as View;
        } catch {
          failures += 1;
          if (failures >= MAX_POLL_FAILURES) {
            giveUp("Something went wrong reading your scan results. Please try again.");
            return;
          }
          timer = setTimeout(poll, 2500);
          return;
        }
        failures = 0;
        setView(data);
        if (data.status === "RUNNING") timer = setTimeout(poll, 1500);
      } else {
        failures += 1;
        if (failures >= MAX_POLL_FAILURES) {
          giveUp("This is taking longer than it should. Please try again.");
          return;
        }
        timer = setTimeout(poll, 2500);
      }
    };
    poll();
    return () => { active = false; clearTimeout(timer); };
  }, [scanId]);

  // Animate score count-up when it first arrives — skipped for
  // prefers-reduced-motion (this is a manual rAF loop, not a CSS
  // transition/animation, so the global reduced-motion stylesheet rule can't
  // reach it; jump straight to the final value instead).
  useEffect(() => {
    if (view?.healthScore == null) { setDisplayScore(null); return; }
    const target = view.healthScore;
    if (displayScore === target) return;
    const reduceMotion = typeof window !== "undefined"
      && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (displayScore === null && !reduceMotion) {
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

  const running = view?.status === "RUNNING" || (scanId !== null && !view);
  const done = view?.status === "COMPLETED";
  const failedScan = view?.status === "FAILED";

  // Don't let a click through before Turnstile has actually produced a token —
  // submitting without one always fails server-side ("Verification failed"),
  // which reads as a broken form rather than "still checking you're human".
  const awaitingVerification = !isExample && Boolean(turnstileSiteKey) && !scanToken;

  // Email is required up front — one combined submission starts the scan and
  // captures the lead in the same call (see POST /api/public/pulse/scan).
  const startScan = useCallback(async () => {
    // Mirrors the button's own disabled condition (running/starting/empty fields/
    // awaiting Turnstile) so the Enter key can't fire a submit the button itself
    // would have blocked — previously Enter skipped the Turnstile-readiness check.
    if (!url.trim() || starting || running || awaitingVerification) return;
    setStarting(true);
    setError(null);
    setEmailAlreadyUsed(false);
    setView(null);
    setScanId(null);
    try {
      const res = await fetch("/api/public/pulse/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // No email: the scan and the free report do not require one.
        body: JSON.stringify({ url: url.trim(), honeypot, turnstileToken: scanToken, source }),
      });
      let data: { id?: string; error?: string } = {};
      try {
        data = await res.json();
      } catch {
        // Non-JSON body (e.g. a gateway timeout/error page) — don't let a raw
        // parse error reach the visitor.
        throw new Error("Couldn't start the scan. Please try again.");
      }
      if (!res.ok) {
        if (res.status === 409) { setEmailAlreadyUsed(true); return; }
        throw new Error(data?.error ?? "Couldn't start the scan.");
      }
      if (!data.id) throw new Error("Couldn't start the scan. Please try again.");
      setScanId(data.id);
      // ⚠️ A Turnstile token is SINGLE-USE — Cloudflare's siteverify rejects a
      // second redemption as `timeout-or-duplicate`. The enquiry endpoint needs its
      // own, so reset the widget now; its callback re-fires with a fresh token.
      // Without this, "Get the in-depth review" always failed "Verification failed"
      // wherever Turnstile is configured, which is production.
      setScanToken(null);
      try { window.turnstile?.reset?.(); } catch { /* widget not mounted */ }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setStarting(false);
    }
  }, [url, starting, running, awaitingVerification, honeypot, scanToken, source]);

  /**
   * Ask for the in-depth review. This is the conversion event: the visitor has
   * already seen the score, the triaged findings and the not-established list for
   * free, and is now asking what it means.
   *
   * Deliberately does NOT run anything expensive — it records a warm lead. An
   * anonymous caller must never be able to spend AI tokens.
   */
  const sendEnquiry = useCallback(async () => {
    const trimmed = email.trim();
    if (!scanId || !trimmed || enquirySending) return;
    setEnquirySending(true);
    setEnquiryError(null);
    try {
      const res = await fetch(`/api/public/pulse/scan/${scanId}/enquiry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed, honeypot, turnstileToken: scanToken, source }),
      });
      let data: { error?: string } = {};
      try {
        data = await res.json();
      } catch {
        // Non-JSON body (gateway page) — never surface a raw parse error.
        throw new Error("Couldn't send that just now. Please try again.");
      }
      if (!res.ok) {
        throw new Error(
          res.status === 409
            ? "We already have a request against this email — we'll be in touch."
            : data?.error ?? "Couldn't send that just now. Please try again.",
        );
      }
      setEnquirySent(true);
    } catch (e) {
      setEnquiryError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setEnquirySending(false);
    }
  }, [email, scanId, enquirySending, honeypot, scanToken, source]);

  // Fallback finding list for scans stored before `triage` existed.
  const findings = (view?.checks ?? [])
    .filter((c) => c.status === "FAIL" || c.status === "WARN")
    .sort((a, b) => (a.status === "FAIL" ? 0 : 1) - (b.status === "FAIL" ? 0 : 1));

  // Prefer the server's count; fall back to summing the category tiles so a scan stored before
  // the field existed still reports honestly rather than reading as "everything was assessed".
  const unresolved = view?.inconclusive
    ?? (view?.categories ?? []).reduce((sum, cat) => sum + (cat.inconclusive ?? 0), 0);
  const clientRendered = (view?.checks ?? []).some(
    (c) => c.checkKey === "spa_client_rendered" && c.status !== "PASS",
  );

  const formDisabled = running || starting || isExample;
  const submitDisabled = formDisabled || !url.trim() || awaitingVerification;

  // A single, always-mounted screen-reader announcement for the meaningful state
  // transitions (not the per-tick "N checks done" count, which would be noisy at
  // ~1.5s intervals — see the running branch below). Visually hidden; sighted
  // users already see the equivalent state in the button label / results area.
  const statusAnnouncement = error
    ? error
    : emailAlreadyUsed
      ? "You've already used your free scan with this email."
      : failedScan
        ? (view?.errorMessage ?? "We couldn't complete the scan for that URL.")
        : done
          ? `Scan complete. Health score ${view?.healthScore ?? "unavailable"} out of 100.`
          : starting
            ? "Starting your scan…"
            : running
              ? "Scanning your site…"
              : "";

  return (
    <div
      ref={rootRef}
      style={{
        fontFamily: "var(--font-sans), ui-sans-serif, system-ui, sans-serif",
        color: "#111827",
        // The page variant inherits surface, width and padding from the section that
        // renders it. Repeating them here is what produced a card inside a card.
        ...(isEmbed
          ? { background: "#ffffff", padding: "28px 20px", maxWidth: 640, margin: "0 auto" }
          : null),
      }}
    >
      {turnstileSiteKey && !isExample && (
        <Script
          src="https://challenges.cloudflare.com/turnstile/v0/api.js"
          strategy="afterInteractive"
          onLoad={() => setTurnstileReady(true)}
        />
      )}

      {/* Widget header — embed only. Inline, the host page has already said all of
          this in its own type, and an <h1> here would be a second one on the page. */}
      {isEmbed && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: ACCENT, textTransform: "uppercase" }}>
              Pulse
            </span>
          </div>

          <h1 style={{ fontFamily: SERIF, fontSize: 26, fontWeight: 700, margin: "0 0 6px", lineHeight: 1.2 }}>
            Free site health check
          </h1>
          <p style={{ fontSize: 14, color: "#6b7280", margin: "0 0 18px" }}>
            A quick check across performance, SEO, security &amp; mobile — in seconds.
          </p>
        </>
      )}

      {/* Form — URL only. Email moved to the post-results enquiry: the FACTS are free
          (they cost nothing to produce), and contact details are asked for at the point
          the visitor wants the interpretation. See POST /api/public/pulse/scan. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <input
          type="url"
          inputMode="url"
          placeholder="yourwebsite.com"
          aria-label="Website URL"
          aria-describedby={error ? "pulse-embed-error" : undefined}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") startScan(); }}
          disabled={formDisabled}
          style={{
            padding: "12px 14px",
            border: "1px solid #d1d5db",
            borderRadius: 10,
            // ⚠️ 16px, not 15. iOS Safari zooms the whole viewport when a text field
            // with a smaller font takes focus, so on a phone tapping this jumped the
            // page and shoved the widget half off-screen. Same rule (and reason) as
            // src/components/onboarding/field-renderer.tsx:66.
            fontSize: 16,
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
      {turnstileSiteKey && !isExample && <div ref={scanTurnstileRef} style={{ marginTop: 10 }} />}
      <p style={{ marginTop: 8, fontSize: 11.5, color: "#9ca3af" }}>
        {isExample
          ? "Example results, shown for illustration."
          : `Free, no sign-up. ${checkCountLabel} automated checks — no email needed to see your results.`}
      </p>

      {/* Visually-hidden live region — announces the meaningful state
          transitions (start/complete/fail/already-used/error) without
          spamming the per-tick "N checks done" running count. */}
      <p
        role="status"
        aria-live="polite"
        style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0,0,0,0)", whiteSpace: "nowrap", border: 0 }}
      >
        {statusAnnouncement}
      </p>

      {error && (
        <p
          id="pulse-embed-error"
          ref={errorRef}
          tabIndex={-1}
          role="alert"
          style={{ marginTop: 12, fontSize: 13, color: "#dc2626", outline: "none" }}
        >
          {error}
        </p>
      )}

      {/* Already claimed their free scan with this email */}
      {emailAlreadyUsed && (
        <div
          ref={emailUsedRef}
          tabIndex={-1}
          style={{ marginTop: 22, border: "1px solid #eceef2", borderRadius: 12, padding: 18, background: "#f9fafb", outline: "none" }}
        >
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
            <p role="alert" style={{ fontSize: 14, color: "#dc2626" }}>
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

              {/* Category tiles (fill in live).
                  Capped at 8. The public scan now scores the FULL check set rather than
                  a curated 10, so `categories` went from ~6 to ~25 — which in a narrow
                  embedded iframe is a wall rather than a summary. `summarise` already
                  sorts worst-first, so the cap shows the categories that actually need
                  attention and names the remainder honestly. */}
              {view.categories.length > 0 && (
                <>
                  <div
                    style={{
                      marginTop: 18,
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
                      gap: 10,
                    }}
                  >
                    {view.categories.slice(0, 8).map((cat) => (
                      <CategoryTile key={cat.category} cat={cat} />
                    ))}
                  </div>
                  {view.categories.length > 8 && (
                    <p style={{ marginTop: 10, fontSize: 12, color: "#6b7280", textAlign: "center" }}>
                      +{view.categories.length - 8} more categories checked — see the full report.
                    </p>
                  )}
                </>
              )}

              {/* The FREE report: every P1/P2 finding, in full, with its evidence.
                  Falls back to the old FAIL/WARN list for a scan stored before
                  `triage` existed, so replaying an old row still renders. */}
              {(view.triage?.actionable.length ?? findings.length) > 0 && (
                <div style={{ marginTop: 22 }}>
                  <p style={{ fontSize: 14, fontWeight: 700, margin: "0 0 4px" }}>
                    {`What to fix (${view.triage?.actionable.length ?? findings.length})`}
                  </p>
                  <p style={{ fontSize: 12, color: "#6b7280", margin: "0 0 10px" }}>
                    Ranked worst-first by severity and certainty. All of it, free.
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {(view.triage
                      ? view.triage.actionable.map((f) => ({ ...f, isFail: f.status === "FAIL" }))
                      : findings.slice(0, 5).map((f) => ({ ...f, tier: undefined as "P1" | "P2" | undefined, isFail: f.status === "FAIL" }))
                    ).map((f) => (
                      <div
                        key={f.checkKey}
                        style={{
                          display: "flex",
                          gap: 10,
                          padding: "10px 12px",
                          border: `1px solid ${f.isFail ? "#fecaca" : "#fde68a"}`,
                          borderRadius: 10,
                          background: f.isFail ? "#fef2f2" : "#fffbeb",
                        }}
                      >
                        <span style={{ color: f.isFail ? "#dc2626" : "#d97706", fontWeight: 800, fontSize: 16, lineHeight: 1, flexShrink: 0 }}>
                          {f.isFail ? "\u2715" : "!"}
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>
                            {f.label}
                            {f.tier && (
                              <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: "#6b7280", letterSpacing: 0.4 }}>
                                {f.tier}
                              </span>
                            )}
                          </div>
                          {f.detail && <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{f.detail}</div>}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* The advisory tail — counted honestly, not hidden. This is the
                      gated half, and naming its size is what makes the gate fair. */}
                  {(view.triage?.advisoryCount ?? 0) > 0 && (
                    <p style={{ fontSize: 12, color: "#6b7280", marginTop: 10, marginBottom: 0 }}>
                      Plus <strong style={{ color: "#374151" }}>{view.triage!.advisoryCount}</strong> lower-priority
                      advisory checks
                      {view.triage!.advisoryByCategory.length > 0 && (
                        <> — mostly {view.triage!.advisoryByCategory.slice(0, 3).map((a) => a.category).join(", ")}</>
                      )}
                      . Those come with the in-depth review.
                    </p>
                  )}
                </div>
              )}

              {/* What the scan could NOT establish. Sits with the findings deliberately: a
                  visitor reading "3 things to fix" must not assume everything else was checked
                  and passed. Client-rendered pages are the common case here — their content is
                  not in the static HTML, so a scanner cannot read it without running the app. */}
              {done && unresolved > 0 && (
                <div style={{ marginTop: 14, padding: "10px 12px", border: "1px solid #e5e7eb", borderRadius: 10, background: "#f9fafb" }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>
                    {`${unresolved} check${unresolved === 1 ? "" : "s"} couldn't be assessed`}
                  </div>
                  <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                    {clientRendered
                      ? "This site renders its content with JavaScript, so the content and SEO checks can't read it from the page source. They're reported as inconclusive rather than failed — and they're not counted in the score either way."
                      : "These ran without reaching a verdict, so they're excluded from the score rather than counted as passes."}
                  </div>
                </div>
              )}

              {/* THE GATE. Everything above is free and needs no email. This asks for
                  contact details in exchange for the interpretation — what the findings
                  mean, the order to fix them in, the implementation brief and the
                  advisory tail. That is the half with real AI cost and real expertise
                  behind it, so it is the honest place to ask. */}
              {done && (
                <div style={{ marginTop: 22, background: NAVY_GRADIENT, borderRadius: 12, padding: 20 }}>
                  {enquirySent ? (
                    <div style={{ textAlign: "center" }}>
                      <p style={{ fontFamily: SERIF, fontSize: 16, fontWeight: 700, color: "white", margin: "0 0 4px" }}>
                        Thanks — that&apos;s with us.
                      </p>
                      <p style={{ fontSize: 13, color: "#9ca3af", margin: "0 0 14px" }}>
                        We&apos;ll come back to you with the in-depth review of {view.targetUrl}. If you&apos;d
                        rather talk it through now, grab a slot.
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
                  ) : (
                    <>
                      <p style={{ fontFamily: SERIF, fontSize: 16, fontWeight: 700, color: "white", margin: "0 0 6px" }}>
                        {view.fail > 0
                          ? `${view.fail} failing check${view.fail === 1 ? "" : "s"}. Want to know what they mean?`
                          : "Want to know what this means?"}
                      </p>
                      <p style={{ fontSize: 13, color: "#9ca3af", margin: "0 0 14px" }}>
                        The in-depth review adds what the numbers actually mean for your launch, the
                        order to fix things in, an implementation brief your developers (or your AI)
                        can work straight from
                        {(view.triage?.advisoryCount ?? 0) > 0 && <>, and all {view.triage!.advisoryCount} advisory checks</>}.
                      </p>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <input
                          type="email"
                          inputMode="email"
                          placeholder="you@company.com"
                          aria-label="Your email address"
                          aria-describedby={enquiryError ? "pulse-enquiry-error" : undefined}
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") sendEnquiry(); }}
                          disabled={enquirySending}
                          style={{
                            padding: "12px 14px",
                            border: "1px solid rgba(255,255,255,0.25)",
                            borderRadius: 10,
                            fontSize: 16, // see the URL field above — iOS focus zoom
                            outline: "none",
                            background: "rgba(255,255,255,0.06)",
                            color: "white",
                          }}
                        />
                        <Honeypot value={honeypot} onChange={setHoneypot} />
                        <button
                          onClick={sendEnquiry}
                          disabled={enquirySending || !email.trim() || awaitingVerification}
                          style={{
                            padding: "12px 20px",
                            borderRadius: 10,
                            border: "none",
                            background: enquirySending || !email.trim() || awaitingVerification ? "rgba(255,255,255,0.35)" : "white",
                            color: "#111827",
                            fontSize: 14,
                            fontWeight: 700,
                            cursor: enquirySending || !email.trim() || awaitingVerification ? "default" : "pointer",
                          }}
                        >
                          {enquirySending ? "Sending…" : awaitingVerification ? "Verifying…" : "Get the in-depth review"}
                        </button>
                      </div>
                      {enquiryError && (
                        <p id="pulse-enquiry-error" role="alert" style={{ marginTop: 8, marginBottom: 0, fontSize: 12, color: "#fca5a5" }}>
                          {enquiryError}
                        </p>
                      )}
                      {!isExample && (
                        <p style={{ fontSize: 11.5, color: "#9ca3af", margin: "10px 0 0" }}>
                          Or{" "}
                          <a
                            href={`/scan/${view.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: "#d1d5db", textDecoration: "underline" }}
                          >
                            open the full report on its own page
                          </a>{" "}
                          — a link you can share.
                        </p>
                      )}
                      <p style={{ fontSize: 11.5, color: "#6b7280", margin: "10px 0 0" }}>
                        Or{" "}
                        <a href={bookingUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#d1d5db", textDecoration: "underline" }}>
                          book a call
                        </a>{" "}
                        and we&apos;ll walk through it with you.
                      </p>
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Credit — embed only. It is how a third-party placement says where the widget
          came from; on a Gitwork page the page footer already does. */}
      {isEmbed && (
        <p style={{ marginTop: 20, fontSize: 11, color: "#9ca3af", textAlign: "center" }}>
          Powered by <span style={{ color: "#6b7280", fontWeight: 600 }}>Gitwork Foundry</span>
        </p>
      )}
    </div>
  );
}
