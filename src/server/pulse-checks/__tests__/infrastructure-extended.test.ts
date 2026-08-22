import { afterEach, describe, expect, it, vi } from "vitest";

// Mock at the transport boundary, not at `_types`, so the real `resolveDnsRecord`
// runs and the NAMES it asks for are observable. The whole of item 5 is a bug in
// the query name, so a test that stubs `resolveDnsRecord` itself cannot see it.
vi.mock("@/server/pulse-lite/url-guard", () => ({
  fetchScannableUrl: (url: string, init?: RequestInit) => fetch(url, init),
}));

import {
  runInfrastructureExtended,
  detectIntermediary,
  planWwwPair,
  classifyCdnCaching,
} from "../infrastructure-extended";
import type { ExtendedCheckContext } from "../_types";
import { analyzeHost } from "@/server/pulse-lite/registrable-domain";
import { CHECKS_REGISTRY } from "@/server/checks-registry";
import { CATEGORIES } from "../categories";
import { triage } from "@/server/pulse-lite/public-scan";

// ─────────────────────────────────────────────────────────────────────────────
// FIXTURES ARE REAL, CAPTURED RESPONSES — not header sets invented alongside the
// rule they are testing.
//
// Every set below was taken with `curl -sS -o /dev/null -D -` against the six
// sites in the false-positive audit corpus on 2026-08-22, which is why they can
// discriminate: `real-corpus.test.ts` records the same lesson one layer down
// ("fixtures agree with their author by construction"), and §34.3 records it
// again ("the unit tests passed while the checks were wrong").
//
// The Hacker News set is the most valuable one in the file. It is simultaneously:
//   • the plan's VERIFIED-CORRECT case — `news.ycombinator.com` genuinely has no
//     CDN (single A record, one US colo, no CNAME), so a CDN verdict must still
//     fire on it, and
//   • a live instance of the defect item 6 names — its Content-Security-Policy
//     allow-lists `https://cdnjs.cloudflare.com/` for a third-party script, so
//     the old `/cloudflare|nginx|…/.test(JSON.stringify(headers))` rule PASSed
//     "load balancer detected" on the strength of a CSP entry.
// ─────────────────────────────────────────────────────────────────────────────

/** news.ycombinator.com — nginx origin, no CDN, "cloudflare" only inside the CSP. */
const HN_HEADERS: Record<string, string> = {
  server: "nginx",
  "content-type": "text/html; charset=utf-8",
  vary: "Accept-Encoding",
  "cache-control": "private; max-age=0",
  "x-frame-options": "DENY",
  "x-content-type-options": "nosniff",
  "referrer-policy": "origin",
  "strict-transport-security": "max-age=31556900",
  "content-security-policy":
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/ https://cdnjs.cloudflare.com/; frame-ancestors 'self'",
};

/** gitwork.co.uk — Netlify edge, answering the RFC 9211 header the old list missed. */
const GITWORK_HEADERS: Record<string, string> = {
  age: "3433",
  "cache-status": '"Netlify Edge"; hit; ttl=31532567',
  server: "Netlify",
  "x-nf-request-id": "01M0MFY2YTBFPG6YY1XS9X48GE",
};

/** vercel.com — multi-hop edge, reported as having no load balancer. */
const VERCEL_HEADERS: Record<string, string> = {
  age: "105",
  server: "Vercel",
  "x-vercel-cache": "HIT",
  "x-vercel-id": "lhr1::iad1::xcs6r-1787394198602-77b97513dafe",
};

/** www.gov.uk — Fastly anycast: two Via hops and a named POP. */
const GOVUK_HEADERS: Record<string, string> = {
  server: "nginx",
  via: "1.1 router, 1.1 varnish",
  "fastly-backend-name": "origin",
  age: "12",
  "x-served-by": "cache-lcy-egml8630070-LCY",
  "x-cache": "HIT",
  "x-cache-hits": "1",
};

/** developer.mozilla.org — three Varnish tiers across two POPs in one response. */
const MDN_HEADERS: Record<string, string> = {
  via: "1.1 google, 1.1 varnish, 1.1 varnish, 1.1 varnish",
  server: "Google Frontend",
  age: "2263",
  "x-served-by": "cache-par-lfpb1150054-PAR, cache-par-lfpb1150054-PAR, cache-lcy-egml8630063-LCY",
  "x-cache": "MISS, MISS, HIT",
};

const DNS = "cloudflare-dns.com";

function context(overrides: Partial<ExtendedCheckContext> = {}): ExtendedCheckContext {
  const html = "<html><body>hello</body></html>";
  return {
    pageResult: { ok: true, status: 200, headers: {}, html, responseTimeMs: 10, finalUrl: "https://example.test" },
    httpsUrl: "https://example.test",
    hostname: "example.test",
    platform: "WEB_APP",
    ctx: { isPaymentEnabled: false, isAuthEnabled: false, isSaas: false, isMobileApp: false, hasBackend: true, authMethod: "unknown" },
    htmlLower: html.toLowerCase(),
    catchAll200: false,
    ...overrides,
  };
}

/** A context whose page body and headers are both set explicitly. */
function pageContext(hostname: string, headers: Record<string, string>, html = "<html><body>hello</body></html>") {
  return context({
    hostname,
    httpsUrl: `https://${hostname}`,
    htmlLower: html.toLowerCase(),
    pageResult: { ok: true, status: 200, headers, html, responseTimeMs: 10, finalUrl: `https://${hostname}` },
  });
}

type Check = { checkKey: string; status: string; detail?: string; evidence?: string; confidence?: string };
const find = (checks: Check[], key: string) => checks.find((c) => c.checkKey === key);
const statusOf = (checks: Check[], key: string) => find(checks, key)?.status;
const detailOf = (checks: Check[], key: string) => find(checks, key)?.detail ?? "";

/**
 * A DoH stub that also RECORDS every name it was asked for, so a test can assert
 * that `www.www.gov.uk` was never queried at all.
 */
function dnsRecorder(answers: Record<string, string[]>, behaviour: "ok" | "throw" = "ok") {
  const asked: string[] = [];
  const fetchMock = vi.fn(async (url: string | URL) => {
    const value = String(url);
    if (value.includes(DNS)) {
      if (behaviour === "throw") throw new Error("ECONNRESET");
      const parsed = new URL(value);
      const name = parsed.searchParams.get("name") ?? "";
      const type = parsed.searchParams.get("type") ?? "";
      asked.push(`${name}:${type}`);
      const records = answers[`${name}:${type}`] ?? [];
      return new Response(JSON.stringify({ Answer: records.map((data) => ({ data })) }), {
        headers: { "content-type": "application/dns-json" },
      });
    }
    return new Response("Not found", { status: 404, headers: { "content-type": "text/plain" } });
  });
  return { fetchMock, asked };
}

afterEach(() => vi.unstubAllGlobals());

// ─────────────────────────────────────────────────────────────────────────────
// ITEM 6 — an intermediary is proved by standards-defined headers, and a regex
// over `JSON.stringify(headers)` is not a measurement of anything.
// ─────────────────────────────────────────────────────────────────────────────

describe("detectIntermediary reads the standard before the vendor", () => {
  it("prefers RFC 9211 Cache-Status over the vendor request-id on the same response", () => {
    // The old CDN list carried the LEGACY `x-cache` but not `cache-status`, so a
    // CDN that migrated to the RFC header was invisible. gitwork.co.uk answers
    // the RFC header and was told it had no CDN and no load balancer.
    expect(detectIntermediary(GITWORK_HEADERS)).toEqual({
      header: "cache-status",
      value: '"Netlify Edge"; hit; ttl=31532567',
      basis: "standard",
    });
  });

  it("detects a Vercel edge from its request id", () => {
    const signal = detectIntermediary(VERCEL_HEADERS);
    expect(signal?.basis).toBe("standard");
    expect(signal?.header).toBe("x-vercel-id");
  });

  it("detects Fastly's Via chain on www.gov.uk", () => {
    expect(detectIntermediary(GOVUK_HEADERS)).toMatchObject({ header: "via", basis: "standard" });
  });

  it("detects MDN's three Varnish hops", () => {
    expect(detectIntermediary(MDN_HEADERS)).toMatchObject({ header: "via", basis: "standard" });
  });

  it("treats a bare RFC 9111 Age as proof of a shared cache", () => {
    // Age is, by definition, generated by a shared cache — so a response
    // carrying one passed through an intermediary even with no vendor header.
    expect(detectIntermediary({ age: "317" })).toEqual({ header: "age", value: "317", basis: "standard" });
    expect(detectIntermediary({ age: "0" })?.basis).toBe("standard");
  });

  it("does not accept a malformed Age as evidence", () => {
    expect(detectIntermediary({ age: "soon" })).toBeNull();
    expect(detectIntermediary({ age: "" })).toBeNull();
  });

  it("ignores an empty header value", () => {
    expect(detectIntermediary({ via: "", "cache-status": "   " })).toBeNull();
  });

  // ── The JSON.stringify regression, in the three shapes it really occurs ──
  it("does not conclude 'load balancer' from a product name inside a CSP allow-list", () => {
    const cspOnly = { "content-security-policy": HN_HEADERS["content-security-policy"] };
    // `/cloudflare|nginx|…/.test(JSON.stringify(headers))` matched here.
    expect(detectIntermediary(cspOnly)).toBeNull();
  });

  it("does not conclude 'load balancer' from a Report-To endpoint on a vendor domain", () => {
    expect(detectIntermediary({
      "report-to": '{"group":"csp","endpoints":[{"url":"https://x.cloudflare.com/report"}]}',
    })).toBeNull();
  });

  it("does not conclude 'load balancer' from a product name in an asset URL", () => {
    expect(detectIntermediary({ link: "</assets/nginx-logo.svg>; rel=preload; as=image" })).toBeNull();
  });

  it("does not treat a header NAME as evidence — only values are read", () => {
    expect(detectIntermediary({ "x-nginx-upstream-hint": "1" })).toBeNull();
  });

  // ── The verified-correct case the fix must not break ──
  it("grades news.ycombinator.com's nginx as ambiguous, never as proof", () => {
    // The plan names `cdn_detected` on this host as VERIFIED CORRECT — there is
    // genuinely no CDN. `server: nginx` is the only intermediary-ish signal in
    // the whole response, and nginx is equally an ordinary origin web server, so
    // it must come back as the `ambiguous-server` tier. A CDN check built on this
    // helper reads `basis === "standard"` and therefore still fires here.
    const signal = detectIntermediary(HN_HEADERS);
    expect(signal).toEqual({ header: "server", value: "nginx", basis: "ambiguous-server" });
    expect(signal?.basis).not.toBe("standard");
  });

  // ── SECOND PASS: the `Server` tier was too wide, and a PASS is a claim ──
  //
  // Reviewer's exact inputs. Each of these previously WARNed (none matched the
  // pre-audit `/cloudflare|nginx|haproxy|aws.*elb|alb.*upstream|load.balanc/`
  // regex) and pass one turned every one of them into "Load balancer / reverse
  // proxy detected — PASS". LiteSpeed and Caddy are ordinary origin web servers,
  // openresty is nginx with Lua, and Artifactory is a binary repository manager
  // that is not a proxy at all.
  it("does not treat a dual-role web server as proof of a separate tier", () => {
    for (const value of ["LiteSpeed", "Caddy", "openresty/1.21.4", "nginx/1.24.0 (Ubuntu)", "Tengine/2.3.3"]) {
      const signal = detectIntermediary({ server: value });
      expect(signal?.basis, value).toBe("ambiguous-server");
      expect(signal?.basis, value).not.toBe("edge-product");
    }
  });

  it("does not classify a binary repository manager as an intermediary at all", () => {
    // `server: Artifactory/7.0` — JFrog Artifactory is not a proxy in any
    // deployment, so it must not appear in either fingerprint tier.
    expect(detectIntermediary({ server: "Artifactory/7.0" })).toBeNull();
  });

  it("keeps software that is only ever an intermediary in the edge tier", () => {
    for (const value of ["cloudflare", "Vercel", "Netlify", "AmazonS3 via awselb/2.0", "haproxy", "envoy", "Varnish", "squid/5.7"]) {
      expect(detectIntermediary({ server: value })?.basis, value).toBe("edge-product");
    }
  });

  it("reads a named edge ahead of the dual-role name it contains", () => {
    // Cloudflare's own historic value. Matching the dual-role list first would
    // downgrade a real edge to "ambiguous".
    expect(detectIntermediary({ server: "cloudflare-nginx" })?.basis).toBe("edge-product");
  });

  it("finds no standards-defined intermediary on news.ycombinator.com at all", () => {
    const withoutServer = { ...HN_HEADERS };
    delete withoutServer.server;
    expect(detectIntermediary(withoutServer)).toBeNull();
  });
});

describe("load_balancer_detected reports what it actually saw", () => {
  it("PASSes gitwork.co.uk and quotes the header as evidence", async () => {
    vi.stubGlobal("fetch", dnsRecorder({}).fetchMock);
    const checks = await runInfrastructureExtended(pageContext("gitwork.co.uk", GITWORK_HEADERS));
    const check = find(checks, "load_balancer_detected");
    expect(check?.status).toBe("PASS");
    expect(check?.evidence).toContain("Netlify Edge");
    // `load_balancer_detected` is in confidence.ts's ABSENCE_DERIVED_KEYS, which
    // floors the KEY to MEDIUM because its adverse verdict is absence-derived.
    // This verdict was read off a header, so the module declares HIGH on the
    // observed branch — the escape hatch confidence.ts documents. Without it a
    // site that demonstrably has an edge tier is credited as a heuristic.
    expect(check?.confidence).toBe("HIGH");
  });

  it("PASSes vercel.com, which was told it had no load balancer", async () => {
    vi.stubGlobal("fetch", dnsRecorder({}).fetchMock);
    const checks = await runInfrastructureExtended(pageContext("vercel.com", VERCEL_HEADERS));
    expect(statusOf(checks, "load_balancer_detected")).toBe("PASS");
  });

  // ⚠️ CHANGED IN THE SECOND PASS, ON MERIT — this test previously asserted
  // `PASS` + MEDIUM here. It was written to pin pass one's behaviour, and pass
  // one's behaviour is the false negative: `server: nginx` is the whole of the
  // evidence, and news.ycombinator.com runs its Arc application behind nginx on
  // its own single colo box, so "Load balancer / reverse proxy detected — PASS"
  // is a claim the response does not support. WARN is not available either (it
  // would accuse every genuine nginx edge tier), so the check declines. The old
  // expectation is retained inline as the thing that must NOT come back.
  it("does not PASS an nginx origin — it declines, because one response cannot tell", async () => {
    vi.stubGlobal("fetch", dnsRecorder({}).fetchMock);
    const checks = await runInfrastructureExtended(pageContext("news.ycombinator.com", HN_HEADERS));
    const check = find(checks, "load_balancer_detected");
    expect(check?.status).toBe("INCONCLUSIVE");
    expect(check?.status).not.toBe("PASS");
    expect(check?.detail).toMatch(/Not established/);
    expect(check?.detail).toMatch(/single web server on one box/);
    expect(check?.evidence).toBe("server: nginx");
  });

  // The reviewer's five exact inputs, end to end through the check rather than
  // through the helper, because the verdict is what the customer reads.
  it("does not report a load balancer for an ordinary origin web server", async () => {
    for (const server of ["LiteSpeed", "Caddy", "openresty/1.21.4"]) {
      vi.stubGlobal("fetch", dnsRecorder({}).fetchMock);
      const checks = await runInfrastructureExtended(pageContext("example.com", { server }));
      expect(statusOf(checks, "load_balancer_detected"), server).toBe("INCONCLUSIVE");
      expect(statusOf(checks, "load_balancer_detected"), server).not.toBe("PASS");
    }
  });

  it("does not report a load balancer for a binary repository manager", async () => {
    vi.stubGlobal("fetch", dnsRecorder({}).fetchMock);
    const checks = await runInfrastructureExtended(pageContext("example.com", { server: "Artifactory/7.0" }));
    // Artifactory is not a proxy in any deployment, so the absence of every
    // proxy header really is the observation — this is the WARN branch, not a
    // decline and certainly not a PASS.
    expect(statusOf(checks, "load_balancer_detected")).toBe("WARN");
  });

  it("still PASSes a pure caching proxy, to stay consistent with cdn_detected", async () => {
    // `pulse-scan.ts`'s CDN_SERVER_VALUES contains "varnish", so a WARN here
    // would contradict a `cdn_detected` PASS on the same response.
    vi.stubGlobal("fetch", dnsRecorder({}).fetchMock);
    const checks = await runInfrastructureExtended(pageContext("example.com", { server: "Varnish" }));
    const check = find(checks, "load_balancer_detected");
    expect(check?.status).toBe("PASS");
    expect(check?.confidence).toBe("MEDIUM");
  });

  it("does not PASS on a CSP that merely names a CDN vendor", async () => {
    vi.stubGlobal("fetch", dnsRecorder({}).fetchMock);
    const checks = await runInfrastructureExtended(pageContext("example.com", {
      "content-security-policy": HN_HEADERS["content-security-policy"],
    }));
    expect(statusOf(checks, "load_balancer_detected")).toBe("WARN");
  });

  it("names the question it asked when nothing was found, and does not claim HIGH", async () => {
    vi.stubGlobal("fetch", dnsRecorder({}).fetchMock);
    const checks = await runInfrastructureExtended(pageContext("example.com", {}));
    const check = find(checks, "load_balancer_detected");
    expect(check?.status).toBe("WARN");
    // A transparent layer-4 balancer sets no headers, so an absence cannot
    // disprove one — the verdict must not be asserted at HIGH confidence.
    expect(check?.confidence).toBe("MEDIUM");
    expect(check?.detail).toMatch(/Cache-Status/);
    expect(check?.detail).toMatch(/layer-4|layer 4/i);
  });
});

describe("cdn_custom_caching_rules reads the standardised cache header", () => {
  it("PASSes gitwork.co.uk on Cache-Status rather than reporting no CDN caching", async () => {
    vi.stubGlobal("fetch", dnsRecorder({}).fetchMock);
    const checks = await runInfrastructureExtended(pageContext("gitwork.co.uk", GITWORK_HEADERS));
    expect(statusOf(checks, "cdn_custom_caching_rules")).toBe("PASS");
    expect(detailOf(checks, "cdn_custom_caching_rules")).toContain("Netlify Edge");
  });

  it("still WARNs when a response carries no cache header at all", async () => {
    vi.stubGlobal("fetch", dnsRecorder({}).fetchMock);
    const checks = await runInfrastructureExtended(pageContext("example.com", { server: "gunicorn" }));
    expect(statusOf(checks, "cdn_custom_caching_rules")).toBe("WARN");
  });

  // ── SECOND PASS: the prose fallback that survived item 7 ──
  //
  // The reviewer's exact input. `cache-tag` and `surrogate-key` are RESPONSE
  // HEADER names; the check searched the page BODY for them, so a site with no
  // cache header at all PASSed because its copy mentioned CDN purging. This is
  // item 7's disease twenty lines from the code that removes it, and it is the
  // "we could not establish this" → "this is fine" direction, which is the
  // strictly worse one.
  it("does not PASS on the words 'cache-tag' in the page body", async () => {
    vi.stubGlobal("fetch", dnsRecorder({}).fetchMock);
    const checks = await runInfrastructureExtended(
      pageContext("brokensite.com", {}, "<html>we use Cache-Tag purging</html>"),
    );
    const check = find(checks, "cdn_custom_caching_rules");
    expect(check?.status).toBe("WARN");
    expect(check?.detail).not.toMatch(/caching signals detected/);
    expect(check?.evidence).toBeUndefined();
  });

  it("does not PASS on the words 'surrogate-key' in the page body", async () => {
    vi.stubGlobal("fetch", dnsRecorder({}).fetchMock);
    const checks = await runInfrastructureExtended(
      pageContext("brokensite.com", {}, "<html><p>Purge by Surrogate-Key on every deploy.</p></html>"),
    );
    expect(statusOf(checks, "cdn_custom_caching_rules")).toBe("WARN");
  });

  it("quotes the header it read, so the PASS names its own evidence", async () => {
    // The complement: with the body fallback gone, a PASS can only come from a
    // header, so the detail can state what was observed rather than asserting a
    // conclusion. A rising `Age` alone is enough — only a shared cache emits it.
    vi.stubGlobal("fetch", dnsRecorder({}).fetchMock);
    const checks = await runInfrastructureExtended(pageContext("example.com", { age: "317" }));
    const check = find(checks, "cdn_custom_caching_rules");
    expect(check?.status).toBe("PASS");
    expect(check?.evidence).toBe("age: 317");
    expect(check?.detail).toContain("age: 317");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// THIRD PASS — the check read the header's PRESENCE and called it caching, so
// every vendor's way of saying "this response was NOT cached" was reported as
// "CDN caching active".
//
// Reviewer's exact inputs: cf-cache-status: DYNAMIC, cf-cache-status: BYPASS,
// x-vercel-cache: BYPASS, x-cache: MISS, and cache-status: "x"; fwd=uri-miss.
// This is the "we could not establish this" → "this is fine" direction, which is
// the worse one: the check that exists to notice missing CDN caching credited a
// site for the header that says it is missing.
// ─────────────────────────────────────────────────────────────────────────────

describe("classifyCdnCaching reads the cache header's value", () => {
  it.each([
    ["cf-cache-status", "DYNAMIC"],
    ["cf-cache-status", "BYPASS"],
    ["x-vercel-cache", "BYPASS"],
    ["x-cache", "MISS"],
    ["cache-status", '"x"; fwd=uri-miss'],
  ])("does not read %s: %s as caching", (header, value) => {
    const verdict = classifyCdnCaching({ [header]: value });
    expect(verdict.kind).toBe("uncached");
    expect(verdict.kind).not.toBe("cached");
  });

  it("reads every vendor's spelling of a hit as caching", () => {
    // The other direction, on real captured values. A fix that stopped crediting
    // MISS but also stopped crediting Akamai's or CloudFront's dialect of HIT
    // would have traded a false positive for a false negative.
    for (const [header, value] of [
      ["cache-status", '"Netlify Edge"; hit; ttl=31532567'],
      ["cache-status", '"Netlify Edge"; fwd=miss; fwd-status=200; stored'],
      ["cf-cache-status", "HIT"],
      ["cf-cache-status", "REVALIDATED"],
      ["cf-cache-status", "STALE"],
      ["x-vercel-cache", "HIT"],
      ["x-vercel-cache", "PRERENDER"],
      ["x-cache", "HIT"],
      ["x-cache", "TCP_MEM_HIT from a12-34.deploy.akamaitechnologies.com"],
      ["x-cache", "RefreshHit from cloudfront"],
      ["x-cdn-cache", "HIT"],
    ] as const) {
      expect(classifyCdnCaching({ [header]: value }).kind, `${header}: ${value}`).toBe("cached");
    }
  });

  it("credits `stored` even though the same value reports a forward", () => {
    // RFC 9211's own example shape, and gitwork.co.uk's real header on a cold
    // request: the cache went to the origin AND stored the result. `fwd=` is
    // present, so a naive "fwd means uncached" rule gets this backwards.
    const verdict = classifyCdnCaching({ "cache-status": '"Netlify Edge"; fwd=miss; fwd-status=200; stored' });
    expect(verdict.kind).toBe("cached");
    if (verdict.kind === "cached") expect(verdict.token).toBe("stored");
  });

  it("treats EXPIRED and STALE as proof that caching is configured", () => {
    // A deliberate call, documented at CACHE_HIT_TOKENS. A response cannot expire
    // or go stale without having been STORED first — Cloudflare defines EXPIRED as
    // "found in the cache but had expired" — so both prove caching exists. Reading
    // EXPIRED as "not cached" while reading REVALIDATED, which is its outcome, as
    // "cached" would be incoherent.
    expect(classifyCdnCaching({ "cf-cache-status": "EXPIRED" }).kind).toBe("cached");
    expect(classifyCdnCaching({ "cf-cache-status": "STALE" }).kind).toBe("cached");
  });

  it("lets a hit anywhere in a multi-hop chain win", () => {
    // MDN's real header: the edge missed and the shield hit. Reading only the
    // first token would report the site as uncached.
    const verdict = classifyCdnCaching({ "x-cache": "MISS, MISS, HIT" });
    expect(verdict.kind).toBe("cached");
  });

  it("lets a rising Age outrank a miss on the edge tier", () => {
    // `x-cache: MISS` with `age: 300` is a shield or parent cache holding the
    // object. Only a stored response can be 300 seconds old.
    expect(classifyCdnCaching({ "x-cache": "MISS", age: "300" }).kind).toBe("cached");
  });

  it("does not let Age: 0 outrank an explicit non-cache", () => {
    // Vercel sends `age: 0` alongside a miss. The old code took the first
    // non-empty header it found; the value has to decide.
    expect(classifyCdnCaching({ "x-vercel-cache": "BYPASS", age: "0" }).kind).toBe("uncached");
  });

  it("declines on a bare Age: 0, which shows a cache without showing a store", () => {
    // RFC 9111 §5.1 has a cache compute Age for every response it handles, and 0
    // is what it reports on one just fetched from the origin. `detectIntermediary`
    // correctly reads it as proof of a shared cache — a different question.
    expect(classifyCdnCaching({ age: "0" }).kind).toBe("indeterminate");
    expect(classifyCdnCaching({ age: "1" }).kind).toBe("cached");
    expect(detectIntermediary({ age: "0" })?.basis).toBe("standard");
  });

  it("declines on a value it cannot interpret rather than guessing", () => {
    expect(classifyCdnCaching({ "cf-cache-status": "WHO-KNOWS" }).kind).toBe("indeterminate");
    expect(classifyCdnCaching({ "cache-status": '"Some Cache"; fwd=method' }).kind).toBe("indeterminate");
  });

  it("reports absence only when there is no cache signal at all", () => {
    expect(classifyCdnCaching({}).kind).toBe("absent");
    expect(classifyCdnCaching({ server: "gunicorn", "cache-control": "no-store" }).kind).toBe("absent");
    // An empty or malformed value is not a signal either.
    expect(classifyCdnCaching({ "x-cache": "   ", age: "soon" }).kind).toBe("absent");
  });

  // ── FOURTH PASS: three sentences that said more than the header did ──

  it("remembers a malformed Age so the WARN cannot deny a header that was sent", () => {
    // Reviewer's exact input. `{age: "abc"}` was `{kind: "absent"}` with no trace
    // of the Age, so the WARN read "this response carried no … or Age" about a
    // response that carried an Age. The verdict is right and the evidence line was
    // false, which is the half a reader can check for themselves.
    const verdict = classifyCdnCaching({ age: "abc" });
    expect(verdict.kind).toBe("absent");
    if (verdict.kind === "absent") expect(verdict.malformedAge).toBe("abc");
    // And a genuinely header-less response still carries no age claim at all.
    const none = classifyCdnCaching({});
    expect(none.kind).toBe("absent");
    if (none.kind === "absent") expect(none.malformedAge).toBeUndefined();
  });

  it("does not read a NEGATED hit as caching", () => {
    // `no-hit` tokenises to ["no", "hit"], so the bare `/hit$/` rule found a hit
    // and PASSed — a false PASS on the check that exists to notice caching being
    // absent, which is the "this is fine" direction of the governing rule.
    const verdict = classifyCdnCaching({ "x-cache": "no-hit" });
    expect(verdict.kind).not.toBe("cached");
    expect(verdict.kind).toBe("indeterminate");
  });

  it("keeps crediting every real vendor spelling the negation guard could have broken", () => {
    // The discriminating control. The guard is positional — it only looks at the
    // token DIRECTLY before a hit — precisely so these survive. `fwd=miss; stored`
    // is the one that a "any negative anywhere ⇒ not a hit" rule would destroy.
    for (const [header, value] of [
      ["x-cache", "HIT"],
      ["x-cache", "MISS, MISS, HIT"],
      ["x-cache", "TCP_MEM_HIT from a12-34.deploy.akamaitechnologies.com"],
      ["x-cache", "RefreshHit from cloudfront"],
      ["cache-status", '"Netlify Edge"; fwd=miss; fwd-status=200; stored'],
      ["cache-status", '"ExampleCache"; hit'],
      ["cf-cache-status", "REVALIDATED"],
      ["x-vercel-cache", "PRERENDER"],
    ] as const) {
      expect(classifyCdnCaching({ [header]: value }).kind, `${header}: ${value}`).toBe("cached");
    }
  });

  it("documents the accepted residual: /hit$/ still matches inside a word", () => {
    // ⚠️ NOT a desired outcome — a pinned trade-off. `whitehit` is nobody's
    // vocabulary, and the only precise exclusion (requiring a token boundary
    // before "hit") also excludes CloudFront's real `RefreshHit` and
    // `OriginShieldHit`, which lowercase to `refreshhit` / `originshieldhit`.
    // Delete this test if a rule is ever found that separates them.
    expect(classifyCdnCaching({ "x-cache": "whitehit" }).kind).toBe("cached");
    expect(classifyCdnCaching({ "x-cache": "RefreshHit from cloudfront" }).kind).toBe("cached");
  });

  it("does not put words in the cache's mouth on NONE/UNKNOWN", () => {
    // Cloudflare ships the literal value `NONE/UNKNOWN`, and UNKNOWN is documented
    // as the cache being unable to determine the status. It contains the miss token
    // `none`, so it classified as `uncached` — whose detail says the cache "reports
    // that it did NOT serve this response from store". It reported no such thing.
    const verdict = classifyCdnCaching({ "cf-cache-status": "NONE/UNKNOWN" });
    expect(verdict.kind).toBe("indeterminate");
    if (verdict.kind === "indeterminate") expect(verdict.why).toBe("cache-undetermined");
    expect(classifyCdnCaching({ "cf-cache-status": "UNKNOWN" }).kind).toBe("indeterminate");
  });

  it("still reads a real, unqualified non-cache as a non-cache", () => {
    // The discriminating control for the UNKNOWN precedence: a bare `NONE` is
    // Cloudflare saying the asset is not eligible for caching, which IS a
    // statement about the origin serving it, and DYNAMIC/BYPASS/MISS are unchanged.
    for (const value of ["NONE", "DYNAMIC", "BYPASS"]) {
      const verdict = classifyCdnCaching({ "cf-cache-status": value });
      expect(verdict.kind, value).toBe("uncached");
    }
    expect(classifyCdnCaching({ "x-cache": "MISS" }).kind).toBe("uncached");
  });

  it("labels a bare Age: 0 as the age case and an odd value as unreadable", () => {
    // The `why` discriminator replaced a `header === "age"` test, which would have
    // given the Age sentence to any future indeterminate case on that header.
    const zero = classifyCdnCaching({ age: "0" });
    expect(zero.kind === "indeterminate" && zero.why).toBe("age-zero");
    const odd = classifyCdnCaching({ "cf-cache-status": "WHO-KNOWS" });
    expect(odd.kind === "indeterminate" && odd.why).toBe("unreadable-value");
  });
});

describe("cdn_custom_caching_rules does not credit an uncached response", () => {
  it("declines instead of reporting 'CDN caching active' on cf-cache-status: DYNAMIC", async () => {
    vi.stubGlobal("fetch", dnsRecorder({}).fetchMock);
    const checks = await runInfrastructureExtended(
      pageContext("example.com", { "cf-cache-status": "DYNAMIC", "cf-ray": "8a0f-LHR", server: "cloudflare" }),
    );
    const check = find(checks, "cdn_custom_caching_rules");
    expect(check?.status).toBe("INCONCLUSIVE");
    expect(check?.status).not.toBe("PASS");
    expect(check?.detail).not.toMatch(/CDN caching active/);
    expect(check?.detail).not.toMatch(/caching signals detected/);
    // It must say what it read, and what would settle it.
    expect(check?.detail).toMatch(/DYNAMIC/);
    expect(check?.detail).toMatch(/did NOT serve this response from store/);
    expect(check?.evidence).toBe("cf-cache-status: DYNAMIC");
  });

  it.each(["BYPASS", "MISS"])("declines on x-vercel-cache: %s", async (value) => {
    vi.stubGlobal("fetch", dnsRecorder({}).fetchMock);
    const checks = await runInfrastructureExtended(pageContext("example.com", { "x-vercel-cache": value }));
    expect(statusOf(checks, "cdn_custom_caching_rules")).toBe("INCONCLUSIVE");
  });

  it("declines on the RFC 9211 forward-with-nothing-stored shape", async () => {
    vi.stubGlobal("fetch", dnsRecorder({}).fetchMock);
    const checks = await runInfrastructureExtended(
      pageContext("example.com", { "cache-status": '"x"; fwd=uri-miss' }),
    );
    expect(statusOf(checks, "cdn_custom_caching_rules")).toBe("INCONCLUSIVE");
  });

  it("still detects the intermediary it declined to credit with caching", async () => {
    // The two questions are separate, and the fix must not lose the first one:
    // `cf-cache-status` can only be set by Cloudflare, so something IS in front of
    // the origin even though it cached nothing.
    vi.stubGlobal("fetch", dnsRecorder({}).fetchMock);
    const checks = await runInfrastructureExtended(
      pageContext("example.com", { "cf-cache-status": "DYNAMIC" }),
    );
    expect(statusOf(checks, "load_balancer_detected")).toBe("PASS");
    expect(statusOf(checks, "cdn_custom_caching_rules")).toBe("INCONCLUSIVE");
  });

  it("lands in 'could not establish' and never in the actionable list", async () => {
    // Why INCONCLUSIVE and not WARN: an uncached HTML document with cached hashed
    // assets is the recommended shape for a server-rendered app behind a CDN, and
    // this scan fetched no assets. WARN would flag correct configuration; PASS
    // would credit configuration that may not exist. INCONCLUSIVE is excluded from
    // both sides of the score.
    vi.stubGlobal("fetch", dnsRecorder({}).fetchMock);
    const checks = await runInfrastructureExtended(
      pageContext("example.com", { "cf-cache-status": "DYNAMIC" }),
    );
    const { actionable, notEstablished } = triage(checks);
    expect(actionable.map((f) => f.checkKey)).not.toContain("cdn_custom_caching_rules");
    expect(notEstablished.map((n) => n.checkKey)).toContain("cdn_custom_caching_rules");
  });

  it("keeps PASSing every real hit in the audit corpus", async () => {
    // The regression guard for the fix's own direction. All four of these were
    // captured live and all four report a hit, so all four must still PASS —
    // including MDN, whose value starts with two misses.
    for (const [host, headers] of [
      ["gitwork.co.uk", GITWORK_HEADERS],
      ["vercel.com", VERCEL_HEADERS],
      ["www.gov.uk", GOVUK_HEADERS],
      ["developer.mozilla.org", MDN_HEADERS],
    ] as const) {
      vi.stubGlobal("fetch", dnsRecorder({ "gov.uk:A": ["151.101.192.144"] }).fetchMock);
      const checks = await runInfrastructureExtended(pageContext(host, headers));
      expect(statusOf(checks, "cdn_custom_caching_rules"), host).toBe("PASS");
    }
  });

  it("still WARNs, with the question it asked, when nothing reported a cache", async () => {
    vi.stubGlobal("fetch", dnsRecorder({}).fetchMock);
    const checks = await runInfrastructureExtended(pageContext("example.com", { server: "gunicorn" }));
    const check = find(checks, "cdn_custom_caching_rules");
    expect(check?.status).toBe("WARN");
    expect(check?.detail).toMatch(/Cache-Status/);
    expect(check?.confidence).toBe("MEDIUM");
    // No Age was sent, so the sentence may say so.
    expect(check?.detail).toMatch(/x-vercel-cache or Age/);
  });

  it("names the unparseable Age instead of denying it was sent", async () => {
    vi.stubGlobal("fetch", dnsRecorder({}).fetchMock);
    const checks = await runInfrastructureExtended(pageContext("example.com", { age: "abc" }));
    const check = find(checks, "cdn_custom_caching_rules");
    // The verdict is unchanged — an unparseable Age is no evidence of a cache.
    expect(check?.status).toBe("WARN");
    // But the false half of the sentence is gone, and the header is quoted.
    expect(check?.detail).not.toMatch(/x-vercel-cache or Age/);
    expect(check?.detail).toMatch(/age: abc/);
    expect(check?.detail).toMatch(/RFC 9111/);
    expect(check?.evidence).toBe("age: abc");
  });

  it("does not tell the reader that Cloudflare reported a non-cache on NONE/UNKNOWN", async () => {
    vi.stubGlobal("fetch", dnsRecorder({}).fetchMock);
    const checks = await runInfrastructureExtended(
      pageContext("example.com", { "cf-cache-status": "NONE/UNKNOWN" }),
    );
    const check = find(checks, "cdn_custom_caching_rules");
    expect(check?.status).toBe("INCONCLUSIVE");
    expect(check?.detail).not.toMatch(/did NOT serve this response from store/);
    expect(check?.detail).toMatch(/could not determine the status/);
    // The sibling question is unaffected: cf-cache-status still proves an edge tier.
    expect(statusOf(checks, "load_balancer_detected")).toBe("PASS");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ITEM 5 — `www.` was concatenated onto whatever host it was handed.
// ─────────────────────────────────────────────────────────────────────────────

describe("planWwwPair locates the scanned host in the apex/www pair", () => {
  const plan = (host: string) => planWwwPair(analyzeHost(host));

  it("treats a domain root as the apex half", () => {
    expect(plan("gitwork.co.uk")).toEqual({ kind: "apex", apex: "gitwork.co.uk" });
    expect(plan("linear.app")).toEqual({ kind: "apex", apex: "linear.app" });
    expect(plan("vercel.com")).toEqual({ kind: "apex", apex: "vercel.com" });
  });

  it("strips a leading www. instead of prefixing another one", () => {
    // The bug: `www.${hostname}` produced `www.www.gov.uk`, NXDOMAIN, reported
    // as "no www subdomain detected".
    expect(plan("www.gov.uk")).toEqual({ kind: "www", apex: "gov.uk" });
    expect(plan("www.ycombinator.com")).toEqual({ kind: "www", apex: "ycombinator.com" });
  });

  it("declines on a host that is some OTHER subdomain", () => {
    // `www.news.ycombinator.com` is NXDOMAIN, and whether ycombinator.com serves
    // an apex/www pair is a fact about a different host.
    const hn = plan("news.ycombinator.com");
    expect(hn.kind).toBe("decline");
    if (hn.kind === "decline") {
      expect(hn.reason).toContain("ycombinator.com");
      expect(hn.reason).toMatch(/sits below/);
    }
    expect(plan("developer.mozilla.org").kind).toBe("decline");
    expect(plan("api.stripe.com").kind).toBe("decline");
    expect(plan("docs.github.com").kind).toBe("decline");
  });

  // ── SECOND PASS: the decline reason has to be true for BOTH shapes ──
  //
  // Reviewer's exact input: planWwwPair(analyzeHost('hmrc.gov.uk')). It still
  // declines — nothing in one external request distinguishes a department root
  // from a hostname inside a larger site — but the sentence it declined WITH
  // asserted two things that are false for this host: that "www.hmrc.gov.uk" is
  // "not a name that would be expected to exist" (it resolves), and that the way
  // to assess it is to "scan gov.uk" (a shared government namespace HMRC does
  // not own). `registrable-domain.ts` treats gov.uk as a registrable domain on
  // purpose, so every UK department running its own zone reaches this branch.
  it("does not tell hmrc.gov.uk that its www name cannot exist", () => {
    const result = plan("hmrc.gov.uk");
    expect(result.kind).toBe("decline");
    if (result.kind !== "decline") return;
    expect(result.reason).not.toMatch(/not a name that would be expected to exist/);
    expect(result.reason).not.toMatch(/not a domain root/);
    // The claim it makes instead is the true one: www.<host> MAY exist here.
    expect(result.reason).toMatch(/"www\.hmrc\.gov\.uk" may well exist/);
  });

  it("does not instruct anyone to scan a namespace they do not own", () => {
    const result = plan("hmrc.gov.uk");
    if (result.kind !== "decline") throw new Error("expected a decline");
    // The old wording was the bare imperative "scan gov.uk to assess it".
    expect(result.reason).not.toMatch(/scan gov\.uk to assess it/);
    // Ownership is a fact the reader has and Pulse does not, so the only
    // actionable sentence is conditional on it.
    expect(result.reason).toMatch(/If gov\.uk is a domain you control/);
  });

  it("gives the same honest reason to a hostname inside a larger site", () => {
    // The wording has to hold for the other shape too, or it has simply traded
    // one wrong sentence for another.
    const result = plan("news.ycombinator.com");
    if (result.kind !== "decline") throw new Error("expected a decline");
    expect(result.reason).toMatch(/If ycombinator\.com is a domain you control/);
    expect(result.reason).toMatch(/"www\.news\.ycombinator\.com" may well exist/);
  });

  it("declines on an IP literal", () => {
    const result = plan("151.101.192.144");
    expect(result.kind).toBe("decline");
    if (result.kind === "decline") expect(result.reason).toMatch(/IP address/);
  });

  it("declines rather than guessing when the public suffix is unknown and the host is deep", () => {
    // `docs.mycompany.zw` — `.zw` is deliberately absent from the curated suffix
    // list, so whether this is a subdomain cannot be established.
    const result = plan("docs.mycompany.zw");
    expect(result.kind).toBe("decline");
  });

  it("still asks the right question for a two-label host with an unknown suffix", () => {
    // A two-label name can only be a domain root or a public suffix itself, so
    // `www.<host>` remains the correct counterpart. This keeps the generic test
    // hostname (`example.test`) exercising the DNS path.
    expect(plan("example.test")).toEqual({ kind: "apex", apex: "example.test" });
    expect(plan("www.example.test")).toEqual({ kind: "www", apex: "example.test" });
  });

  it("normalises a trailing dot and a port before deciding", () => {
    expect(plan("WWW.GOV.UK.")).toEqual({ kind: "www", apex: "gov.uk" });
    expect(plan("gitwork.co.uk:443")).toEqual({ kind: "apex", apex: "gitwork.co.uk" });
  });

  // ── THIRD PASS: a platform-issued name is an apex you cannot add a record to ──
  //
  // Reviewer's exact inputs. `myapp.vercel.app` IS its own registrable domain
  // (`registrable-domain.ts` lists the platform namespaces precisely so a DMARC
  // check never reads Vercel's records as the customer's), so it arrived here as
  // `{kind: "apex"}`, spent two DNS lookups on `www.myapp.vercel.app` — NXDOMAIN,
  // necessarily — and WARNed "add an A/CNAME record for www.myapp.vercel.app".
  // The platform issues one label at a time; there is no zone to add it to.
  it("declines a platform-issued deploy host and names the platform", () => {
    const result = plan("myapp.vercel.app");
    expect(result.kind).toBe("decline");
    if (result.kind !== "decline") return;
    expect(result.reason).toContain("vercel.app");
    expect(result.reason).toMatch(/one label at a time/);
    // The impossible instruction must be gone, not reworded.
    expect(result.reason).not.toMatch(/[Aa]dd an? A\/CNAME record/);
    expect(result.reason).not.toMatch(/www\.myapp\.vercel\.app/);
  });

  it.each([
    "myapp.vercel.app",
    "mysite.netlify.app",
    "store.myshopify.com",
    "myproject.readthedocs.io",
    "someuser.github.io",
  ])("declines %s", (host) => {
    expect(plan(host).kind).toBe("decline");
  });

  it("declines a platform host even when the input carries a www label", () => {
    // Checked before the leading-`www.` branch, or this would look up the bare
    // platform name and grade a customer deploy on whether it resolves.
    const result = plan("www.mysite.netlify.app");
    expect(result.kind).toBe("decline");
    if (result.kind === "decline") expect(result.reason).toContain("netlify.app");
  });

  it("does NOT decline a custom domain that merely runs on a platform", () => {
    // The precision test in the other direction. gitwork.co.uk is served by
    // Netlify (its response says `server: Netlify`) and owns its own zone, so its
    // www record is genuinely actionable and it must still get a real verdict.
    expect(plan("gitwork.co.uk")).toEqual({ kind: "apex", apex: "gitwork.co.uk" });
    expect(plan("www.gitwork.co.uk")).toEqual({ kind: "www", apex: "gitwork.co.uk" });
    expect(plan("linear.app")).toEqual({ kind: "apex", apex: "linear.app" });
  });

  it("does NOT decline a platform vendor's own website", () => {
    // `vercel.com`, `substack.com` and `wordpress.com` are ordinary sites with
    // real www names. Declining the namespace itself would be the fix becoming
    // its own false positive.
    expect(plan("vercel.com")).toEqual({ kind: "apex", apex: "vercel.com" });
    expect(plan("substack.com")).toEqual({ kind: "apex", apex: "substack.com" });
    expect(plan("wordpress.com")).toEqual({ kind: "apex", apex: "wordpress.com" });
  });

  // ── FOURTH PASS: the over-correction, one label further left ──
  //
  // The namespace-equality guard covered `substack.com` but not
  // `www.substack.com`, which read as "one customer label beneath the namespace"
  // and was declined with "names under substack.com are handed out one label at a
  // time by the platform". It is Substack's own marketing site: it resolves, the
  // bare apex resolves, and the pair is as assessable as on any other domain.
  it("does NOT decline the vendor's own www host", () => {
    expect(plan("www.substack.com")).toEqual({ kind: "www", apex: "substack.com" });
    expect(plan("www.wordpress.com")).toEqual({ kind: "www", apex: "wordpress.com" });
    expect(plan("www.squarespace.com")).toEqual({ kind: "www", apex: "squarespace.com" });
    expect(plan("www.myshopify.com")).toEqual({ kind: "www", apex: "myshopify.com" });
    expect(plan("www.webflow.io")).toEqual({ kind: "www", apex: "webflow.io" });
    expect(plan("www.notion.site")).toEqual({ kind: "www", apex: "notion.site" });
    expect(plan("www.railway.app")).toEqual({ kind: "www", apex: "railway.app" });
  });

  it("still declines a customer deploy host that carries a www label", () => {
    // The discriminating control: `www` is excused only as the SOLE label above
    // the namespace. This case must keep declining, or the third pass regresses.
    for (const host of ["www.myapp.vercel.app", "www.mysite.netlify.app", "www.someuser.github.io"]) {
      const result = plan(host);
      expect(result.kind, host).toBe("decline");
      if (result.kind === "decline") expect(result.reason).toMatch(/one label at a time/);
    }
  });
});

describe("backup_domain_configured asks about a name that can exist", () => {
  it("never queries www.www.<host> for a www input", async () => {
    const { fetchMock, asked } = dnsRecorder({ "gov.uk:A": ["151.101.192.144"] });
    vi.stubGlobal("fetch", fetchMock);
    const checks = await runInfrastructureExtended(pageContext("www.gov.uk", GOVUK_HEADERS));

    expect(asked.some((q) => q.startsWith("www.www."))).toBe(false);
    expect(asked).toContain("gov.uk:A");
    expect(statusOf(checks, "backup_domain_configured")).toBe("PASS");
    expect(detailOf(checks, "backup_domain_configured")).toContain("gov.uk");
  });

  it("PASSes an apex whose www name resolves", async () => {
    const { fetchMock, asked } = dnsRecorder({ "www.gitwork.co.uk:CNAME": ["apex-loadbalancer.netlify.com."] });
    vi.stubGlobal("fetch", fetchMock);
    const checks = await runInfrastructureExtended(pageContext("gitwork.co.uk", GITWORK_HEADERS));
    expect(asked).toContain("www.gitwork.co.uk:CNAME");
    expect(statusOf(checks, "backup_domain_configured")).toBe("PASS");
  });

  it("still WARNs on an apex that genuinely has no www name", async () => {
    // The true-positive direction: this is the finding the check exists for and
    // it must survive the fix.
    const { fetchMock } = dnsRecorder({});
    vi.stubGlobal("fetch", fetchMock);
    const checks = await runInfrastructureExtended(pageContext("gitwork.co.uk", GITWORK_HEADERS));
    const check = find(checks, "backup_domain_configured");
    expect(check?.status).toBe("WARN");
    expect(check?.detail).toContain("www.gitwork.co.uk");
    expect(check?.confidence).toBe("MEDIUM");
  });

  it("still WARNs a www-only site whose bare apex is dead", async () => {
    // ⚠️ The false negative this must not become. "The host starts with www., so
    // pass it" would rubber-stamp a site where every link written without the
    // prefix fails to resolve.
    const { fetchMock, asked } = dnsRecorder({});
    vi.stubGlobal("fetch", fetchMock);
    const checks = await runInfrastructureExtended(pageContext("www.example.com", {}));
    expect(asked).toContain("example.com:A");
    const check = find(checks, "backup_domain_configured");
    expect(check?.status).toBe("WARN");
    expect(check?.detail).toMatch(/without "www\."/);
  });

  it("SKIPs a non-www subdomain and names the host that could be scanned instead", async () => {
    const { fetchMock, asked } = dnsRecorder({});
    vi.stubGlobal("fetch", fetchMock);
    const checks = await runInfrastructureExtended(pageContext("news.ycombinator.com", HN_HEADERS));
    const check = find(checks, "backup_domain_configured");
    expect(check?.status).toBe("SKIPPED");
    expect(check?.detail).toContain("ycombinator.com");
    // No DNS question was asked about a name that cannot exist.
    expect(asked.some((q) => q.startsWith("www.news."))).toBe(false);
  });

  it("SKIPs developer.mozilla.org rather than reporting a missing www name", async () => {
    const { fetchMock } = dnsRecorder({});
    vi.stubGlobal("fetch", fetchMock);
    const checks = await runInfrastructureExtended(pageContext("developer.mozilla.org", MDN_HEADERS));
    expect(statusOf(checks, "backup_domain_configured")).toBe("SKIPPED");
  });

  it("is still INCONCLUSIVE, not WARN, when the lookup does not complete", async () => {
    // The pre-existing probe-honesty guarantee: a resolver outage is not a
    // missing record. The bug was the query name, not the transport, so this has
    // to keep holding after the name is fixed.
    const { fetchMock } = dnsRecorder({}, "throw");
    vi.stubGlobal("fetch", fetchMock);
    const checks = await runInfrastructureExtended(pageContext("gitwork.co.uk", GITWORK_HEADERS));
    expect(statusOf(checks, "backup_domain_configured")).toBe("INCONCLUSIVE");
  });

  it("SKIPs a platform deploy host without spending a lookup on it", async () => {
    const { fetchMock, asked } = dnsRecorder({});
    vi.stubGlobal("fetch", fetchMock);
    const checks = await runInfrastructureExtended(pageContext("myapp.vercel.app", VERCEL_HEADERS));
    const check = find(checks, "backup_domain_configured");
    expect(check?.status).toBe("SKIPPED");
    expect(check?.status).not.toBe("WARN");
    expect(check?.detail).toContain("vercel.app");
    // Both lookups for the impossible name are gone. (The AAAA lookup for the
    // scanned host itself is a different check and still runs.)
    expect(asked.some((q) => q.startsWith("www."))).toBe(false);
    expect(asked).toEqual(["myapp.vercel.app:AAAA"]);
  });

  it("still gives a real verdict to a custom domain hosted on a platform", async () => {
    // Netlify-served, own zone: the www record is actionable, so the check must
    // still answer. This is the pair to the test above.
    const { fetchMock, asked } = dnsRecorder({ "www.gitwork.co.uk:CNAME": ["apex-loadbalancer.netlify.com."] });
    vi.stubGlobal("fetch", fetchMock);
    const checks = await runInfrastructureExtended(pageContext("gitwork.co.uk", GITWORK_HEADERS));
    expect(statusOf(checks, "backup_domain_configured")).toBe("PASS");
    expect(asked).toContain("www.gitwork.co.uk:CNAME");
  });

  it("emits exactly one verdict for the key on every host shape", async () => {
    const { fetchMock } = dnsRecorder({});
    vi.stubGlobal("fetch", fetchMock);
    for (const host of ["gitwork.co.uk", "www.gov.uk", "news.ycombinator.com", "example.test", "myapp.vercel.app", "192.0.2.1"]) {
      const checks = await runInfrastructureExtended(pageContext(host, {}));
      expect(checks.filter((c) => c.checkKey === "backup_domain_configured"), host).toHaveLength(1);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ITEM 7 — ten checks that graded the page's marketing copy.
// ─────────────────────────────────────────────────────────────────────────────

const PROSE_KEYS = [
  "multi_region_signals",
  "auto_scaling_configured",
  "circuit_breaker_pattern",
  "graceful_shutdown_configured",
  "environment_separation",
  "blue_green_canary_deploy",
  "feature_flags_system",
  "secrets_manager_used",
  "database_read_replicas",
  "object_storage_signals",
] as const;

describe("the prose-regex family declines instead of guessing from page copy", () => {
  it("SKIPs all ten, with a reason, whatever the page says", async () => {
    const { fetchMock } = dnsRecorder({});
    vi.stubGlobal("fetch", fetchMock);
    const checks = await runInfrastructureExtended(pageContext("example.com", {}));
    for (const key of PROSE_KEYS) {
      const check = find(checks, key);
      expect(check?.status, key).toBe("SKIPPED");
      // A bare SKIPPED with no reason is dropped from the report's "could not
      // establish" list, which would turn noise into silence rather than honesty.
      expect((check?.detail ?? "").trim().length, key).toBeGreaterThan(0);
    }
  });

  it("is not flipped by one user-submitted headline mentioning a region", async () => {
    // The reproduction in the plan: on the Hacker News front page a story titled
    // "Post-mortem: the us-east-1 outage" matched `us.east` and flipped
    // multi_region_signals from WARN to PASS. The verdict was a property of
    // today's news, not of the deployment.
    const { fetchMock } = dnsRecorder({});
    vi.stubGlobal("fetch", fetchMock);
    const quiet = "<html><body><a>Show HN: a tiny parser</a></body></html>";
    const withHeadline = "<html><body><a>Post-mortem: the us-east-1 outage</a></body></html>";

    const before = await runInfrastructureExtended(pageContext("news.ycombinator.com", HN_HEADERS, quiet));
    const after = await runInfrastructureExtended(pageContext("news.ycombinator.com", HN_HEADERS, withHeadline));

    // Asserted as an EQUALITY first, deliberately: that is the assertion the old
    // regex fails (quiet page -> WARN, same page plus the headline -> PASS,
    // because `us.east` matches "us-east-1"), so this test demonstrates the flip
    // rather than merely disagreeing with the old verdict.
    expect(statusOf(after, "multi_region_signals")).toBe(statusOf(before, "multi_region_signals"));
    expect(statusOf(before, "multi_region_signals")).toBe("SKIPPED");
    expect(statusOf(after, "multi_region_signals")).toBe("SKIPPED");
  });

  it("cannot be passed by writing the phrase into hero copy", async () => {
    // The other direction, and the reason there is no false-negative risk in
    // removing these verdicts: a single VPS PASSed by claiming "edge network",
    // and naming a vendor PASSed the secrets-manager and feature-flag checks.
    const { fetchMock } = dnsRecorder({});
    vi.stubGlobal("fetch", fetchMock);
    const marketing =
      "<html><body><h1>Global edge network, multi-region by default</h1>" +
      "<p>Auto-scaling serverless, blue-green deploys, LaunchDarkly feature flags, " +
      "HashiCorp Vault secrets, read replicas, graceful shutdown, circuit breakers, " +
      "staging environment, s3.amazonaws object storage.</p></body></html>";
    const checks = await runInfrastructureExtended(pageContext("single-vps.example.com", {}, marketing));
    for (const key of PROSE_KEYS) {
      expect(statusOf(checks, key), key).toBe("SKIPPED");
    }
  });

  it("stops contradicting cdn_custom_caching_rules on the same response", async () => {
    // www.gov.uk is on Fastly's anycast network and was advised to "consider
    // multi-region or a global CDN" while cdn_custom_caching_rules, in this same
    // file, read `x-cache: HIT` off the very same response and reported "CDN
    // caching active".
    const { fetchMock } = dnsRecorder({ "gov.uk:A": ["151.101.192.144"] });
    vi.stubGlobal("fetch", fetchMock);
    const checks = await runInfrastructureExtended(pageContext("www.gov.uk", GOVUK_HEADERS));
    expect(statusOf(checks, "cdn_custom_caching_rules")).toBe("PASS");
    expect(statusOf(checks, "multi_region_signals")).not.toBe("WARN");
    expect(statusOf(checks, "load_balancer_detected")).toBe("PASS");
  });

  it("leaves the actionable list and lands in 'could not establish' instead", async () => {
    const { fetchMock } = dnsRecorder({});
    vi.stubGlobal("fetch", fetchMock);
    const checks = await runInfrastructureExtended(pageContext("example.com", {}));
    const { actionable, notEstablished } = triage(checks);
    for (const key of PROSE_KEYS) {
      expect(actionable.map((f) => f.checkKey), key).not.toContain(key);
      expect(notEstablished.map((n) => n.checkKey), key).toContain(key);
    }
  });

  it("keeps every declined key registered, so the catalogue does not drift", async () => {
    // SKIPPED is not deletion: the question is legitimate, the method was not.
    // Per §8 a key must exist in the registry with a category from CATEGORIES.
    for (const key of PROSE_KEYS) {
      const row = CHECKS_REGISTRY.find((entry) => entry.key === key);
      expect(row, key).toBeDefined();
      expect(row?.category, key).toBe(CATEGORIES.INFRASTRUCTURE);
    }
  });
});

describe("the family still measures what it can measure", () => {
  it("keeps the DNS-backed and header-backed checks as real verdicts", async () => {
    const { fetchMock } = dnsRecorder({
      "gitwork.co.uk:AAAA": ["2a05:d014::1"],
      "www.gitwork.co.uk:A": ["75.2.60.5"],
    });
    vi.stubGlobal("fetch", fetchMock);
    const checks = await runInfrastructureExtended(pageContext("gitwork.co.uk", GITWORK_HEADERS));
    expect(statusOf(checks, "ipv6_dns_record")).toBe("PASS");
    expect(statusOf(checks, "backup_domain_configured")).toBe("PASS");
    expect(statusOf(checks, "load_balancer_detected")).toBe("PASS");
    expect(statusOf(checks, "cdn_custom_caching_rules")).toBe("PASS");
  });

  it("still WARNs on a genuinely absent AAAA record", async () => {
    const { fetchMock } = dnsRecorder({});
    vi.stubGlobal("fetch", fetchMock);
    const checks = await runInfrastructureExtended(pageContext("example.com", {}));
    expect(statusOf(checks, "ipv6_dns_record")).toBe("WARN");
  });
});
