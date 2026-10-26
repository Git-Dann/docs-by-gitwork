/**
 * Pure rules behind four basic URL checks in `pulse-scan.ts` (October 2026 audit,
 * CLAUDE.md §62): custom_domain, third_party_script_count, response_time and
 * error_monitoring. Kept here so each rule is testable without the scan engine.
 */
import { platformSuffixOf, registrableDomain } from "@/server/pulse-lite/registrable-domain";

// ── custom_domain ────────────────────────────────────────────────────────────

/**
 * Hosting namespaces not (yet) in `registrable-domain.ts`'s platform list. Kept local
 * so this check never depends on that list growing. Same rule as `platformSuffixOf`:
 * the host must sit strictly BENEATH the namespace, and the namespace's own `www`
 * host is the vendor's website, not a customer deployment.
 */
const EXTRA_PLATFORM_NAMESPACES = [
  "bolt.host",
  "framer.app",
  "deno.dev",
  "netlify.com",
  "render.com",
  "koyeb.app",
  "ngrok.app",
  "ngrok.io",
  "ngrok-free.app",
  "carrd.co",
  "wixstudio.io",
  "softr.app",
  "streamlit.app",
  "replit.dev",
  "stackblitz.io",
];

/** The hosting-platform namespace a hostname sits beneath, or null for a custom domain. */
export function hostingPlatformOf(hostname: string): string | null {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  const known = platformSuffixOf(host);
  if (known) return known;
  for (const ns of EXTRA_PLATFORM_NAMESPACES) {
    if (!host.endsWith(`.${ns}`)) continue;
    const above = host.slice(0, host.length - ns.length - 1);
    if (above === "www") continue;
    return ns;
  }
  return null;
}

// ── third_party_script_count ─────────────────────────────────────────────────

/**
 * True when a script host belongs to the SAME organisation as the page: same
 * registrable domain (cdn.example.com on www.example.com). When either registrable
 * domain cannot be established, falls back to "one host is a subdomain of the other",
 * never to "third party".
 */
export function isFirstPartyHost(scriptHost: string, pageHost: string): boolean {
  const a = scriptHost.toLowerCase();
  const b = pageHost.toLowerCase();
  if (a === b) return true;
  const ra = registrableDomain(a);
  const rb = registrableDomain(b);
  if (ra && rb) return ra === rb;
  return a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
}

// ── response_time ────────────────────────────────────────────────────────────

export const RESPONSE_TIME_WARN_MS = 2000;
export const RESPONSE_TIME_FAIL_MS = 5000;

/**
 * Verdict from one or two timed fetches of the page. One slow sample is a WARN at
 * most: a single measurement from one network location cannot tell a slow site from
 * a slow moment. FAIL needs two samples both past the FAIL threshold.
 */
export function responseTimeVerdict(samples: number[]): { status: "PASS" | "WARN" | "FAIL"; detail: string } {
  const valid = samples.filter((n) => Number.isFinite(n) && n >= 0);
  if (valid.length === 0) return { status: "WARN", detail: "The page load could not be timed." };
  const first = valid[0];
  if (first < RESPONSE_TIME_WARN_MS) return { status: "PASS", detail: `Page loaded in ${first}ms.` };
  if (valid.length >= 2 && valid.every((n) => n >= RESPONSE_TIME_FAIL_MS)) {
    return { status: "FAIL", detail: `Page took ${valid.map((n) => `${n}ms`).join(" and ")} on two separate loads.` };
  }
  if (valid.length >= 2) {
    return {
      status: "WARN",
      detail: `Page took ${valid.map((n) => `${n}ms`).join(", then ")} — slow on at least one of two loads.`,
    };
  }
  return {
    status: "WARN",
    detail: `Page loaded in ${first}ms (one measurement, from one location — a single slow sample cannot tell a slow site from a slow moment).`,
  };
}

// ── error_monitoring ─────────────────────────────────────────────────────────

/**
 * An error-monitoring SDK actually loaded or initialised by the page: its CDN script,
 * its init call, or its ingest endpoint. The bare word "sentry" or "datadog" in page
 * text (a blog post, a careers page, a customer logo) is not evidence.
 */
const ERROR_MONITORING_SIGNALS: Array<{ tool: string; re: RegExp }> = [
  { tool: "Sentry", re: /<script[^>]+src=["'][^"']*(sentry-cdn\.com|\/@sentry\/|sentry(\.bundle)?(\.[\w.-]+)?\.min\.js)/i },
  { tool: "Sentry", re: /\bSentry\.init\s*\(|ingest(\.[a-z]{2})?\.sentry\.io|<meta[^>]+name=["']sentry-trace["']|window\.__SENTRY__/ },
  { tool: "Bugsnag", re: /<script[^>]+src=["'][^"']*bugsnag[\w.-]*\.js|\bBugsnag\.start\s*\(/i },
  { tool: "LogRocket", re: /<script[^>]+src=["'][^"']*(cdn\.logrocket\.io|cdn\.lr-ingest\.(io|com))|\bLogRocket\.init\s*\(/i },
  { tool: "Rollbar", re: /<script[^>]+src=["'][^"']*cdn\.rollbar\.com|\b_rollbarConfig\b/ },
  { tool: "Datadog RUM", re: /<script[^>]+src=["'][^"']*datadoghq-browser-agent\.com|\bDD_(RUM|LOGS)\.init\s*\(/ },
  { tool: "New Relic", re: /js-agent\.newrelic\.com|\bNREUM\b/ },
  { tool: "Honeybadger", re: /js\.honeybadger\.io|\bHoneybadger\.configure\s*\(/ },
  { tool: "TrackJS", re: /cdn\.trackjs\.com|\bTrackJS\.install\s*\(/ },
  { tool: "Raygun", re: /cdn\.raygun\.io|\brg4js\s*\(/ },
  { tool: "Highlight", re: /<script[^>]+src=["'][^"']*highlight\.run|\bH\.init\s*\(\s*["']/ },
];

/** The tool whose SDK the page loads, or null when none is visible in the HTML. */
export function errorMonitoringTool(html: string): string | null {
  for (const s of ERROR_MONITORING_SIGNALS) if (s.re.test(html)) return s.tool;
  return null;
}
