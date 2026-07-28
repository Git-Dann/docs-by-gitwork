import type { MetadataRoute } from "next";

const BASE = "https://foundry.gitwork.co.uk";

/**
 * Sitemap for foundry.gitwork.co.uk.
 *
 * Short by design. This host is the platform, not the marketing site — the agency
 * pages that used to live here were removed in favour of gitwork.co.uk, which owns
 * that content. What remains is the landing page and the two genuinely public
 * product surfaces.
 *
 * Every route absent from this list is absent on purpose: session-gated (/app,
 * /deck, /edge), token-gated (/docs, /report, /sign, /onboarding, /timeline,
 * /brand, /wiki, /vet), deliberately unsearchable (/demo), or an auth entry point.
 * Keep this in sync with the disallow list in robots.ts — a URL should never be in
 * both.
 *
 * `lastModified` is deploy time rather than a hardcoded date, so it stays honest
 * without anyone having to remember to bump it.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return [
    // NOTE: "/" is deliberately absent. It 307s to /portal/login, which is noindex —
    // listing a redirect in a sitemap is a soft error, and listing a noindex
    // destination contradicts itself. /pulse-overview is the primary indexable page.
    {
      url: `${BASE}/pulse-overview`,
      lastModified,
      changeFrequency: "monthly",
      priority: 1,
    },
    {
      url: `${BASE}/api-docs`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.5,
    },
  ];
}
