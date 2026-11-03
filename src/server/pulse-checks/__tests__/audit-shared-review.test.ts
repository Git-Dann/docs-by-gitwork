// @vitest-environment node
/**
 * Two-sided guards for the "shared" audit fixes that had no direct test:
 *  - resolveDnsRecord keeps only answers of the requested RR type (a CNAME is not a DS/CAA).
 *  - classifyTopicPage treats a downloadable archive/PDF at a topic path as the asset.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

// The guarded transport resolves and pins real hosts; route it through the stubbed
// global fetch so these tests never touch the network.
vi.mock("@/server/pulse-lite/url-guard", () => ({
  fetchScannableUrl: (url: string, init?: RequestInit) => fetch(url, init),
}));

import { resolveDnsRecord } from "@/server/pulse-checks/_types";
import { classifyTopicPage, type PathProbe } from "@/server/pulse-checks/path-probe";

type Answer = { name?: string; type?: number; data: string };

function stubDoh(answers: Answer[], status = 0) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ Status: status, Answer: answers }), {
    status: 200,
    headers: { "content-type": "application/dns-json" },
  })));
}

afterEach(() => vi.unstubAllGlobals());

describe("resolveDnsRecord — only records of the requested type count", () => {
  it("a DS answer that is only the host's CNAME (www.bbc.co.uk, 2026-10-14) is NO DS record", async () => {
    stubDoh([
      { name: "www.bbc.co.uk", type: 5, data: "www.bbc.co.uk.pri.bbc.co.uk." },
      { name: "www.bbc.co.uk.pri.bbc.co.uk", type: 5, data: "uk.www.bbc.co.uk.pri.bbc.co.uk." },
    ]);
    const r = await resolveDnsRecord("www.bbc.co.uk", "DS");
    expect(r).toMatchObject({ ok: true, records: [] });
  });

  it("still returns the DS record when the answer carries one", async () => {
    stubDoh([{ name: "example.com", type: 43, data: "370 13 2 BE74359954660069D5C632B56F120EE9F3A86764247C" }]);
    const r = await resolveDnsRecord("example.com", "ds");
    expect(r.ok && r.records).toHaveLength(1);
  });

  it("keeps a CAA record reached through a CNAME, and drops the CNAME itself", async () => {
    stubDoh([
      { name: "www.example.org", type: 5, data: "edge.example.net." },
      { name: "edge.example.net", type: 257, data: '0 issue "letsencrypt.org"' },
    ]);
    const r = await resolveDnsRecord("www.example.org", "CAA");
    expect(r.ok && r.records).toEqual(['0 issue "letsencrypt.org"']);
  });

  it("a CNAME lookup still returns the CNAME", async () => {
    stubDoh([{ name: "www.example.org", type: 5, data: "edge.example.net." }]);
    const r = await resolveDnsRecord("www.example.org", "CNAME");
    expect(r.ok && r.records).toEqual(["edge.example.net."]);
  });

  it("an answer with no numeric type, or a query type it does not know, is left unfiltered", async () => {
    stubDoh([{ data: "untyped" }]);
    expect(await resolveDnsRecord("x.test", "DS")).toMatchObject({ ok: true, records: ["untyped"] });
    stubDoh([{ type: 33, data: "10 5 443 sip.x.test." }]);
    expect(await resolveDnsRecord("_sip._tcp.x.test", "SRV")).toMatchObject({ ok: true, records: ["10 5 443 sip.x.test."] });
  });
});

const probe = (contentType: string, finalUrl = "https://cdn.site.test/a91f3c.zip", status = 200): PathProbe => ({
  status,
  contentType,
  body: "PK\u0003\u0004",
  finalUrl,
});

describe("classifyTopicPage — a press kit that IS a download", () => {
  it("a 200 zip answering /press-kit is present (anthropic.com/press-kit 307s to a .zip)", () => {
    expect(classifyTopicPage(probe("application/zip"), "/press-kit", /press kit|media kit/i, "anthropic")).toBe("present");
    expect(classifyTopicPage(probe("application/pdf", "https://site.test/media-kit"), "/media-kit", /press kit|media kit/i, null)).toBe("present");
  });

  it("the same response as an HTML page that does not name itself stays unverified", () => {
    expect(classifyTopicPage(probe("text/html; charset=utf-8"), "/press-kit", /press kit|media kit/i, "anthropic")).toBe("unverified");
  });

  it("an opaque octet-stream is not taken as the asset", () => {
    expect(classifyTopicPage(probe("application/octet-stream"), "/press-kit", /press kit|media kit/i, null)).toBe("unverified");
  });

  it("a zip is still absent on 404 and unverified on a non-200", () => {
    expect(classifyTopicPage(probe("application/zip", undefined, 404), "/press-kit", /press kit/i, null)).toBe("absent");
    expect(classifyTopicPage(probe("application/zip", undefined, 403), "/press-kit", /press kit/i, null)).toBe("unverified");
  });

  it("does not fire when the requested path does not name the topic", () => {
    expect(classifyTopicPage(probe("application/pdf"), "/downloads", /press kit/i, null)).toBe("unverified");
  });
});
