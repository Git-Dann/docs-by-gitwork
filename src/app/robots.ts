import type { MetadataRoute } from "next";

/**
 * Crawl directives for foundry.gitwork.co.uk.
 *
 * gitwork.co.uk is the marketing site. This host is the platform: a small number of
 * genuinely public product pages, and everything else either behind a session or behind
 * a URL token. Until now there was no robots.txt at all (a live 404), so crawlers were
 * free to walk the whole estate.
 *
 * Two layers, deliberately: the token-gated client pages already send `noindex` from
 * their own metadata — this stops a crawler spending budget reaching them in the first
 * place. Listing a prefix here discloses nothing, since the secret is the token, not
 * the path shape.
 *
 * `Disallow` is not an access control. It is a request, honoured by the major engines
 * and ignored by anything hostile — auth and the tokens are what actually protect these
 * routes (src/middleware.ts).
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          // The platform itself, plus the Deck editor shell (session-gated).
          "/app",
          "/deck",
          "/edge",
          // API surface. Gated by API_KEY, but there is nothing here to crawl.
          "/api/",
          // Sales demos: deliberately public so a link can be shared, deliberately
          // unsearchable so a prospect's white-labelled demo never ranks.
          "/demo",
          // Client deliverables — the URL token is the only credential.
          "/docs/",
          "/report/",
          // Free public scan results. Shareable by whoever ran the scan, but not
          // crawlable: publishing a named third party's score needs an explicit
          // consent step and a takedown path, neither of which exists yet.
          "/scan/",
          "/countermark/",
          "/sign/",
          "/onboarding/",
          "/timeline/",
          "/brand/",
          "/wiki/",
          "/vet/",
          "/invite/",
          "/apply",
          // Auth entry points. Nothing to index, and a login page ranking for the
          // brand is worse than nothing.
          "/login",
          "/portal/login",
          "/forgot-password",
          "/oauth/",
          // The embeddable Pulse widget is meant to be framed by gitwork.co.uk, not
          // indexed on its own — /pulse-overview is the page that should rank.
          "/embed/",
          // Internal-only surfaces.
          "/download",
          "/context",
          "/provenance-overview",
          // Tombstone for pre-token document links.
          "/preview/",
        ],
      },
    ],
    sitemap: "https://foundry.gitwork.co.uk/sitemap.xml",
    host: "https://foundry.gitwork.co.uk",
  };
}
