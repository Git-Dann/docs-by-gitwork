import type { PulseScanCheckInput } from "@/types/pulse";
import type { CheckCategory } from "./categories";
import type { JurisdictionCode } from "./jurisdictions";
import type { UrlSurfaceKind } from "./platform-applicability";
import { fetchScannableUrl } from "@/server/pulse-lite/url-guard";

export type { PulseScanCheckInput };

export type FetchResult = {
  ok: boolean;
  status: number;
  headers: Record<string, string>;
  html: string;
  responseTimeMs: number;
  finalUrl: string;
};

export type ProjectContext = {
  isPaymentEnabled: boolean;
  isAuthEnabled: boolean;
  isSaas: boolean;
  isMobileApp: boolean;
  hasBackend: boolean;
  // How this project authenticates users, best-effort detected from homepage
  // signals. "unknown" means auth is enabled (via a provider like Clerk/Auth0)
  // but the method isn't visible in static HTML — checks should NOT skip on
  // "unknown", only on a confident "otp" (no password field found).
  authMethod: "password" | "otp" | "both" | "unknown";
};

export interface ExtendedCheckContext {
  pageResult: FetchResult;
  httpsUrl: string;
  hostname: string;
  platform: string;
  ctx: ProjectContext;
  htmlLower: string;
  // True when the host returns 200 + its app shell for ANY unknown path (SPA /
  // Vercel / Next.js catch-all). When set, path-existence probes are inconclusive
  // and must not be reported as exposures. Computed once in runUrlChecks.
  catchAll200: boolean;
  /** Whether the fetched document is the product, a prototype bundle, or an access interstitial. */
  surfaceKind?: UrlSurfaceKind;
  // Jurisdiction context (optional — additive). `targetMarkets` are user-declared,
  // `detectedMarkets` are auto-detected from the page, `effectiveMarkets` is the
  // resolved set used for filtering (declared if any, else detected). Modules can
  // read these but the central applyJurisdictionFilter does the actual scoping.
  targetMarkets?: JurisdictionCode[];
  detectedMarkets?: JurisdictionCode[];
  effectiveMarkets?: JurisdictionCode[];
}

// Note appended to security findings when the host serves catch-all 200s, so the
// PASS verdict explains why a probe couldn't be treated as a real exposure.
export const CATCH_ALL_NOTE =
  " (Host returns 200 for unknown paths — catch-all routing, so this probe is inconclusive and treated as not exposed.)";

const FETCH_TIMEOUT_MS = 8_000;

export async function fetchWithTimeout(url: string, options?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetchScannableUrl(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function headRequest(url: string): Promise<number> {
  try {
    const res = await fetchWithTimeout(url, {
      method: "HEAD",
      redirect: "follow",
      headers: { "User-Agent": "Gitwork-Pulse/1.0" },
    });
    return res.status;
  } catch {
    return 0;
  }
}

// True when a 200 response is actually the site's HTML shell (an SPA / catch-all
// soft-200) rather than the raw file we asked for. Mirrors the helper in
// pulse-scan.ts so the extended security probes apply the same content check.
function isHtmlShell(contentType: string, body: string): boolean {
  if (contentType.includes("text/html")) return true;
  const head = body.trimStart().slice(0, 300).toLowerCase();
  return (
    head.startsWith("<!doctype html") ||
    head.startsWith("<html") ||
    head.includes("<head") ||
    head.includes("__next_data__") ||
    head.includes('id="root"') ||
    head.includes('id="__next"')
  );
}

/**
 * GET a path and decide whether it's a REAL exposed file rather than a soft-200
 * app shell. A genuine exposure (.env, package.json, .DS_Store, composer.json…)
 * serves its own bytes — JSON, KEY=VALUE, binary — not the site's HTML. So a 200
 * whose body is the HTML shell is NOT an exposure. `looksLikeFile`, when given,
 * additionally requires the body to match the expected file's shape (e.g. JSON),
 * which rejects servers that return a styled 200 error page as text/plain.
 */
export async function verifyFileExposure(
  url: string,
  looksLikeFile?: (body: string, contentType: string) => boolean,
): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(url, {
      method: "GET",
      redirect: "follow",
      headers: { "User-Agent": "Gitwork-Pulse/1.0" },
    });
    if (res.status !== 200) return false;
    const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
    const body = (await res.text().catch(() => "")).slice(0, 2000);
    if (isHtmlShell(contentType, body)) return false;
    return looksLikeFile ? looksLikeFile(body, contentType) : true;
  } catch {
    return false;
  }
}

/**
 * A DNS lookup that distinguishes "this name has no such record" from "we could
 * not ask". Those are different facts and they must not share a return value —
 * collapsing them is what lets a resolver timeout be reported as a clean result.
 */
export type DnsResolution =
  | { ok: true; records: string[] }
  | { ok: false; reason: string };

export async function resolveDnsRecord(name: string, type: string): Promise<DnsResolution> {
  try {
    const res = await fetchWithTimeout(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${encodeURIComponent(type)}`,
      { headers: { Accept: "application/dns-json" } },
    );
    // A non-200 from the resolver is a failed lookup, not an empty answer.
    if (!res.ok) return { ok: false, reason: `DNS resolver returned HTTP ${res.status}` };
    const json = await res.json() as { Answer?: { data: string }[] };
    return { ok: true, records: (json.Answer ?? []).map((a) => a.data) };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "DNS lookup failed" };
  }
}

/**
 * Records only. Kept because most callers legitimately treat "absent" and
 * "unreachable" the same way — but any check whose PASS depends on an EMPTY
 * answer must use `resolveDnsRecord` instead, or a resolver outage manufactures
 * that PASS.
 */
export async function checkDnsRecord(name: string, type: string): Promise<string[]> {
  const resolution = await resolveDnsRecord(name, type);
  return resolution.ok ? resolution.records : [];
}

/**
 * The verdict for a probe that could not be completed. INCONCLUSIVE is excluded
 * from both sides of the health score and counts against assurance completeness,
 * so an unreachable target lowers what Pulse claims to know rather than silently
 * scoring as if the check had run.
 */
export function probeInconclusive(
  category: CheckCategory,
  checkKey: string,
  label: string,
  reason: string,
): PulseScanCheckInput {
  return {
    category,
    checkKey,
    label,
    status: "INCONCLUSIVE",
    detail: `Pulse could not complete this probe, so neither a pass nor a failure can be claimed. ${reason}`,
    confidence: "LOW",
    confidenceReason: "The probe did not complete — no evidence was collected.",
  };
}

export function skip(
  category: CheckCategory,
  checks: Array<[string, string]>,
  reason: string,
): PulseScanCheckInput[] {
  return checks.map(([checkKey, label]) => ({
    category, checkKey, label, status: "SKIPPED" as const, detail: reason,
  }));
}

export function platformIs(platform: string, ...platforms: string[]): boolean {
  return platforms.includes(platform.toUpperCase());
}
