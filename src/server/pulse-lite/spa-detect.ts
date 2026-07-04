import type { PulseScanCheckInput } from "@/types/pulse";

// ── SPA / vibe-code preview detection ────────────────────────────────────────────
// Lovable / Bolt / Replit (and other client-rendered builders) serve a near-empty HTML
// shell — the content is rendered by JS in the browser. Pulse fetches raw HTML (no JS), so
// SEO/content/meta/heading checks parse an empty shell and falsely FAIL, tanking the score.
// This module detects that situation so those checks can be reclassified to SKIPPED (which
// score-breakdown.ts excludes from the denominator) instead of counted as failures.
//
// Pure + dependency-free (only a type import) so it's cheap to unit-test and has no import
// cycle with the check modules. `builder` is passed in by the caller (from detectAiBuilder).

// Builders whose output is client-rendered (empty static shell) — always treat as SPA even
// if the shell heuristic is borderline. SSR/site builders (Framer/Webflow/Wix/Squarespace)
// are deliberately excluded: their HTML has real content, so their SEO checks are valid.
const CLIENT_RENDERED_BUILDERS = new Set([
  "Lovable",
  "Bolt (StackBlitz)",
  "v0 (Vercel)",
  "Replit",
  "Bubble",
  "Softr",
  "Glide",
]);

/** Checks that parse the page's HTML body/head and therefore fail falsely on an empty SPA
 * shell. HTTP-fetched checks (robots/sitemap/SSL/privacy/terms) are deliberately excluded so
 * their real failures — and the SSL/privacy/terms hard caps — still fire. */
export const HTML_RENDER_DEPENDENT_CHECK_KEYS = new Set<string>([
  // core SEO/content (pulse-scan.ts runUrlChecks)
  "meta_title",
  "meta_description",
  "og_tags",
  "canonical_url",
  "h1_present",
  "og_image",
  "twitter_card",
  "structured_data",
  "has_word_count",
  "has_heading_hierarchy",
  "internal_links_present",
  "no_broken_inline_scripts",
  // AI answer-engine optimisation (ai-aeo.ts)
  "aeo_content_server_rendered",
  "aeo_semantic_html",
  "aeo_structured_data_valid",
  "aeo_content_feed",
  // extended schema / head parsers (seo-extended.ts)
  "faqpage_schema",
  "product_schema",
  "organization_schema",
  "article_schema",
  "review_schema",
  "breadcrumb_schema",
  "local_business_schema",
  "pagination_rel_links",
  "canonical_self_referencing",
  "google_business_profile",
  "bing_webmaster_verified",
  "internal_link_depth",
]);

const SPA_SKIP_PREFIX =
  "Not assessable — client-rendered SPA/preview (content is JS-rendered, not in the static HTML).";

/** Visible-text word count of the static HTML, ignoring script/style and tags. */
export function staticTextWordCount(html: string): number {
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ");
  return stripped.split(/\s+/).filter((w) => w.length > 1).length;
}

/** True when the static HTML is an app shell with almost no server-rendered text. */
export function isEmptyShell(html: string): boolean {
  const head = html.trimStart().slice(0, 4000).toLowerCase();
  const hasShellMarker =
    head.includes('id="root"') ||
    head.includes('id="__next"') ||
    head.includes('id="app"') ||
    head.includes("__next_data__");
  // A content-rich SSR page (Next/Nuxt) also has these markers, so require low text too.
  return hasShellMarker && staticTextWordCount(html) < 100;
}

/**
 * Decide whether a page is a client-rendered SPA / vibe-code preview whose static HTML can't
 * be assessed for SEO/content. `builder` comes from detectAiBuilder (host + HTML fingerprint).
 */
export function detectSpaContext(input: {
  builder: string | null;
  html: string;
  contentType?: string;
}): { isSpa: boolean } {
  const clientRendered = input.builder !== null && CLIENT_RENDERED_BUILDERS.has(input.builder);
  return { isSpa: clientRendered || isEmptyShell(input.html) };
}

/**
 * Reclassify HTML-parse-dependent checks that FAILed/WARNed only because the static HTML is an
 * empty SPA shell → SKIPPED (excluded from the score), with an explanatory detail prefix.
 * PASS checks and any check not in the set are left untouched.
 */
export function reclassifySpaChecks(checks: PulseScanCheckInput[]): PulseScanCheckInput[] {
  return checks.map((c) => {
    if (
      (c.status === "FAIL" || c.status === "WARN") &&
      HTML_RENDER_DEPENDENT_CHECK_KEYS.has(c.checkKey)
    ) {
      return {
        ...c,
        status: "SKIPPED" as const,
        detail: c.detail ? `${SPA_SKIP_PREFIX} ${c.detail}` : SPA_SKIP_PREFIX,
      };
    }
    return c;
  });
}
