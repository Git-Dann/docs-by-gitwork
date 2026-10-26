import { CATEGORIES } from "./categories";
import { type ExtendedCheckContext, type PulseScanCheckInput, skip, platformIs, fetchWithTimeout } from "./_types";
import { analyzeHost } from "@/server/pulse-lite/registrable-domain";
import { fetchScannableUrl } from "@/server/pulse-lite/url-guard";
import { dnsTtlVerdict, observeDnsTtl } from "./dns-ttl";
import { measurePageWeight, pageWeightVerdict } from "./page-weight";

const PROBE_HEADERS = { "User-Agent": "Gitwork-Pulse/1.0" };
/** Asset body reads are bounded in time AND size: a slow-drip or multi-MB file must not stall a scan. */
const ASSET_READ_TIMEOUT_MS = 6_000;
const ASSET_READ_MAX_BYTES = 400_000;
/** How many stylesheets are read when looking for web fonts. More than this and "no fonts" cannot be claimed. */
const MAX_SHEETS_READ = 6;

/** Hosted font services negotiate the font format per browser (WOFF2 for every modern one). */
const FONT_SERVICE_HOST_RE = /(?:^|\.)(?:fonts\.googleapis\.com|use\.typekit\.net|fonts\.bunny\.net)$/i;

function resolveAssetUrl(raw: string, base: string): string | null {
  if (!raw || /^data:/i.test(raw.trim())) return null;
  try {
    const u = new URL(raw.trim().replace(/&amp;/g, "&"), base);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

function assetFileName(url: string): string {
  try {
    return new URL(url).pathname.split("/").pop() ?? "";
  } catch {
    return "";
  }
}

function isFontServiceUrl(url: string): boolean {
  try {
    return FONT_SERVICE_HOST_RE.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

function isSameSite(url: string, base: string): boolean {
  try {
    const a = new URL(url).hostname;
    const b = new URL(base).hostname;
    if (a === b) return true;
    const reg = analyzeHost(a).registrable;
    return reg !== null && reg === analyzeHost(b).registrable;
  } catch {
    return false;
  }
}

/**
 * True when the asset FILENAME carries a build fingerprint: `.min.`, webpack/Next hex
 * hashes, or Vite/Rollup base64url hashes (`app-BIQp8M26.css`, `Tpxbzi3N.css`). The
 * base64url form needs a digit AND an uppercase letter, so hand-named files such as
 * `mainPage.js` or `scripts1.js` are not mistaken for fingerprints; a real hash without
 * both simply falls through to the content read, which is harmless.
 */
export function isHashedAssetUrl(url: string): boolean {
  const name = assetFileName(url);
  return /\.min\.(?:css|m?js)$/i.test(name) || /chunk/i.test(name) || isFingerprintedAssetUrl(url);
}

/**
 * Stricter than isHashedAssetUrl: true only for a CONTENT HASH in the filename. `.min.` and
 * `chunk` say how a file was built, not that its URL changes when its content does — so they
 * are not grounds to expect `Cache-Control: immutable` on it.
 */
export function isFingerprintedAssetUrl(url: string): boolean {
  const name = assetFileName(url);
  return (
    /[a-f0-9]{8,}/i.test(name) ||
    /(?:^|[-._])(?=[\w-]{0,7}\d)(?=[\w-]{0,7}[A-Z])[\w-]{8}\.(?:css|m?js)$/.test(name)
  );
}

/** Judges fetched CSS/JS text: minified output keeps most of its bytes on very long lines. */
export function minificationOf(body: string): "minified" | "unminified" | "tiny" {
  const text = body.trim();
  if (text.length < 1024) return "tiny";
  const longLineBytes = text.split("\n").reduce((n, line) => (line.length > 250 ? n + line.length : n), 0);
  return longLineBytes / text.length >= 0.5 ? "minified" : "unminified";
}

/** What an asset read returned. `complete` is false when the size cap cut the body short. */
export interface AssetText { text: string; complete: boolean }

/**
 * GETs a CSS/JS asset and reads at most ASSET_READ_MAX_BYTES within ASSET_READ_TIMEOUT_MS.
 * null = could not be observed (failed, non-OK, an HTML shell, or the deadline hit mid-read) —
 * never evidence of absence, and never partial text from a read the clock cut off.
 */
export async function fetchAssetText(url: string): Promise<AssetText | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ASSET_READ_TIMEOUT_MS);
  try {
    const res = await fetchScannableUrl(url, { method: "GET", redirect: "follow", headers: PROBE_HEADERS, signal: controller.signal });
    if (!res.ok || (res.headers.get("content-type") ?? "").toLowerCase().includes("text/html")) return null;
    const reader = res.body?.getReader();
    if (!reader) return { text: "", complete: true };
    const decoder = new TextDecoder();
    let text = "";
    let bytes = 0;
    let complete = true;
    // The deadline must end the read even if the body stream ignores the abort signal.
    const aborted = new Promise<never>((_, reject) => {
      if (controller.signal.aborted) reject(new Error("asset read timed out"));
      controller.signal.addEventListener("abort", () => reject(new Error("asset read timed out")), { once: true });
    });
    aborted.catch(() => {});
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), aborted]);
      if (done) break;
      if (!value) continue;
      bytes += value.byteLength;
      text += decoder.decode(value, { stream: true });
      if (bytes >= ASSET_READ_MAX_BYTES) {
        complete = false;
        reader.cancel().catch(() => {});
        break;
      }
    }
    return { text: complete ? text + decoder.decode() : text.slice(0, ASSET_READ_MAX_BYTES), complete };
  } catch {
    if (!controller.signal.aborted) controller.abort();
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** HEADs an asset. null = could not be observed (never evidence of absence). */
async function probeAssetHeaders(url: string, accept?: string): Promise<Headers | null> {
  try {
    const res = await fetchWithTimeout(url, {
      method: "HEAD",
      redirect: "follow",
      headers: accept ? { ...PROBE_HEADERS, Accept: accept } : PROBE_HEADERS,
    });
    return res.ok ? res.headers : null;
  } catch {
    return null;
  }
}

const WEB_FONT_RE = /@font-face|\.woff2?\b|\.[ot]tf\b|fonts\.googleapis\.com|use\.typekit\.net|fonts\.bunny\.net/i;
const WOFF2_RE = /\.woff2\b|format\(\s*['"]?woff2['"]?\s*\)|font\/woff2|font-woff2/i;
/** A non-WOFF2 font actually referenced: a legacy file extension, format() hint, or data: URI MIME type. */
const LEGACY_FONT_RE = /\.(?:woff|ttf|otf|eot)(?!\w)|format\(\s*['"]?(?:woff|truetype|opentype|embedded-opentype)['"]?\s*\)|data:(?:font\/|application\/(?:x-)?font-)(?:woff(?!2)|ttf|otf|sfnt|truetype|opentype)\b/i;

/** Every image URL a tag names: src, srcset and lazy-load variants, quoted or not. */
function imageUrlsInTag(tag: string): string[] {
  const out: string[] = [];
  for (const m of tag.matchAll(/\s(data-lazy-src|data-src|src|data-lazy-srcset|data-srcset|srcset)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi)) {
    const attr = m[1].toLowerCase();
    const value = (m[2] ?? m[3] ?? m[4] ?? "").trim();
    if (!value) continue;
    if (attr.endsWith("srcset")) {
      for (const entry of value.split(/,\s+/)) {
        const u = entry.trim().split(/\s+/)[0];
        if (u) out.push(u.replace(/,$/, ""));
      }
    } else {
      out.push(value);
    }
  }
  return out;
}

/** Share of in-flow <img> elements that must carry width + height for both dimension checks to pass. */
export const IMAGE_DIMENSION_COVERAGE_PASS = 0.8;

/** A script/link the page loads that shows its JavaScript is split into chunks, or null. */
export function codeSplittingEvidence(html: string): string | null {
  const srcs = [...html.matchAll(/<script\b[^>]*\ssrc=["']([^"']+)["']/gi)].map((m) => m[1]);
  const chunk = srcs.find((u) => /\/_next\/static\/chunks\/|\/_nuxt\/|[./-]chunk(\.[\w-]+)*\.m?js(\?|$)|\/chunks?\/[^"']+\.m?js/i.test(u));
  if (chunk) return chunk;
  const preload = html.match(/<link\b[^>]*rel=["']modulepreload["'][^>]*href=["']([^"']+)["']|<link\b[^>]*href=["']([^"']+)["'][^>]*rel=["']modulepreload["']/i);
  if (preload) return `modulepreload ${preload[1] ?? preload[2]}`;
  return null;
}

export async function runPerformanceExtended(ctx: ExtendedCheckContext): Promise<PulseScanCheckInput[]> {
  const { pageResult, htmlLower } = ctx;
  const html = pageResult.html;
  const h = pageResult.headers;
  const checks: PulseScanCheckInput[] = [];

  if (platformIs(ctx.platform, "API_BACKEND", "CLI_TOOL", "DESKTOP_APP")) {
    return skip(CATEGORIES.PERFORMANCE, [
      ["next_gen_image_formats", "Next-gen image formats (WebP / AVIF)"],
      ["image_dimension_attributes", "Image width/height attributes (CLS prevention)"],
      ["critical_css_inlined", "Critical CSS inlined in <head>"],
      ["css_appears_minified", "CSS appears minified"],
      ["js_appears_minified", "JS files appear minified"],
      ["http3_quic_support", "HTTP/3 / QUIC support"],
      ["early_hints_support", "103 Early Hints support"],
      ["stale_while_revalidate", "Stale-while-revalidate cache directive"],
      ["immutable_cache_assets", "Immutable cache on hashed assets"],
      ["dns_ttl_optimized", "DNS TTL not near-zero"],
      ["render_blocking_scripts", "No render-blocking scripts"],
      ["lcp_fetchpriority_hint", "fetchpriority=high on LCP image"],
      ["image_width_height", "Images have explicit width/height"],
      ["font_preload_hint", "Fonts preloaded"],
      ["total_page_weight", "Total page weight < 3MB"],
      ["third_party_script_blocking", "No render-blocking third-party scripts"],
      ["no_unused_javascript", "Code splitting / lazy loading signals"],
      ["module_script_type", "type=module on script tags"],
      ["resource_hints_comprehensive", "Comprehensive resource hints (preload/prefetch/preconnect)"],
      ["woff2_font_format", "WOFF2 font format used"],
    ], "Not applicable for this platform type.");
  }

  // Next-gen image formats
  const hasWebP = htmlLower.includes(".webp") || htmlLower.includes('type="image/webp"');
  const hasAvif = htmlLower.includes(".avif") || htmlLower.includes('type="image/avif"');
  const baseUrl = pageResult.finalUrl || ctx.httpsUrl;
  // <noscript> holds tracking pixels and no-JS fallbacks, not the page's images.
  const imageTags = html.replace(/<noscript\b[\s\S]*?<\/noscript>/gi, "").match(/<(?:img|source)\b[^>]*>/gi) ?? [];
  // Raster candidates: explicit .jpg/.png URLs, plus extensionless image-CDN URLs whose type only the response can tell.
  const urlsPerTag = imageTags.map((t) => imageUrlsInTag(t)
    .map((u) => resolveAssetUrl(u, baseUrl))
    .filter((u): u is string => !!u));
  // A tag whose only URL is a data: placeholder (lazy-load libraries that keep the real URL in an
  // attribute such as data-original) hides its image from Pulse — that is not "no raster image".
  const tagsWithoutUrl = urlsPerTag.filter((urls) => urls.length === 0).length;
  // Known non-raster formats are skipped; JPEG/PNG and anything else (extensionless image-CDN URLs,
  // image.php?id=…) are probed, and the response's content-type decides.
  const imageCandidates = [...new Set(urlsPerTag.flat())]
    .map((u) => {
      const name = assetFileName(u);
      return { url: u, raster: /\.(?:jpe?g|png)$/i.test(name), knownOther: /\.(?:svg|gif|webp|avif|ico)$/i.test(name) };
    })
    .filter((c) => !c.knownOther);
  let nextGen: Pick<PulseScanCheckInput, "status" | "detail">;
  if (hasWebP || hasAvif) {
    nextGen = { status: "PASS", detail: "WebP or AVIF images detected — next-gen formats reduce image payload by 25–50% over JPEG/PNG." };
  } else if (imageTags.length === 0) {
    nextGen = { status: "INCONCLUSIVE", detail: "No <img> or <picture> elements in the server-rendered HTML — images may be added by client-side JavaScript, so Pulse cannot tell which formats they use." };
  } else if (imageCandidates.length === 0 && tagsWithoutUrl > 0) {
    nextGen = { status: "INCONCLUSIVE", detail: "Some images on the page carry no fetchable URL in the server HTML (only a data: placeholder, typical of lazy-loading), so Pulse cannot tell which formats they use." };
  } else if (imageCandidates.length === 0) {
    nextGen = { status: "PASS", detail: "The page's images are not JPEG/PNG (e.g. SVG or GIF) — there are no raster photos to convert to WebP/AVIF." };
  } else {
    // Image CDNs often negotiate AVIF/WebP from the Accept header while keeping .jpg/.png (or extensionless) URLs.
    const toProbe = [...imageCandidates.filter((c) => c.raster), ...imageCandidates.filter((c) => !c.raster)].slice(0, 3);
    const probed = await Promise.all(toProbe.map((c) => probeAssetHeaders(c.url, "image/avif,image/webp,image/*;q=0.8")));
    const types = probed.filter((p): p is Headers => p !== null).map((p) => (p.get("content-type") ?? "").split(";")[0].trim().toLowerCase());
    const legacyTypes = types.filter((t) => /^image\/(?:jpe?g|png)$/.test(t));
    if (types.some((t) => /^image\/(?:webp|avif)$/.test(t))) {
      nextGen = { status: "PASS", detail: "Images are served as WebP/AVIF via content negotiation — the image CDN returns a next-gen format to browsers that accept it, even though the URLs do not say so." };
    } else if (legacyTypes.length > 0) {
      nextGen = { status: "WARN", detail: `No WebP or AVIF images detected — images are served as ${legacyTypes[0]} even to browsers that accept AVIF/WebP. Convert them to WebP/AVIF to significantly reduce page weight.` };
    } else if (types.length === toProbe.length && toProbe.every((c) => !c.raster)) {
      nextGen = { status: "PASS", detail: "The images Pulse sampled are not served as JPEG/PNG — there are no raster photos among them to convert to WebP/AVIF." };
    } else {
      nextGen = { status: "INCONCLUSIVE", detail: "Image URLs were found but could not be fetched (or did not report an image type), so Pulse cannot tell whether the server negotiates WebP/AVIF." };
    }
  }
  checks.push({ category: CATEGORIES.PERFORMANCE, checkKey: "next_gen_image_formats", label: "Next-gen image formats (WebP / AVIF)", ...nextGen });

  // Image dimension attributes (CLS)
  const allImgTags = html.replace(/<noscript\b[\s\S]*?<\/noscript>/gi, "").match(/<img\b[^>]*>/gi) ?? [];
  // An image absolutely positioned to fill a sized box (next/image `fill`, Tailwind `absolute inset-0`) cannot shift layout.
  const isFillImage = (t: string) => /data-nimg=["']fill|position:\s*absolute|aspect-ratio/i.test(t) || (/\babsolute\b/.test(t) && /\binset-0\b/.test(t));
  const imgTags = allImgTags.filter((t) => !isFillImage(t));
  const imgsWithDims = imgTags.filter((t) => /\swidth\s*=/i.test(t) && /\sheight\s*=/i.test(t)).length;
  const dimCoverage = imgTags.length > 0 ? imgsWithDims / imgTags.length : 1;
  // image_dimension_attributes and image_width_height measure the SAME coverage, so they
  // share one threshold: they used to pass at 80% and 90% and could disagree on one page.
  // With no in-flow <img> at all there is nothing to measure, so neither reports a verdict.
  const noImagesToMeasure = imgTags.length === 0;
  const dimsOk = dimCoverage >= IMAGE_DIMENSION_COVERAGE_PASS;
  checks.push({ category: CATEGORIES.PERFORMANCE, checkKey: "image_dimension_attributes", label: "Image width/height attributes (CLS prevention)", status: noImagesToMeasure ? "NOT_APPLICABLE" : dimsOk ? "PASS" : "WARN", detail: noImagesToMeasure ? "No in-flow <img> elements on the page, so there are no image dimensions to check." : dimsOk ? `${imgTags.length} images checked — ${Math.round(dimCoverage * 100)}% have explicit width/height (prevents Cumulative Layout Shift).` : `${Math.round(dimCoverage * 100)}% of ${imgTags.length} images have explicit width/height — images without them can shift layout as they load (CLS) unless CSS already reserves their space (aspect-ratio or a fixed-size box); add width/height attributes where it does not.` });

  // Critical CSS inlined
  const hasCriticalCss = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].some((m) => m[1].trim().length >= 200);
  const externalStylesheetCount = (html.match(/<link\b[^>]*\srel\s*=\s*["']?stylesheet\b[^>]*>/gi) ?? []).length;
  checks.push({ category: CATEGORIES.PERFORMANCE, checkKey: "critical_css_inlined", label: "Critical CSS inlined in <head>", status: hasCriticalCss || externalStylesheetCount === 0 ? "PASS" : "WARN", detail: hasCriticalCss ? "Inline <style> block detected — critical above-fold CSS appears to be inlined." : externalStylesheetCount === 0 ? "No external stylesheets are linked — there is no render-blocking stylesheet request for inlined critical CSS to remove." : "No significant inline CSS detected — inlining critical CSS eliminates a render-blocking stylesheet request and improves First Contentful Paint." });

  // CSS minified
  const linkTags = html.match(/<link\b[^>]*>/gi) ?? [];
  const hrefOf = (t: string) => t.match(/\shref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i)?.slice(1).find((v) => v !== undefined) ?? "";
  const cssUrls = [...new Set(linkTags
    .filter((t) => /\srel\s*=\s*["']?stylesheet\b/i.test(t) || /\.css(?:[?#]|$)/i.test(hrefOf(t)))
    .map((t) => resolveAssetUrl(hrefOf(t), baseUrl))
    .filter((u): u is string => !!u))];
  const jsUrls = [...new Set((html.match(/<script\b[^>]*\ssrc\s*=[^>]*>/gi) ?? [])
    .map((t) => resolveAssetUrl(t.match(/\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i)?.slice(1).find((v) => v !== undefined) ?? "", baseUrl))
    .filter((u): u is string => !!u && /\.[mc]?js$/i.test(new URL(u).pathname)))];
  // A filename alone cannot prove a file is unminified, so un-fingerprinted files are fetched and their content read.
  // The site's own files are preferred; when it links none, its un-fingerprinted cross-site files (its own CDN host,
  // or a library build it chose) are read instead. Hosted font-service CSS is never judged — the vendor controls it.
  // One GET per asset per scan: the minification and font checks read the same stylesheets.
  const assetReads = new Map<string, Promise<AssetText | null>>();
  const readAsset = (u: string): Promise<AssetText | null> => {
    let p = assetReads.get(u);
    if (!p) { p = fetchAssetText(u); assetReads.set(u, p); }
    return p;
  };
  const judgeMinification = async (kind: "CSS" | "JS", urls: string[]): Promise<Pick<PulseScanCheckInput, "status" | "detail">> => {
    const judged = urls.filter((u) => !isFontServiceUrl(u));
    if (judged.length === 0) return { status: "PASS", detail: `No external ${kind} files detected — ${kind} may be inlined or server-rendered.` };
    const unhashed = judged.filter((u) => !isHashedAssetUrl(u));
    const sameSite = unhashed.filter((u) => isSameSite(u, baseUrl));
    const toRead = (sameSite.length > 0 ? sameSite : unhashed).slice(0, 6);
    const verdicts = await Promise.all(toRead.map(async (u) => {
      const body = await readAsset(u);
      return { url: u, verdict: body === null ? null : minificationOf(body.text) };
    }));
    const unminified = verdicts.find((v) => v.verdict === "unminified");
    if (unminified) {
      const host = isSameSite(unminified.url, baseUrl) ? "" : ` (from ${new URL(unminified.url).hostname})`;
      return { status: "WARN", detail: `${assetFileName(unminified.url)}${host} is served unminified (formatted source with short lines) — minify ${kind} in production to reduce transfer size.` };
    }
    const unread = verdicts.find((v) => v.verdict === null);
    if (unread) return { status: "INCONCLUSIVE", detail: `${assetFileName(unread.url) || unread.url} could not be fetched, so Pulse cannot tell whether the site's ${kind} is minified.` };
    if (judged.some(isHashedAssetUrl) || verdicts.some((v) => v.verdict === "minified")) return { status: "PASS", detail: `${kind} appears bundled and minified (fingerprinted filenames and/or compact file contents).` };
    return { status: "PASS", detail: `The site's ${kind} files are under 1KB — too small for minification to matter.` };
  };
  const [cssMinified, jsMinified] = await Promise.all([judgeMinification("CSS", cssUrls), judgeMinification("JS", jsUrls)]);
  checks.push({ category: CATEGORIES.PERFORMANCE, checkKey: "css_appears_minified", label: "CSS appears minified", ...cssMinified });

  // JS minified
  checks.push({ category: CATEGORIES.PERFORMANCE, checkKey: "js_appears_minified", label: "JS files appear minified", ...jsMinified });

  // HTTP/3
  const altSvc = h["alt-svc"] ?? "";
  const hasHttp3 = altSvc.includes("h3") || altSvc.includes("h3-");
  checks.push({ category: CATEGORIES.PERFORMANCE, checkKey: "http3_quic_support", label: "HTTP/3 / QUIC support", status: hasHttp3 ? "PASS" : "WARN", detail: hasHttp3 ? `HTTP/3 support advertised via Alt-Svc: ${altSvc}` : "No HTTP/3 support detected — HTTP/3 (QUIC) reduces latency especially on lossy connections. Available via Cloudflare, AWS CloudFront, and Fastly." });

  // Early Hints
  const hasEarlyHints = !!h["x-early-hints"] || htmlLower.includes("103 early hints");
  checks.push({ category: CATEGORIES.PERFORMANCE, checkKey: "early_hints_support", label: "103 Early Hints support", status: hasEarlyHints ? "PASS" : "WARN", detail: hasEarlyHints ? "103 Early Hints support detected." : "No 103 Early Hints detected — Early Hints allows the browser to start loading critical resources while the server processes the request, reducing TTFB impact." });

  // Stale-while-revalidate
  const cacheControl = h["cache-control"] ?? "";
  const hasSwr = cacheControl.includes("stale-while-revalidate");
  checks.push({ category: CATEGORIES.PERFORMANCE, checkKey: "stale_while_revalidate", label: "Stale-while-revalidate cache directive", status: hasSwr ? "PASS" : "WARN", detail: hasSwr ? "stale-while-revalidate directive detected — background cache revalidation is configured." : "No stale-while-revalidate — this directive allows serving stale content while refreshing in the background, improving perceived performance." });

  // Immutable cache
  // `immutable` belongs on fingerprinted static assets, never on the HTML document, so read one asset's headers.
  const hashedAssets = [...cssUrls, ...jsUrls].filter(isFingerprintedAssetUrl);
  const hashedAsset = hashedAssets.find((u) => isSameSite(u, baseUrl)) ?? hashedAssets[0];
  const assetHeaders = hashedAsset ? await probeAssetHeaders(hashedAsset) : null;
  const assetCacheControl = assetHeaders?.get("cache-control") ?? "";
  const immutable: Pick<PulseScanCheckInput, "status" | "detail"> = /\bimmutable\b/i.test(cacheControl) || /\bimmutable\b/i.test(assetCacheControl)
    ? { status: "PASS", detail: "Cache-Control: immutable detected — content-hashed assets are cached forever with no revalidation overhead." }
    : !hashedAsset
      ? { status: "INCONCLUSIVE", detail: "No content-hashed CSS/JS files found in the page HTML — Cache-Control: immutable only applies to fingerprinted assets, so there is nothing to assess." }
      : !assetHeaders
        ? { status: "INCONCLUSIVE", detail: `Could not fetch ${assetFileName(hashedAsset)} to read its Cache-Control header.` }
        : { status: "WARN", detail: `Content-hashed asset ${assetFileName(hashedAsset)} is served with ${assetCacheControl ? `Cache-Control: ${assetCacheControl}` : "no Cache-Control header"} — add immutable to fingerprinted assets to eliminate revalidation requests.` };
  checks.push({ category: CATEGORIES.PERFORMANCE, checkKey: "immutable_cache_assets", label: "Immutable cache on hashed assets", ...immutable });

  // DNS TTL. Was a hard-coded PASS whose own detail said the check was skipped; now read
  // from public resolvers, which can only show a lower bound (dns-ttl.ts).
  checks.push(dnsTtlVerdict({ category: CATEGORIES.PERFORMANCE, checkKey: "dns_ttl_optimized", label: "DNS TTL not near-zero" }, ctx.hostname, await observeDnsTtl(ctx.hostname)));

  // Render-blocking scripts
  // Only scripts in <head> block first render: end-of-body scripts run after the content is parsed,
  // and nomodule scripts are skipped entirely by modern browsers.
  const headHtml = html.split(/<body[\s>]/i)[0];
  const blockingScripts = (headHtml.match(/<script\b[^>]*\ssrc\s*=[^>]*>/gi) ?? []).filter((t) => !/\s(?:async|defer|nomodule)(?=[\s=>\/])/i.test(t) && !/\stype\s*=\s*["']?module\b/i.test(t));
  const hasBlockingScripts = blockingScripts.length > 0;
  checks.push({ category: CATEGORIES.PERFORMANCE, checkKey: "render_blocking_scripts", label: "No render-blocking scripts", status: hasBlockingScripts ? "WARN" : "PASS", detail: hasBlockingScripts ? `${blockingScripts.length} render-blocking script(s) in <head> — add async or defer attributes to prevent parser blocking.` : "No synchronous external scripts in <head> — no render-blocking scripts found." });

  // LCP fetchpriority
  const hasFetchPriority = /fetchpriority\s*=\s*["']?high\b/i.test(html);
  const hasImagePreload = linkTags.some((t) => /\srel\s*=\s*["']?preload\b/i.test(t) && /\sas\s*=\s*["']?image\b/i.test(t));
  const lcpHint: Pick<PulseScanCheckInput, "status" | "detail"> = hasFetchPriority
    ? { status: "PASS", detail: "fetchpriority=high detected — LCP image is prioritised for early loading." }
    : allImgTags.length === 0 && !hasImagePreload
      ? { status: "INCONCLUSIVE", detail: "No <img> elements in the server-rendered HTML — the Largest Contentful Paint element is likely text or a CSS background, so an image fetchpriority hint cannot be assessed." }
      : { status: "WARN", detail: "No fetchpriority=high detected — add fetchpriority=\"high\" to your Largest Contentful Paint image to improve LCP score." };
  checks.push({ category: CATEGORIES.PERFORMANCE, checkKey: "lcp_fetchpriority_hint", label: "fetchpriority=high on LCP image", ...lcpHint });

  // image width/height (combined with dimension check above)
  checks.push({ category: CATEGORIES.PERFORMANCE, checkKey: "image_width_height", label: "Images have explicit width/height", status: noImagesToMeasure ? "NOT_APPLICABLE" : dimsOk ? "PASS" : "WARN", detail: noImagesToMeasure ? "No in-flow <img> elements on the page, so there are no image dimensions to check." : dimsOk ? `${Math.round(dimCoverage * 100)}% of ${imgTags.length} images have explicit dimensions.` : "Some images lack width/height attributes — unless CSS reserves their space (aspect-ratio or a fixed-size box), the browser cannot reserve room before they load, which can cause layout shift." });

  // Font preload
  // Fonts are usually declared in a stylesheet, so both font checks read the linked sheets — once, shared.
  // `allRead` is true only when EVERY linked sheet was read in full and none pulls in more CSS via @import;
  // only then can "this page loads no web fonts" be claimed.
  let sheetRead: Promise<{ texts: string[]; allRead: boolean }> | null = null;
  const readSheets = () => (sheetRead ??= (async () => {
    const own = cssUrls.filter((u) => !isFontServiceUrl(u));
    const toRead = own.slice(0, MAX_SHEETS_READ);
    const bodies = await Promise.all(toRead.map((u) => readAsset(u)));
    const texts = bodies.filter((b): b is AssetText => b !== null).map((b) => b.text);
    const allRead = own.length <= MAX_SHEETS_READ
      && bodies.every((b) => b !== null && b.complete)
      && texts.every((t) => !/@import\b/i.test(t));
    return { texts, allRead };
  })());
  const usesFontService = cssUrls.some(isFontServiceUrl);

  const hasFontPreload = linkTags.some((t) => /\srel\s*=\s*["']?preload\b/i.test(t) && /\sas\s*=\s*["']?font\b/i.test(t));
  const noFontPreload = { status: "WARN" as const, detail: "No font preload hints detected — preloading key fonts reduces FOUT/FOIT and improves visual stability." };
  let fontPreload: Pick<PulseScanCheckInput, "status" | "detail">;
  if (hasFontPreload) {
    fontPreload = { status: "PASS", detail: "Font preload hint detected — primary fonts are fetched early." };
  } else if (WEB_FONT_RE.test(html)) {
    fontPreload = noFontPreload;
  } else if (cssUrls.length === 0) {
    fontPreload = { status: "PASS", detail: "No web fonts in the page HTML and no external stylesheets — the page uses system fonts, so there is nothing to preload." };
  } else {
    // A page on system fonts has nothing to preload.
    const sheets = await readSheets();
    fontPreload = sheets.texts.some((s) => WEB_FONT_RE.test(s))
      ? noFontPreload
      : sheets.allRead
        ? { status: "PASS", detail: "No web fonts found in the page HTML or any of its stylesheets — the page uses system fonts, so there is nothing to preload." }
        : { status: "INCONCLUSIVE", detail: "No web fonts are referenced in the page HTML, and not every linked stylesheet could be read in full, so Pulse cannot tell whether fonts need preloading." };
  }
  checks.push({ category: CATEGORIES.PERFORMANCE, checkKey: "font_preload_hint", label: "Fonts preloaded", ...fontPreload });

  // Page weight: the HTML plus the measured sizes of what it references (page-weight.ts).
  // It used to count only the HTML's characters and call the total "likely within budget".
  const weight = await measurePageWeight(html, ctx.pageResult.finalUrl || ctx.httpsUrl, ctx.pageResult.headers["content-length"]);
  checks.push({ category: CATEGORIES.PERFORMANCE, checkKey: "total_page_weight", label: "Total page weight < 3MB", ...pageWeightVerdict(weight) });

  // Third-party render-blocking scripts
  const thirdPartyBlocking = html.match(/<script(?![^>]*(async|defer))[^>]+(googleapis|googletagmanager|facebook|twitter|hotjar|intercom)[^>]*>/gi) ?? [];
  checks.push({ category: CATEGORIES.PERFORMANCE, checkKey: "third_party_script_blocking", label: "No render-blocking third-party scripts", status: thirdPartyBlocking.length === 0 ? "PASS" : "WARN", detail: thirdPartyBlocking.length === 0 ? "No synchronous third-party scripts detected." : `${thirdPartyBlocking.length} synchronous third-party script(s) detected — add async/defer to all third-party scripts to prevent render-blocking.` });

  // Code splitting signals. Evidence is the page actually LOADING split bundles — a chunk
  // script URL or a modulepreload link — not the substring "chunk" or "import(" anywhere
  // in the HTML (a blog post, inline JSON). Unused JavaScript itself cannot be measured
  // from the HTML, so absence of a signal is INCONCLUSIVE, never a WARN.
  const codeSplitEvidence = codeSplittingEvidence(html);
  checks.push({ category: CATEGORIES.PERFORMANCE, checkKey: "no_unused_javascript", label: "Code splitting / lazy loading signals", status: codeSplitEvidence ? "PASS" : "INCONCLUSIVE", detail: codeSplitEvidence ? `The page loads split JavaScript bundles (${codeSplitEvidence}).` : "No split-bundle signal in the HTML (no chunk script URLs or modulepreload links). Bundles may still be split and loaded from JavaScript, and how much of the shipped code goes unused can only be measured in a browser, so this could not be established." });

  // Module scripts
  const hasModuleScripts = /type=["']module["']/i.test(html);
  checks.push({ category: CATEGORIES.PERFORMANCE, checkKey: "module_script_type", label: "type=module on script tags", status: hasModuleScripts ? "PASS" : "WARN", detail: hasModuleScripts ? "ES module scripts detected — modern browsers receive optimised module bundles." : "No type=module scripts — ES modules enable tree-shaking and allow browsers to load only necessary code." });

  // Resource hints
  const relTokens = new Set(linkTags.flatMap((t) => (t.match(/\srel\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i)?.slice(1).find(Boolean) ?? "").toLowerCase().split(/\s+/)));
  const hasPreload = relTokens.has("preload") || relTokens.has("modulepreload");
  const hasPrefetch = relTokens.has("prefetch") || relTokens.has("prerender") || /<script\b[^>]*\stype\s*=\s*["']?speculationrules/i.test(html);
  const hasPreconnect = relTokens.has("preconnect") || relTokens.has("dns-prefetch");
  const hintCount = [hasPreload, hasPrefetch, hasPreconnect].filter(Boolean).length;
  checks.push({ category: CATEGORIES.PERFORMANCE, checkKey: "resource_hints_comprehensive", label: "Comprehensive resource hints (preload/prefetch/preconnect)", status: hintCount >= 2 ? "PASS" : hintCount === 1 ? "WARN" : "WARN", detail: hintCount >= 2 ? "Multiple resource hint types detected (preload/prefetch/preconnect)." : "Limited resource hints — implement preload for critical assets, preconnect for third-party origins, and prefetch for likely next navigations." });

  // WOFF2 fonts
  // Only a legacy font format actually referenced is a defect; the absence of the string ".woff2" is not.
  const woff2Pass = { status: "PASS" as const, detail: "WOFF2 font format detected — optimal font compression for web delivery." };
  const legacyWarn = { status: "WARN" as const, detail: "Legacy font formats (WOFF/TTF/OTF/EOT) referenced without WOFF2 — WOFF2 is ~30% smaller than WOFF and supported by all modern browsers. Prefer WOFF2 for all web fonts." };
  let woff2: Pick<PulseScanCheckInput, "status" | "detail">;
  if (WOFF2_RE.test(html)) {
    woff2 = woff2Pass;
  } else if (LEGACY_FONT_RE.test(html)) {
    woff2 = legacyWarn;
  } else {
    const ownSheets = cssUrls.filter((u) => !isFontServiceUrl(u));
    const sheets = ownSheets.length > 0 ? await readSheets() : { texts: [], allRead: true };
    if (sheets.texts.some((s) => WOFF2_RE.test(s))) {
      woff2 = woff2Pass;
    } else if (sheets.texts.some((s) => LEGACY_FONT_RE.test(s))) {
      woff2 = legacyWarn;
    } else if (usesFontService && sheets.allRead) {
      woff2 = { status: "PASS", detail: "Fonts come from a hosted font service (Google Fonts / Adobe Fonts / Bunny Fonts), which serves WOFF2 to every modern browser." };
    } else if (sheets.allRead) {
      woff2 = { status: "PASS", detail: ownSheets.length > 0 ? "No font files are referenced in the page HTML or any of its stylesheets — the page uses system fonts, so there is nothing to convert." : "No font files are referenced in the page HTML and it links no external stylesheets — the page uses system fonts, so there is nothing to convert." };
    } else {
      woff2 = { status: "INCONCLUSIVE", detail: "No font files are referenced in the page HTML, and not every linked stylesheet could be read in full, so Pulse cannot tell which font formats are used." };
    }
  }
  checks.push({ category: CATEGORIES.PERFORMANCE, checkKey: "woff2_font_format", label: "WOFF2 font format used", ...woff2 });

  return checks;
}
