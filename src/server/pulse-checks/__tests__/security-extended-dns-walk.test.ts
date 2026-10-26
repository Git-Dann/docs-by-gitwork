import { afterEach, describe, expect, it, vi } from "vitest";

// Mock at the transport boundary so the real resolveDnsRecord / fetchWithTimeout run.
vi.mock("@/server/pulse-lite/url-guard", () => ({
  fetchScannableUrl: (url: string, init?: RequestInit) => fetch(url, init),
}));

import type { ExtendedCheckContext } from "../_types";
import { isBotManagementCookie, resolveDnssecZone, runSecurityExtended } from "../security-extended";

// ─────────────────────────────────────────────────────────────────────────────
// CAA, DNSSEC, bot protection and frame-ancestors, against the shapes the live
// audit observed (October 2026). Every case is two-sided: the input that used to
// produce a false finding, and a representative correct input that must keep it.
// ─────────────────────────────────────────────────────────────────────────────

const DNS = "cloudflare-dns.com";

type Rr = { name: string; type: number; data: string };
const DS = 43, SOA = 6, CNAME = 5, CAA = 257;

/**
 * DoH responder keyed on `name:TYPE`. Records carry their own owner name and
 * numeric type, as Cloudflare's JSON API really does — that is what lets a
 * CNAME-chased SOA (owned by the target) be told apart from the name's own SOA.
 */
function doh(zone: Record<string, Rr[]>, fail: Record<string, number | "throw"> = {}) {
  return vi.fn(async (url: string | URL) => {
    const value = String(url);
    if (!value.includes(DNS)) return new Response("Not found", { status: 404, headers: { "content-type": "text/plain" } });
    const params = new URL(value).searchParams;
    const key = `${params.get("name")}:${params.get("type")}`;
    const failure = fail[key];
    if (failure === "throw") throw new Error("ECONNRESET");
    if (typeof failure === "number") {
      return new Response(JSON.stringify({ Status: failure, Answer: [] }), { headers: { "content-type": "application/dns-json" } });
    }
    return new Response(JSON.stringify({ Status: 0, Answer: zone[key] ?? [] }), { headers: { "content-type": "application/dns-json" } });
  });
}

function soa(owner: string): Rr {
  return { name: `${owner}.`, type: SOA, data: `ns1.${owner}. hostmaster.${owner}. 1 7200 3600 1209600 300` };
}

function context(hostname: string, headers: Record<string, string> = {}, html = "<html><body>hello</body></html>"): ExtendedCheckContext {
  return {
    pageResult: { ok: true, status: 200, headers, html, responseTimeMs: 10, finalUrl: `https://${hostname}` },
    httpsUrl: `https://${hostname}`,
    hostname,
    platform: "WEB_APP",
    ctx: { isPaymentEnabled: false, isAuthEnabled: false, isSaas: false, isMobileApp: false, hasBackend: true, authMethod: "unknown" },
    htmlLower: html.toLowerCase(),
    catchAll200: false,
  };
}

const find = (checks: { checkKey: string; status: string; detail?: string }[], key: string) =>
  checks.find((check) => check.checkKey === key);

afterEach(() => vi.unstubAllGlobals());

describe("DNSSEC — asked of the zone that serves the host", () => {
  it("PASSes www.example.com when example.com is signed (no DS exists at a non-cut name)", async () => {
    vi.stubGlobal("fetch", doh({
      "example.com:DS": [{ name: "example.com.", type: DS, data: "2371 13 2 ABCDEF" }],
      "example.com:SOA": [soa("example.com")],
    }));
    const result = await resolveDnssecZone("www.example.com");
    expect(result).toEqual({ ok: true, signed: true, zone: "example.com" });
    const check = find(await runSecurityExtended(context("www.example.com")), "dnssec_enabled");
    expect(check?.status).toBe("PASS");
    expect(check?.detail).toContain("example.com");
  });

  it("does NOT jump to gov.uk for www.hmrc.gov.uk — hmrc.gov.uk is its own unsigned zone", async () => {
    // Live DoH (2026-10): gov.uk has DS 695 8 2 …; hmrc.gov.uk is a delegated Route53
    // zone with no DS. The SOA query for www.hmrc.gov.uk follows its CNAME and returns
    // hmrc.gov.uk's SOA — owned by hmrc.gov.uk, not by the name asked.
    vi.stubGlobal("fetch", doh({
      "www.hmrc.gov.uk:SOA": [{ name: "www.hmrc.gov.uk.", type: CNAME, data: "hmrc.gov.uk." }, soa("hmrc.gov.uk")],
      "hmrc.gov.uk:SOA": [soa("hmrc.gov.uk")],
      "gov.uk:DS": [{ name: "gov.uk.", type: DS, data: "695 8 2 0123456789" }],
      "gov.uk:SOA": [soa("gov.uk")],
    }));
    expect(await resolveDnssecZone("www.hmrc.gov.uk")).toEqual({ ok: true, signed: false, zone: "hmrc.gov.uk" });
    // hmrc.gov.uk's own (unsigned) zone decides, not gov.uk's DS. Unsigned is NOT_APPLICABLE, not PASS.
    const check = find(await runSecurityExtended(context("www.hmrc.gov.uk")), "dnssec_enabled");
    expect(check?.status).toBe("NOT_APPLICABLE");
  });

  it("a CNAME'd www whose target is the signed apex still PASSes (owner name, not type, decides)", async () => {
    vi.stubGlobal("fetch", doh({
      "www.example.com:SOA": [{ name: "www.example.com.", type: CNAME, data: "example.com." }, soa("example.com")],
      "example.com:DS": [{ name: "example.com.", type: DS, data: "2371 13 2 ABCDEF" }],
    }));
    expect(await resolveDnssecZone("www.example.com")).toEqual({ ok: true, signed: true, zone: "example.com" });
  });

  it("does not PASS an unsigned apex (figma.com shape) or an unsigned www under it", async () => {
    vi.stubGlobal("fetch", doh({ "figma.com:SOA": [soa("figma.com")] }));
    expect(find(await runSecurityExtended(context("figma.com")), "dnssec_enabled")?.status).toBe("NOT_APPLICABLE");
    expect(find(await runSecurityExtended(context("www.figma.com")), "dnssec_enabled")?.status).toBe("NOT_APPLICABLE");
  });

  it("a DS chased through a CNAME to SOMEONE ELSE'S signed apex does not make an unsigned zone PASS", async () => {
    // www.shop.example CNAMEs to signed-host.net; the resolver chases the DS query and
    // returns signed-host.net's DS. shop.example itself is an unsigned apex.
    vi.stubGlobal("fetch", doh({
      "www.shop.example.com:DS": [
        { name: "www.shop.example.com.", type: CNAME, data: "signed-host.net." },
        { name: "signed-host.net.", type: DS, data: "1 13 2 FEED" },
      ],
      "www.shop.example.com:SOA": [{ name: "www.shop.example.com.", type: CNAME, data: "signed-host.net." }, soa("signed-host.net")],
      "shop.example.com:SOA": [soa("shop.example.com")],
    }));
    expect(await resolveDnssecZone("www.shop.example.com")).toEqual({ ok: true, signed: false, zone: "shop.example.com" });
  });

  it("a DS owned by the scanned name itself (a delegated, signed subzone) still PASSes", async () => {
    vi.stubGlobal("fetch", doh({ "app.example.com:DS": [{ name: "app.example.com.", type: DS, data: "9 13 2 BEEF" }] }));
    expect(await resolveDnssecZone("app.example.com")).toEqual({ ok: true, signed: true, zone: "app.example.com" });
  });

  it("a host deeper than the walk cap still reaches its registrable domain", async () => {
    const host = "a.b.c.d.e.f.g.h.i.example.com";
    vi.stubGlobal("fetch", doh({ "example.com:DS": [{ name: "example.com.", type: DS, data: "2371 13 2 ABCDEF" }] }));
    expect(await resolveDnssecZone(host)).toEqual({ ok: true, signed: true, zone: "example.com" });
  });

  it("a failed SOA lookup on the way up is INCONCLUSIVE, never a WARN or PASS", async () => {
    vi.stubGlobal("fetch", doh(
      { "example.com:DS": [{ name: "example.com.", type: DS, data: "2371 13 2 ABCDEF" }] },
      { "www.example.com:SOA": 2 },
    ));
    const check = find(await runSecurityExtended(context("www.example.com")), "dnssec_enabled");
    expect(check?.status).toBe("INCONCLUSIVE");
  });

  it("a failed parent DS lookup is INCONCLUSIVE", async () => {
    vi.stubGlobal("fetch", doh({}, { "example.com:DS": "throw" }));
    expect(find(await runSecurityExtended(context("www.example.com")), "dnssec_enabled")?.status).toBe("INCONCLUSIVE");
  });
});

describe("CAA — climbs like a CA does (RFC 8659 §3)", () => {
  it("PASSes www.flipkart.com, restricted by flipkart.com's CAA", async () => {
    vi.stubGlobal("fetch", doh({ "flipkart.com:CAA": [{ name: "flipkart.com.", type: CAA, data: '0 issue "digicert.com"' }] }));
    const check = find(await runSecurityExtended(context("www.flipkart.com")), "caa_dns_record");
    expect(check?.status).toBe("PASS");
    expect(check?.detail).toContain("on flipkart.com");
  });

  it("still WARNs when no name on the way up publishes CAA (gitwork.co.uk)", async () => {
    vi.stubGlobal("fetch", doh({}));
    expect(find(await runSecurityExtended(context("www.gitwork.co.uk")), "caa_dns_record")?.status).toBe("WARN");
  });

  it("a bare CNAME in the CAA answer is not a CAA record (www.theguardian.com)", async () => {
    vi.stubGlobal("fetch", doh({ "www.theguardian.com:CAA": [{ name: "www.theguardian.com.", type: CNAME, data: "guardian.map.fastly.net." }] }));
    expect(find(await runSecurityExtended(context("www.theguardian.com")), "caa_dns_record")?.status).toBe("WARN");
  });
});

describe("bot protection — the cookie the service sets", () => {
  it("PASSes cal.com, which sets Cloudflare's __cf_bm", async () => {
    vi.stubGlobal("fetch", doh({}));
    const checks = await runSecurityExtended(context("cal.com", {
      "set-cookie": "__cf_bm=abc.123-1760000000-1.0.1.1-xyz; path=/; expires=Tue, 14 Oct 2026 12:30:00 GMT; domain=.cal.com; HttpOnly; Secure; SameSite=None",
    }));
    const check = find(checks, "bot_protection_present");
    expect(check?.status).toBe("PASS");
    expect(check?.detail).toContain("__cf_bm");
  });

  it("does not PASS a response with only analytics/session cookies and no captcha markup", async () => {
    vi.stubGlobal("fetch", doh({}));
    const checks = await runSecurityExtended(context("supabase.com", { "set-cookie": "_ga=GA1.1.1; Path=/, sessionid=x; Path=/; HttpOnly" }));
    // Bot management is optional: unseen reads NOT_APPLICABLE, never PASS.
    expect(find(checks, "bot_protection_present")?.status).toBe("NOT_APPLICABLE");
  });

  it("matches exact cookie names only", () => {
    for (const name of ["__cf_bm", "cf_clearance", "ak_bmsc", "_abck", "_px3", "_pxhd", "datadome"]) expect(isBotManagementCookie(name), name).toBe(true);
    for (const name of ["_pxhd_extra", "my__cf_bm", "abck", "_ga", "sessionid"]) expect(isBotManagementCookie(name), name).toBe(false);
  });
});

describe("frame-ancestors — X-Frame-Options already restricts framing", () => {
  const csp = "default-src 'self'; script-src 'self'";

  it("is not a finding when XFO is DENY (developer.mozilla.org) or SAMEORIGIN (theguardian.com)", async () => {
    vi.stubGlobal("fetch", doh({}));
    for (const xfo of ["DENY", "SAMEORIGIN", " sameorigin "]) {
      const check = find(await runSecurityExtended(context("example.com", { "content-security-policy": csp, "x-frame-options": xfo })), "csp_frame_ancestors");
      expect(check?.status, xfo).toBe("SKIPPED");
    }
  });

  it("still WARNs with no XFO, an ALLOW-FROM (ignored by browsers), or a conflicting joined value", async () => {
    vi.stubGlobal("fetch", doh({}));
    for (const xfo of [undefined, "ALLOW-FROM https://a.example", "DENY, SAMEORIGIN", "garbage"]) {
      const headers: Record<string, string> = { "content-security-policy": csp };
      if (xfo !== undefined) headers["x-frame-options"] = xfo;
      expect(find(await runSecurityExtended(context("example.com", headers)), "csp_frame_ancestors")?.status, String(xfo)).toBe("WARN");
    }
  });
});
