import { CATEGORIES } from "./categories";
import { type ExtendedCheckContext, type PulseScanCheckInput, fetchWithTimeout, platformIs, skip } from "./_types";

const CATEGORY = CATEGORIES.API_QUALITY;

const ALL_CHECKS: Array<[string, string]> = [
  ["api_endpoint_broken", "Referenced API endpoints don't error"],
  ["api_endpoint_incomplete", "API errors return structured responses"],
  ["api_endpoint_unverified", "No dead API references"],
];

// Matches a same-origin API path literal, e.g. "/api/users/create" — quoted so it
// reads as a real reference (a fetch/axios call, a hardcoded URL) rather than
// incidental text. Templated segments ({id}, [id], :id, ${..}) are filtered out
// below since they aren't directly probeable.
const API_PATH_RE = /["'`](\/api\/[a-zA-Z0-9_\-/]{2,80})["'`]/g;

const STACK_LEAK_RE =
  /at\s+[\w.<>]+\s+\(.*:\d+:\d+\)|node_modules\/[\w@/.\-]+|Traceback \(most recent call last\)|PrismaClientKnownRequestError|Cannot find module|internal\/modules\/cjs/i;

function extractApiPaths(source: string): string[] {
  const found = new Set<string>();
  const re = new RegExp(API_PATH_RE);
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    const path = m[1].split("?")[0].replace(/\/$/, "");
    if (/[{}[\]:$]/.test(path)) continue; // templated segment — not directly probeable
    found.add(path);
    if (found.size >= 12) break;
  }
  return [...found];
}

// Best-effort: also scan the first couple of same-origin <script src> bundles, since
// in most SPA/Next.js apps the API calls live in compiled JS, not the raw homepage
// HTML. Third-party/CDN scripts are skipped — no reason to fetch or trust those.
async function fetchScriptSnippets(httpsUrl: string, html: string): Promise<string[]> {
  const srcs = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)]
    .map((m) => m[1])
    .filter((src) => !/^https?:\/\//i.test(src) || src.startsWith(httpsUrl))
    .slice(0, 2);

  const snippets: string[] = [];
  for (const src of srcs) {
    try {
      const url = /^https?:\/\//i.test(src) ? src : new URL(src, httpsUrl).toString();
      const res = await fetchWithTimeout(url);
      if (!res.ok) continue;
      snippets.push((await res.text()).slice(0, 200_000));
    } catch {
      // best-effort only — a bundle fetch failing shouldn't fail the scan
    }
  }
  return snippets;
}

/**
 * Discovers API endpoints the app itself references (homepage HTML + a couple of
 * bundled scripts) and live-probes each — catching broken (5xx), incomplete
 * (unhandled errors leaking stack traces instead of a structured response), and
 * unverified (referenced in code but 404s live) endpoints. Deliberately probes
 * only paths the app references, not guessed/well-known paths — guessing widens
 * false-positive risk on projects that simply don't have that route.
 */
export async function runApiHealthChecks(ctx: ExtendedCheckContext): Promise<PulseScanCheckInput[]> {
  const { httpsUrl, catchAll200 } = ctx;
  const html = ctx.pageResult.html;

  if (platformIs(ctx.platform, "MARKETING_SITE", "IOS_APP", "ANDROID_APP", "CROSS_PLATFORM_MOBILE", "CLI_TOOL", "DESKTOP_APP")) {
    return skip(CATEGORY, ALL_CHECKS, "Not applicable — API health checks are for API backends and developer platforms.");
  }

  const scriptSnippets = await fetchScriptSnippets(httpsUrl, html);
  const discovered = extractApiPaths([html, ...scriptSnippets].join("\n")).slice(0, 8);

  if (discovered.length === 0) {
    return skip(CATEGORY, ALL_CHECKS, "No API endpoint references discovered in page source or bundled scripts.");
  }

  const probes = await Promise.all(
    discovered.map(async (path) => {
      const url = `${httpsUrl.replace(/\/$/, "")}${path}`;
      try {
        const res = await fetchWithTimeout(url, { method: "GET" });
        const body = (await res.text().catch(() => "")).slice(0, 5000);
        return { path, status: res.status, body };
      } catch {
        return { path, status: 0, body: "" };
      }
    }),
  );

  const checks: PulseScanCheckInput[] = [];

  const broken = probes.filter((p) => p.status >= 500);
  checks.push({
    category: CATEGORY,
    checkKey: "api_endpoint_broken",
    label: "Referenced API endpoints don't error",
    status: broken.length > 0 ? "FAIL" : "PASS",
    detail:
      broken.length > 0
        ? `${broken.length} of ${probes.length} discovered API endpoint(s) returned a server error: ${broken.map((p) => `${p.path} (${p.status})`).join(", ")}.`
        : `${probes.length} discovered API endpoint(s) responded without server errors.`,
    evidence: broken.length > 0 ? broken.map((p) => `${p.path}: ${p.status}`).join("; ") : undefined,
  });

  const leaking = probes.filter((p) => p.status >= 400 && STACK_LEAK_RE.test(p.body));
  checks.push({
    category: CATEGORY,
    checkKey: "api_endpoint_incomplete",
    label: "API errors return structured responses",
    status: leaking.length > 0 ? "FAIL" : "PASS",
    detail:
      leaking.length > 0
        ? `${leaking.length} endpoint(s) leak stack traces or internal file paths in error responses: ${leaking.map((p) => p.path).join(", ")}. This exposes internals and library/framework versions to attackers, and signals unhandled exceptions rather than a deliberate error contract.`
        : "No stack traces or internal file paths detected in probed API error responses.",
  });

  const deadRefs = catchAll200 ? [] : probes.filter((p) => p.status === 404);
  checks.push({
    category: CATEGORY,
    checkKey: "api_endpoint_unverified",
    label: "No dead API references",
    status: catchAll200 ? "SKIPPED" : deadRefs.length > 0 ? "WARN" : "PASS",
    detail: catchAll200
      ? "Host returns 200 for unknown paths (catch-all routing) — dead-reference detection can't be probed reliably."
      : deadRefs.length > 0
        ? `${deadRefs.length} API path(s) referenced in the app's source return 404 live: ${deadRefs.map((p) => p.path).join(", ")}. These may be renamed, removed, or unfinished routes — verify they're still meant to exist.`
        : "All discovered API references resolved (no 404s).",
  });

  return checks;
}
