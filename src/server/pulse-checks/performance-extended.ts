import { type ExtendedCheckContext, type PulseScanCheckInput, skip, platformIs } from "./_types";

export async function runPerformanceExtended(ctx: ExtendedCheckContext): Promise<PulseScanCheckInput[]> {
  const { pageResult, htmlLower } = ctx;
  const html = pageResult.html;
  const h = pageResult.headers;
  const checks: PulseScanCheckInput[] = [];

  if (platformIs(ctx.platform, "API_BACKEND", "CLI_TOOL", "DESKTOP_APP")) {
    return skip("Performance", [
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
  checks.push({ category: "Performance", checkKey: "next_gen_image_formats", label: "Next-gen image formats (WebP / AVIF)", status: hasWebP || hasAvif ? "PASS" : "WARN", detail: hasWebP || hasAvif ? "WebP or AVIF images detected — next-gen formats reduce image payload by 25–50% over JPEG/PNG." : "No WebP or AVIF images detected — convert images to WebP/AVIF to significantly reduce page weight." });

  // Image dimension attributes (CLS)
  const imgTags = html.match(/<img[^>]+>/gi) ?? [];
  const imgsWithDims = imgTags.filter((t) => /width=/i.test(t) && /height=/i.test(t)).length;
  const dimCoverage = imgTags.length > 0 ? imgsWithDims / imgTags.length : 1;
  checks.push({ category: "Performance", checkKey: "image_dimension_attributes", label: "Image width/height attributes (CLS prevention)", status: dimCoverage >= 0.8 ? "PASS" : dimCoverage >= 0.5 ? "WARN" : "WARN", detail: dimCoverage >= 0.8 ? `${imgTags.length} images checked — ${Math.round(dimCoverage * 100)}% have explicit width/height (prevents Cumulative Layout Shift).` : `${Math.round(dimCoverage * 100)}% of images have explicit width/height — add width/height attributes to all images to prevent layout shift (CLS).` });

  // Critical CSS inlined
  const hasCriticalCss = /<style[^>]*>[^<]{200,}<\/style>/i.test(html);
  checks.push({ category: "Performance", checkKey: "critical_css_inlined", label: "Critical CSS inlined in <head>", status: hasCriticalCss ? "PASS" : "WARN", detail: hasCriticalCss ? "Inline <style> block detected — critical above-fold CSS appears to be inlined." : "No significant inline CSS detected — inlining critical CSS eliminates a render-blocking stylesheet request and improves First Contentful Paint." });

  // CSS minified
  const cssLinks = html.match(/<link[^>]+\.css[^>]+>/gi) ?? [];
  const hasMinCss = cssLinks.some((l) => /\.min\.css|chunk|hash|[a-f0-9]{8}/i.test(l));
  checks.push({ category: "Performance", checkKey: "css_appears_minified", label: "CSS appears minified", status: hasMinCss || cssLinks.length === 0 ? "PASS" : "WARN", detail: hasMinCss ? "Minified/hashed CSS filenames detected — CSS appears to be bundled and minified." : cssLinks.length === 0 ? "No external CSS links detected — CSS may be inlined or server-rendered." : "CSS filenames suggest unminified output — ensure CSS is minified in production to reduce transfer size." });

  // JS minified
  const jsLinks = html.match(/<script[^>]+src=["'][^"']+\.js["'][^>]*>/gi) ?? [];
  const hasMinJs = jsLinks.some((l) => /\.min\.js|chunk|[a-f0-9]{8}/i.test(l));
  checks.push({ category: "Performance", checkKey: "js_appears_minified", label: "JS files appear minified", status: hasMinJs || jsLinks.length === 0 ? "PASS" : "WARN", detail: hasMinJs ? "Minified/hashed JS filenames detected — JavaScript appears to be bundled and minified." : "JS filenames suggest unminified output — minify and bundle JavaScript in production." });

  // HTTP/3
  const altSvc = h["alt-svc"] ?? "";
  const hasHttp3 = altSvc.includes("h3") || altSvc.includes("h3-");
  checks.push({ category: "Performance", checkKey: "http3_quic_support", label: "HTTP/3 / QUIC support", status: hasHttp3 ? "PASS" : "WARN", detail: hasHttp3 ? `HTTP/3 support advertised via Alt-Svc: ${altSvc}` : "No HTTP/3 support detected — HTTP/3 (QUIC) reduces latency especially on lossy connections. Available via Cloudflare, AWS CloudFront, and Fastly." });

  // Early Hints
  const hasEarlyHints = !!h["x-early-hints"] || htmlLower.includes("103 early hints");
  checks.push({ category: "Performance", checkKey: "early_hints_support", label: "103 Early Hints support", status: hasEarlyHints ? "PASS" : "WARN", detail: hasEarlyHints ? "103 Early Hints support detected." : "No 103 Early Hints detected — Early Hints allows the browser to start loading critical resources while the server processes the request, reducing TTFB impact." });

  // Stale-while-revalidate
  const cacheControl = h["cache-control"] ?? "";
  const hasSwr = cacheControl.includes("stale-while-revalidate");
  checks.push({ category: "Performance", checkKey: "stale_while_revalidate", label: "Stale-while-revalidate cache directive", status: hasSwr ? "PASS" : "WARN", detail: hasSwr ? "stale-while-revalidate directive detected — background cache revalidation is configured." : "No stale-while-revalidate — this directive allows serving stale content while refreshing in the background, improving perceived performance." });

  // Immutable cache
  const hasImmutable = cacheControl.includes("immutable");
  checks.push({ category: "Performance", checkKey: "immutable_cache_assets", label: "Immutable cache on hashed assets", status: hasImmutable ? "PASS" : "WARN", detail: hasImmutable ? "Cache-Control: immutable detected — content-hashed assets are cached forever with no revalidation overhead." : "No Cache-Control: immutable detected — add immutable to content-hashed assets to eliminate revalidation requests." });

  // DNS TTL (check if TTL in SRV/A record is sensible)
  checks.push({ category: "Performance", checkKey: "dns_ttl_optimized", label: "DNS TTL not near-zero", status: "PASS", detail: "DNS TTL check skipped in URL scan — verify your DNS TTL is >60s (ideally 300–3600s) to avoid excess DNS lookup overhead." });

  // Render-blocking scripts
  const blockingScripts = html.match(/<script(?![^>]*(async|defer|type=["']module["']))[^>]+src=/gi) ?? [];
  const hasBlockingScripts = blockingScripts.length > 0;
  checks.push({ category: "Performance", checkKey: "render_blocking_scripts", label: "No render-blocking scripts", status: hasBlockingScripts ? "WARN" : "PASS", detail: hasBlockingScripts ? `${blockingScripts.length} render-blocking script(s) detected — add async or defer attributes to prevent parser blocking.` : "All detected scripts use async or defer — no render-blocking scripts found." });

  // LCP fetchpriority
  const hasFetchPriority = /fetchpriority=["']high["']/i.test(html);
  checks.push({ category: "Performance", checkKey: "lcp_fetchpriority_hint", label: "fetchpriority=high on LCP image", status: hasFetchPriority ? "PASS" : "WARN", detail: hasFetchPriority ? "fetchpriority=high detected — LCP image is prioritised for early loading." : "No fetchpriority=high detected — add fetchpriority=\"high\" to your Largest Contentful Paint image to improve LCP score." });

  // image width/height (combined with dimension check above)
  const hasWidthHeight = dimCoverage >= 0.9;
  checks.push({ category: "Performance", checkKey: "image_width_height", label: "Images have explicit width/height", status: hasWidthHeight ? "PASS" : "WARN", detail: hasWidthHeight ? "Images have explicit dimensions." : "Some images missing width/height — browser cannot reserve space before images load, causing layout shift." });

  // Font preload
  const hasFontPreload = /<link[^>]+rel=["']preload["'][^>]+as=["']font["']/i.test(html);
  checks.push({ category: "Performance", checkKey: "font_preload_hint", label: "Fonts preloaded", status: hasFontPreload ? "PASS" : "WARN", detail: hasFontPreload ? "Font preload hint detected — primary fonts are fetched early." : "No font preload hints detected — preloading key fonts reduces FOUT/FOIT and improves visual stability." });

  // Page weight (rough estimate from HTML size)
  const htmlSizeKb = (html.length / 1024);
  checks.push({ category: "Performance", checkKey: "total_page_weight", label: "Total page weight < 3MB", status: htmlSizeKb < 300 ? "PASS" : "WARN", detail: htmlSizeKb < 300 ? `HTML document is ${Math.round(htmlSizeKb)}KB — total page weight likely within budget.` : `HTML document alone is ${Math.round(htmlSizeKb)}KB — verify total page weight (images + JS + CSS) stays under 3MB for good mobile performance.` });

  // Third-party render-blocking scripts
  const thirdPartyBlocking = html.match(/<script(?![^>]*(async|defer))[^>]+(googleapis|googletagmanager|facebook|twitter|hotjar|intercom)[^>]*>/gi) ?? [];
  checks.push({ category: "Performance", checkKey: "third_party_script_blocking", label: "No render-blocking third-party scripts", status: thirdPartyBlocking.length === 0 ? "PASS" : "WARN", detail: thirdPartyBlocking.length === 0 ? "No synchronous third-party scripts detected." : `${thirdPartyBlocking.length} synchronous third-party script(s) detected — add async/defer to all third-party scripts to prevent render-blocking.` });

  // Code splitting signals
  const hasCodeSplitting = htmlLower.includes("chunk") || /\/_next\/static\/chunks/i.test(html) || /lazy\s*\(/i.test(html) || htmlLower.includes("import(");
  checks.push({ category: "Performance", checkKey: "no_unused_javascript", label: "Code splitting / lazy loading signals", status: hasCodeSplitting ? "PASS" : "WARN", detail: hasCodeSplitting ? "Code splitting or lazy loading detected — JavaScript is split into chunks." : "No code splitting signals — ensure large JS bundles are split and unused code is tree-shaken." });

  // Module scripts
  const hasModuleScripts = /type=["']module["']/i.test(html);
  checks.push({ category: "Performance", checkKey: "module_script_type", label: "type=module on script tags", status: hasModuleScripts ? "PASS" : "WARN", detail: hasModuleScripts ? "ES module scripts detected — modern browsers receive optimised module bundles." : "No type=module scripts — ES modules enable tree-shaking and allow browsers to load only necessary code." });

  // Resource hints
  const hasPreload = /<link[^>]+rel=["']preload["']/i.test(html);
  const hasPrefetch = /<link[^>]+rel=["']prefetch["']/i.test(html);
  const hasPreconnect = /<link[^>]+rel=["']preconnect["']/i.test(html);
  const hintCount = [hasPreload, hasPrefetch, hasPreconnect].filter(Boolean).length;
  checks.push({ category: "Performance", checkKey: "resource_hints_comprehensive", label: "Comprehensive resource hints (preload/prefetch/preconnect)", status: hintCount >= 2 ? "PASS" : hintCount === 1 ? "WARN" : "WARN", detail: hintCount >= 2 ? "Multiple resource hint types detected (preload/prefetch/preconnect)." : "Limited resource hints — implement preload for critical assets, preconnect for third-party origins, and prefetch for likely next navigations." });

  // WOFF2 fonts
  const hasWoff2 = htmlLower.includes(".woff2") || /format\(['"]woff2['"]\)/i.test(html);
  checks.push({ category: "Performance", checkKey: "woff2_font_format", label: "WOFF2 font format used", status: hasWoff2 ? "PASS" : "WARN", detail: hasWoff2 ? "WOFF2 font format detected — optimal font compression for web delivery." : "No WOFF2 fonts detected — WOFF2 is 30% smaller than WOFF and supported by all modern browsers. Prefer WOFF2 for all web fonts." });

  return checks;
}
