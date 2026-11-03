/**
 * Page weight, measured rather than guessed.
 *
 * The old check compared the HTML string's character count with 300KB and called the
 * total "likely within budget": images, scripts, stylesheets and fonts were never
 * counted, so the label's 3MB claim rested on nothing. This adds the HTML's byte size to
 * the Content-Length of the scripts, stylesheets and images the HTML references, read by
 * HEAD request. Whatever could not be measured is said, and a total that could not be
 * completed is not reported as under budget.
 */
import { fetchWithTimeout } from "./_types";

export const PAGE_WEIGHT_BUDGET = 3 * 1024 * 1024;
const MAX_RESOURCES = 40;

/** Absolute URLs of the scripts, stylesheets, images and preloads the HTML references. */
export function referencedResources(html: string, baseUrl: string): string[] {
  const urls = new Set<string>();
  const add = (raw: string | undefined) => {
    if (!raw || /^(?:data|blob|javascript|about):/i.test(raw.trim())) return;
    try {
      const u = new URL(raw.trim().replace(/&amp;/g, "&"), baseUrl);
      if (u.protocol === "https:" || u.protocol === "http:") urls.add(u.href);
    } catch { /* not a URL */ }
  };
  for (const m of html.matchAll(/<script\b[^>]*\ssrc\s*=\s*["']([^"']+)["']/gi)) add(m[1]);
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    if (/\srel\s*=\s*["']?[^"'>]*\b(?:stylesheet|preload|modulepreload)\b/i.test(tag)) add(/\shref\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]);
  }
  for (const m of html.matchAll(/<img\b[^>]*\ssrc\s*=\s*["']([^"']+)["']/gi)) add(m[1]);
  return [...urls];
}

export interface PageWeightReading {
  htmlBytes: number;
  measuredBytes: number;
  measured: number;
  unmeasured: number;
  /** Referenced resources beyond the cap, not requested at all. */
  skipped: number;
}

/** `htmlContentLength` is the page's own Content-Length header when it sent one (bytes on the wire). */
export async function measurePageWeight(html: string, baseUrl: string, htmlContentLength?: string): Promise<PageWeightReading> {
  const all = referencedResources(html, baseUrl);
  const resources = all.slice(0, MAX_RESOURCES);
  const sizes = await Promise.all(resources.map(async (url) => {
    try {
      const res = await fetchWithTimeout(url, { method: "HEAD", redirect: "follow", headers: { "User-Agent": "Gitwork-Pulse/1.0", "Accept-Encoding": "gzip, br" } });
      const len = Number(res.headers.get("content-length"));
      return res.ok && Number.isFinite(len) && len > 0 ? len : null;
    } catch {
      return null;
    }
  }));
  const known = sizes.filter((s): s is number => s !== null);
  return {
    htmlBytes: Number(htmlContentLength) > 0 ? Number(htmlContentLength) : Buffer.byteLength(html, "utf8"),
    measuredBytes: known.reduce((a, b) => a + b, 0),
    measured: known.length,
    unmeasured: sizes.length - known.length,
    skipped: all.length - resources.length,
  };
}

const mb = (bytes: number) => bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))}KB` : `${(bytes / (1024 * 1024)).toFixed(1)}MB`;

export function pageWeightVerdict(r: PageWeightReading): { status: "PASS" | "WARN" | "INCONCLUSIVE"; detail: string; evidence: string } {
  const total = r.htmlBytes + r.measuredBytes;
  const evidence = `HTML ${Math.round(r.htmlBytes / 1024)}KB + ${r.measured} resource(s) ${Math.round(r.measuredBytes / 1024)}KB; ${r.unmeasured + r.skipped} not measured`;
  if (total >= PAGE_WEIGHT_BUDGET) {
    return { status: "WARN", detail: `The HTML and the ${r.measured} resource${r.measured === 1 ? "" : "s"} Pulse could measure already come to ${mb(total)}, over the 3MB budget${r.unmeasured + r.skipped > 0 ? ` (another ${r.unmeasured + r.skipped} could not be measured, so the true total is higher)` : ""}. Heavy pages load slowly on mobile connections.`, evidence };
  }
  if (r.unmeasured + r.skipped > 0) {
    return { status: "INCONCLUSIVE", detail: `The measurable part of the page comes to ${mb(total)}, but ${r.unmeasured + r.skipped} referenced resource${r.unmeasured + r.skipped === 1 ? "" : "s"} gave no size, so whether the page stays under 3MB could not be established.`, evidence };
  }
  return { status: "PASS", detail: `The HTML plus every script, stylesheet and image it references comes to ${mb(total)}, under the 3MB budget. Resources a script loads later are not counted.`, evidence };
}
