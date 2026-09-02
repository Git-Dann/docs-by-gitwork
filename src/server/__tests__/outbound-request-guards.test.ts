import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fetchScannableUrl, UrlNotScannableError } from "@/server/pulse-lite/url-guard";

// ─────────────────────────────────────────────────────────────────────────────
// Server-side requests to a URL a *user* supplied. Two separate hazards:
//   1. the address itself (SSRF — internal services, cloud metadata), and
//   2. what the request CARRIES, because every redirect hop reuses the headers.
// The Care analytics connector has both: the base URL is typed into a form, and
// the request holds the client's analytics bearer token.
// ─────────────────────────────────────────────────────────────────────────────

const ANALYTICS_SOURCE = readFileSync("src/server/support-analytics/types.ts", "utf8");
const CHECKS_ROUTE = readFileSync("src/app/api/settings/checks/route.ts", "utf8");

/** A lookup that answers with whatever address the test names, so no DNS is used. */
const lookupTo = (address: string) => async () => [{ address, family: 4 }];

describe("fetchScannableUrl — sameOriginRedirectsOnly", () => {
  it("refuses a cross-origin redirect when the caller opted in", async () => {
    const request = async (url: string) =>
      url.startsWith("https://api.example.com")
        ? new Response(null, { status: 302, headers: { location: "https://evil.example.net/collect" } })
        : new Response("{}", { status: 200 });

    await expect(
      fetchScannableUrl(
        "https://api.example.com/metrics",
        { headers: { Authorization: "Bearer secret" } },
        { lookup: lookupTo("93.184.216.34"), request },
        { sameOriginRedirectsOnly: true },
      ),
    ).rejects.toBeInstanceOf(UrlNotScannableError);
  });

  it("still follows a redirect that stays on the same origin", async () => {
    const request = async (url: string) =>
      url.endsWith("/metrics")
        ? new Response(null, { status: 301, headers: { location: "https://api.example.com/metrics/" } })
        : new Response(JSON.stringify({ ok: true }), { status: 200 });

    const res = await fetchScannableUrl(
      "https://api.example.com/metrics",
      {},
      { lookup: lookupTo("93.184.216.34"), request },
      { sameOriginRedirectsOnly: true },
    );
    expect(res.status).toBe(200);
  });

  it("leaves the default alone — a scan may follow a target across hosts", async () => {
    // Pulse carries no credentials and legitimately follows a redirect to another host.
    // Turning this on globally would change what every scan can reach.
    const request = async (url: string) =>
      url.startsWith("https://a.example.com")
        ? new Response(null, { status: 302, headers: { location: "https://b.example.com/" } })
        : new Response("ok", { status: 200 });

    const res = await fetchScannableUrl(
      "https://a.example.com/",
      {},
      { lookup: lookupTo("93.184.216.34"), request },
    );
    expect(res.status).toBe(200);
  });
});

describe("the Care analytics connector does not make a raw request", () => {
  // The handler body, not the file — an import line alone satisfying the assertion is the
  // false negative CLAUDE.md §42.15 records.
  const handler = ANALYTICS_SOURCE.slice(ANALYTICS_SOURCE.indexOf("export async function getJson"));

  it("routes an admin-supplied URL through the SSRF guard", () => {
    expect(handler).toContain("fetchScannableUrl(");
    expect(handler).not.toMatch(/\bawait fetch\(/);
  });

  it("refuses to carry its bearer token across a redirect", () => {
    expect(handler).toContain("sameOriginRedirectsOnly: true");
  });
});

describe("reading the check configuration needs authority", () => {
  // POST and DELETE were gated; GET asserted nothing, so any signed-in member could read
  // which controls this workspace has disabled, relabelled or downgraded.
  const handler = CHECKS_ROUTE.slice(
    CHECKS_ROUTE.indexOf("export async function GET"),
    CHECKS_ROUTE.indexOf("const saveSchema"),
  );

  it("gates GET before it reads anything", () => {
    expect(handler).toContain("canViewCheckConfig");
    expect(handler.indexOf("assertCan(")).toBeLessThan(handler.indexOf("listCheckConfigs("));
  });

  it("does not gate the read harder than the page that renders it", () => {
    // Settings → Checks is gated on the `settings.agents` matrix permission, which a Super
    // Admin can grant to staff. An admin-only API behind it would render as a broken panel
    // for exactly the people the grant was made for. Writes stay admin-only.
    expect(handler).not.toContain("assertAtLeastAdmin");
    expect(CHECKS_ROUTE.slice(CHECKS_ROUTE.indexOf("export async function POST")))
      .toContain("assertAtLeastAdmin");
  });
});
