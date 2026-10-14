// @vitest-environment node
/**
 * When Pulse cannot read a page, it must say so ONCE and stop — never report the
 * controls it could not look at as failures.
 *
 * Before this, an expired certificate, a slow server, a redirect loop, an HTTP-only
 * site, a 404 and a PDF each produced ~157 FAILs reading "Could not reach the site." —
 * privacy policy, VAT number, API rate limits — a score of 0 and a wall of "actionable"
 * findings about content nobody had seen. Found by running the real engine against
 * those targets (CLAUDE.md §35: "we could not look" must not become "it isn't there").
 *
 * The network is faked at the one SSRF-guarded transport; everything else is real.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Route = (url: string) => Response | Error;
let route: Route = () => new Error("unset");

vi.mock("@/server/pulse-lite/url-guard", async (orig) => {
  const actual = await orig<typeof import("@/server/pulse-lite/url-guard")>();
  return {
    ...actual,
    fetchScannableUrl: vi.fn(async (url: string) => {
      const r = route(url);
      if (r instanceof Error) throw r;
      return r;
    }),
  };
});

import { runUrlChecks, classifyFetchError, isNonPageContentType } from "@/server/pulse-scan";

const tlsError = (code: string) => Object.assign(new TypeError("fetch failed"), { cause: { code, message: code } });
const page = (status: number, body: string, contentType = "text/html; charset=utf-8", url = "https://site.test/") => {
  const r = new Response(body, { status, headers: { "content-type": contentType } });
  Object.defineProperty(r, "url", { value: url });
  return r;
};

async function scan() {
  const out = await runUrlChecks("https://site.test", "WEB_APP");
  const tca = out.checks.find((c) => c.checkKey === "target_content_accessible");
  const ssl = out.checks.find((c) => c.checkKey === "ssl_valid");
  return { out, tca, ssl };
}

beforeEach(() => { route = () => new Error("unset"); });

describe("a target Pulse cannot read produces ONE finding, not hundreds", () => {
  const cases: Array<{ name: string; route: Route; detail: RegExp; ssl: string; tca?: string }> = [
    { name: "expired certificate", route: () => tlsError("CERT_HAS_EXPIRED"), detail: /certificate was rejected \(CERT_HAS_EXPIRED\)/, ssl: "FAIL" },
    { name: "self-signed certificate", route: () => tlsError("DEPTH_ZERO_SELF_SIGNED_CERT"), detail: /certificate was rejected/, ssl: "FAIL" },
    { name: "timeout", route: () => Object.assign(new Error("aborted"), { name: "AbortError" }), detail: /did not respond within/, ssl: "INCONCLUSIVE", tca: "INCONCLUSIVE" },
    { name: "redirect loop", route: () => new Error("Too many redirects — the target could not be scanned safely."), detail: /redirected too many times/, ssl: "INCONCLUSIVE" },
    { name: "connection refused", route: () => Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } }), detail: /refused or dropped/, ssl: "INCONCLUSIVE" },
    { name: "HTTP 404", route: () => page(404, "<h1>Not found</h1>"), detail: /returned HTTP 404/, ssl: "PASS" },
    { name: "HTTP 500", route: () => page(500, ""), detail: /returned HTTP 500/, ssl: "PASS" },
    { name: "HTTP 403 (protected)", route: () => page(403, "denied"), detail: /looks protected/, ssl: "PASS", tca: "INCONCLUSIVE" },
    { name: "a PDF", route: () => page(200, "%PDF-1.4", "application/pdf"), detail: /serves a file \(application\/pdf\)/, ssl: "PASS", tca: "INCONCLUSIVE" },
    { name: "plain text", route: () => page(200, "hello", "text/plain"), detail: /serves a file \(text\/plain\)/, ssl: "PASS", tca: "INCONCLUSIVE" },
  ];

  for (const c of cases) {
    it(`${c.name}: one ${c.tca ?? "FAIL"} naming the cause, nothing invented`, async () => {
      route = c.route;
      const { out, tca, ssl } = await scan();
      // A defect a visitor hits too is a FAIL; "Pulse was not let in" (sign-in, bot wall,
      // timeout) or "this is a file" is INCONCLUSIVE — it says nothing about the product.
      expect(tca?.status).toBe(c.tca ?? "FAIL");
      expect(tca?.detail).toMatch(c.detail);
      expect(ssl?.status).toBe(c.ssl);
      // The defect this replaces: no control is reported as failing because it could not be read.
      expect(out.checks.filter((x) => /Could not reach the site/.test(x.detail ?? ""))).toEqual([]);
      expect(out.checks.map((x) => x.checkKey).sort()).toEqual(["ssl_valid", "target_content_accessible"]);
    });
  }

  it("an HTTP-only site is reported as having no HTTPS, not as unreachable", async () => {
    route = (url) => (url.startsWith("https:") ? Object.assign(new TypeError("fetch failed"), { cause: { code: "UND_ERR_SOCKET", message: "other side closed" } }) : page(200, "<html>hi</html>", "text/html", "http://site.test/"));
    const { tca, ssl } = await scan();
    expect(ssl?.status).toBe("FAIL");
    expect(ssl?.detail).toMatch(/plain HTTP only/);
    expect(tca?.detail).toMatch(/plain HTTP but not over HTTPS/);
  });

  it("a site down on BOTH protocols is not called HTTP-only", async () => {
    route = () => Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } });
    const { tca } = await scan();
    expect(tca?.detail).not.toMatch(/plain HTTP/);
  });
});

describe("a readable page still runs the full scan", () => {
  it("does not stop at the gate for a normal 200 HTML page", async () => {
    route = () => page(200, "<html><head><title>Hi</title></head><body><h1>Hi</h1></body></html>");
    const { out, tca } = await scan();
    expect(tca?.status === "FAIL").toBe(false);
    expect(out.checks.length).toBeGreaterThan(50);
  });
});

describe("rate limiting is named as such", () => {
  it("a 429 or exhausted rate-limit header is INCONCLUSIVE and says it is a rate limit", async () => {
    route = () => { const r = page(403, "{}", "application/json"); r.headers.set("x-ratelimit-remaining", "0"); return r; };
    const { tca } = await scan();
    expect(tca?.status).toBe("INCONCLUSIVE");
    expect(tca?.detail).toMatch(/rate-limiting requests from Pulse/);
  });
});

describe("classifiers", () => {
  it("content types: files are files, pages and APIs are not", () => {
    for (const t of ["application/pdf", "image/png", "text/plain; charset=utf-8", "application/zip", "video/mp4", "text/csv"]) expect(isNonPageContentType(t), t).toBe(true);
    for (const t of ["text/html", "application/xhtml+xml", "application/json", "", "TEXT/HTML; charset=UTF-8"]) expect(isNonPageContentType(t), t).toBe(false);
  });

  it("fetch errors map to a cause a site owner can act on", () => {
    expect(classifyFetchError(tlsError("UNABLE_TO_VERIFY_LEAF_SIGNATURE")).kind).toBe("tls");
    expect(classifyFetchError(Object.assign(new Error("x"), { cause: { code: "UND_ERR_CONNECT_TIMEOUT" } })).kind).toBe("timeout");
    expect(classifyFetchError(new Error("Too many redirects")).kind).toBe("redirects");
    expect(classifyFetchError(Object.assign(new Error("x"), { cause: { code: "ENOTFOUND" } })).kind).toBe("refused");
    expect(classifyFetchError("weird").kind).toBe("other");
  });
});

describe("an API that answers with a JSON error is graded as an API", () => {
  it("401 application/json (api.stripe.com/v1/charges) is not 'no page to assess'", async () => {
    route = (url) => (new URL(url).pathname.startsWith("/v1/charges")
      ? page(401, '{"error":{"message":"You did not provide an API key.","type":"invalid_request_error"}}', "application/json", "https://site.test/v1/charges")
      : page(404, '{"error":{"type":"invalid_request_error"}}', "application/json"));
    const out = await runUrlChecks("https://site.test/v1/charges", "API_BACKEND");
    const tca = out.checks.find((c) => c.checkKey === "target_content_accessible");
    expect(tca?.status === "FAIL" || tca?.status === "INCONCLUSIVE").toBe(false);
    expect(out.checks.length).toBeGreaterThan(5);
    // The API answering 401 is correct behaviour, not a failure to serve.
    expect(out.checks.find((c) => c.checkKey === "status_200")?.status).not.toBe("FAIL");
  });
  it("a 401 HTML login wall is still not inspectable", async () => {
    route = () => page(401, "<html><title>Sign in</title></html>");
    const { tca } = await scan();
    expect(tca?.status).toBe("INCONCLUSIVE");
  });
  it("a JSON 429 rate limit still stops the scan", async () => {
    route = () => { const r = page(429, '{"error":"slow down"}', "application/json"); r.headers.set("retry-after", "30"); return r; };
    const { tca } = await scan();
    expect(tca?.status).toBe("INCONCLUSIVE");
  });
});
