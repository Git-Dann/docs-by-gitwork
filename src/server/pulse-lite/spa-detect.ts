import type { PulseScanCheckInput } from "@/types/pulse";

// ── SPA / vibe-code preview detection ────────────────────────────────────────────
// Lovable / Bolt / Replit (and other client-rendered builders) serve a near-empty HTML
// shell — the content is rendered by JS in the browser. Pulse fetches raw HTML (no JS), so
// SEO/content/meta/heading checks parse an empty shell and falsely FAIL, tanking the score.
// This module detects that situation so those checks can be reclassified to INCONCLUSIVE.
//
// ⚠️ INCONCLUSIVE, not SKIPPED, and the difference is the whole point. SKIPPED means "this
// control does not apply" — it leaves the denominator, and coverage still reads 100%. But SEO
// absolutely applies to a Lovable marketing page; Pulse simply could not measure it without
// running JS. INCONCLUSIVE says exactly that: excluded from the score (so it cannot invent a
// failure) *and* counted against completeness (so the scan admits what it did not see). Using
// SKIPPED here would be the §35 disease — "we could not look" reported as "there is nothing
// there", and a 96%-coverage claim on a page whose content was never read.
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

/**
 * Checks whose *non-adverse* result is manufactured from the ABSENCE of body content, and which
 * are therefore vacuously satisfied by an empty shell. `image_alt_coverage` reports PASS ("no
 * images detected") on a page that has no images — true of a text-only page, and a lie about a
 * shell whose images had not rendered yet. These are reclassified too, which is the one case
 * where a non-failing status must be rewritten.
 */
export const VACUOUS_ON_EMPTY_SHELL_KEYS = new Set<string>(["image_alt_coverage"]);

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
 * Reclassify checks whose verdict came from parsing a body that was never rendered → INCONCLUSIVE,
 * with an explanatory detail prefix. Two families:
 *  - HTML_RENDER_DEPENDENT_CHECK_KEYS, but only where they FAILed/WARNed. A PASS there was earned
 *    from something really present in the shell (a `<title>`, an og: tag), so it stands.
 *  - VACUOUS_ON_EMPTY_SHELL_KEYS in *any* non-adverse state, because there the pass IS the absence.
 * Anything else is left untouched — notably ssl_valid, robots, privacy/terms, which are fetched
 * rather than parsed and whose failures are real on a shell.
 */
export function reclassifySpaChecks(checks: PulseScanCheckInput[]): PulseScanCheckInput[] {
  return checks.map((c) => {
    const adverse = c.status === "FAIL" || c.status === "WARN";
    const parseDependent = adverse && HTML_RENDER_DEPENDENT_CHECK_KEYS.has(c.checkKey);
    // Only PASS/NOT_APPLICABLE — a check already marked SKIPPED by a platform or jurisdiction
    // filter must stay out of the denominator; re-admitting it would overstate what was assessed.
    const vacuous =
      (c.status === "PASS" || c.status === "NOT_APPLICABLE") &&
      VACUOUS_ON_EMPTY_SHELL_KEYS.has(c.checkKey);
    if (parseDependent || vacuous) {
      return {
        ...c,
        status: "INCONCLUSIVE" as const,
        detail: c.detail ? `${SPA_SKIP_PREFIX} ${c.detail}` : SPA_SKIP_PREFIX,
      };
    }
    return c;
  });
}
