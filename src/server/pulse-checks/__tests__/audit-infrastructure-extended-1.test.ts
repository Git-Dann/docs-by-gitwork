import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/pulse-lite/url-guard", () => ({
  fetchScannableUrl: (url: string, init?: RequestInit) => fetch(url, init),
}));

import { runInfrastructureExtended, classifyCdnCaching } from "../infrastructure-extended";
import type { ExtendedCheckContext } from "../_types";

type DohAnswer = { name: string; type: number; data: string };

function doh(answers: Record<string, DohAnswer[]>) {
  return vi.fn(async (url: string | URL) => {
    const value = String(url);
    if (value.includes("cloudflare-dns.com")) {
      const parsed = new URL(value);
      const key = `${parsed.searchParams.get("name")}:${parsed.searchParams.get("type")}`;
      return new Response(JSON.stringify({ Status: 0, Answer: answers[key] ?? [] }), {
        headers: { "content-type": "application/dns-json" },
      });
    }
    return new Response("Not found", { status: 404 });
  });
}

function ctx(hostname: string, headers: Record<string, string> = {}): ExtendedCheckContext {
  const html = "<html><body>hello</body></html>";
  return {
    pageResult: { ok: true, status: 200, headers, html, responseTimeMs: 10, finalUrl: `https://${hostname}` },
    httpsUrl: `https://${hostname}`,
    hostname,
    platform: "MARKETING_SITE",
    ctx: { isPaymentEnabled: false, isAuthEnabled: false, isSaas: false, isMobileApp: false, hasBackend: true, authMethod: "unknown" },
    htmlLower: html,
    catchAll200: false,
  } as ExtendedCheckContext;
}

afterEach(() => vi.unstubAllGlobals());

describe("ipv6_dns_record — a CNAME chain is not an AAAA record", () => {
  it("WARNs on www.cbc.ca, whose AAAA answer is two CNAMEs and no address (captured 2026-10-14)", async () => {
    vi.stubGlobal("fetch", doh({
      "www.cbc.ca:AAAA": [
        { name: "www.cbc.ca", type: 5, data: "san.cbc.ca.edgekey.net." },
        { name: "san.cbc.ca.edgekey.net", type: 5, data: "e5220.e12.akamaiedge.net." },
      ],
    }));
    const checks = await runInfrastructureExtended(ctx("www.cbc.ca"));
    const check = checks.find((c) => c.checkKey === "ipv6_dns_record");
    expect(check?.status).toBe("WARN");
    expect(check?.detail).not.toMatch(/dual-stack deployment in place/);
  });

  it("still PASSes cal.com, whose AAAA answer carries real IPv6 addresses", async () => {
    vi.stubGlobal("fetch", doh({
      "cal.com:AAAA": [
        { name: "cal.com", type: 28, data: "2606:4700::6812:13e" },
        { name: "cal.com", type: 28, data: "2606:4700::6812:3e" },
      ],
    }));
    const checks = await runInfrastructureExtended(ctx("cal.com"));
    expect(checks.find((c) => c.checkKey === "ipv6_dns_record")?.status).toBe("PASS");
  });

  it("still PASSes a CNAME chain that does end in an AAAA address", async () => {
    vi.stubGlobal("fetch", doh({
      "www.example.org:AAAA": [
        { name: "www.example.org", type: 5, data: "edge.example.net." },
        { name: "edge.example.net", type: 28, data: "2a04:4e42::645" },
      ],
    }));
    const checks = await runInfrastructureExtended(ctx("www.example.org"));
    expect(checks.find((c) => c.checkKey === "ipv6_dns_record")?.status).toBe("PASS");
  });
});

describe("cdn_custom_caching_rules — Automattic's x-nc cache header", () => {
  it("PASSes wordpress.org/news, which answers `x-nc: HIT dca 1` (captured 2026-10-14)", async () => {
    expect(classifyCdnCaching({ server: "nginx", "x-nc": "HIT dca 1" }).kind).toBe("cached");
    vi.stubGlobal("fetch", doh({}));
    const checks = await runInfrastructureExtended(ctx("wordpress.org", { server: "nginx", "x-nc": "HIT dca 1" }));
    const check = checks.find((c) => c.checkKey === "cdn_custom_caching_rules");
    expect(check?.status).toBe("PASS");
    expect(check?.evidence).toBe("x-nc: HIT dca 1");
  });

  it("does not PASS an x-nc MISS — that stays INCONCLUSIVE like any other reported miss", () => {
    expect(classifyCdnCaching({ server: "nginx", "x-nc": "MISS ord 2" }).kind).toBe("uncached");
  });

  it("still WARNs github.com, whose response carries no cache header at all", async () => {
    vi.stubGlobal("fetch", doh({}));
    const checks = await runInfrastructureExtended(ctx("github.com", {
      server: "github.com",
      "cache-control": "max-age=0, private, must-revalidate",
      "x-github-request-id": "15A7:EC1C4:66B0C3:89F503:6ACFC1F1",
    }));
    expect(checks.find((c) => c.checkKey === "cdn_custom_caching_rules")?.status).toBe("WARN");
  });
});
