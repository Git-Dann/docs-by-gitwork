import { afterEach, describe, expect, it, vi } from "vitest";

// Mock at the transport boundary, like probe-honesty.test.ts, so the real
// resolveDnsRecord / fetchWithTimeout code paths under test actually run.
vi.mock("@/server/pulse-lite/url-guard", () => ({
  fetchScannableUrl: (url: string, init?: RequestInit) => fetch(url, init),
}));

import type { ExtendedCheckContext, PulseScanCheckInput } from "../_types";
import {
  runSecurityExtended,
  findExposedApiKeys,
  evaluateInlineScriptPolicy,
  parseCspDirectives,
  parseSetCookieHeader,
  splitSetCookieHeader,
  looksLikeSessionCookie,
  readMetaCsp,
  isApiResponseClass,
  rateLimitHeaderNames,
  cspReportingEndpointPresent,
  restrictsFraming,
} from "../security-extended";

// ─────────────────────────────────────────────────────────────────────────────
// FALSE-POSITIVE REGRESSIONS IN THE EXTENDED SECURITY FAMILY.
//
// Every case below is a real response from the six-site audit, quoted as it was
// served. The rule they encode is CLAUDE.md §34.2/§35/§37: a check that could
// not look returns SKIPPED with a reason, and never converts "we could not
// establish this" into "it is not there".
//
// Each fix is pinned in BOTH directions. The findings the audit verified as
// CORRECT — linear.app's unsafe-inline script-src, news.ycombinator.com's — have
// their own tests, because silencing a true positive is the worse error and a
// looser matcher is the easiest way to do it by accident.
// ─────────────────────────────────────────────────────────────────────────────

const DNS = "cloudflare-dns.com";

function context(overrides: Partial<ExtendedCheckContext> = {}): ExtendedCheckContext {
  const html = overrides.pageResult?.html ?? "<html><body>hello</body></html>";
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

/** A page with the given response headers and HTML; every probe 404s, every DNS answer is empty. */
function page(headers: Record<string, string>, html = "<html><body>hello</body></html>"): ExtendedCheckContext {
  return context({
    pageResult: { ok: true, status: 200, headers, html, responseTimeMs: 10, finalUrl: "https://example.test" },
    htmlLower: html.toLowerCase(),
  });
}

function quietNetwork() {
  return vi.fn(async (url: string | URL) => {
    if (String(url).includes(DNS)) {
      return new Response(JSON.stringify({ Answer: [] }), { headers: { "content-type": "application/dns-json" } });
    }
    return new Response("Not found", { status: 404, headers: { "content-type": "text/plain" } });
  });
}

const find = (checks: PulseScanCheckInput[], key: string) => checks.find((check) => check.checkKey === key)!;
const statusOf = (checks: PulseScanCheckInput[], key: string) => find(checks, key).status;
const detailOf = (checks: PulseScanCheckInput[], key: string) => find(checks, key).detail ?? "";

async function run(headers: Record<string, string>, html?: string) {
  vi.stubGlobal("fetch", quietNetwork());
  return runSecurityExtended(page(headers, html));
}

afterEach(() => vi.unstubAllGlobals());

// ─────────────────────────────────────────────────────────────────────────────
// Item 2 — no_api_keys_in_html fired P1 "rotate credentials immediately" on a
// <link rel="mask-icon"> filename hash. The `sk-` alternative had no left word
// boundary, so it matched the letters `ma|sk-` plus a public content digest.
// ─────────────────────────────────────────────────────────────────────────────
describe("no_api_keys_in_html — a filename fingerprint is not a credential", () => {
  // Verbatim from www.gov.uk, and the file it points at is a public SVG (HTTP 200, image/svg+xml).
  const govukMaskIcon =
    '<link rel="mask-icon" href="/assets/frontend/govuk-icon-mask-cdf4265165f8d7f9eec54aa2c1dfbb3d8b6d297c5d7919f0313e0836a5804bb6.svg" color="#0b0c0c">';

  it("does not fire on GOV.UK's mask-icon link", () => {
    expect(findExposedApiKeys(govukMaskIcon)).toEqual([]);
  });

  it("does not FAIL the check on GOV.UK's mask-icon link", async () => {
    const checks = await run({}, `<html><head>${govukMaskIcon}</head><body>x</body></html>`);
    expect(statusOf(checks, "no_api_keys_in_html")).toBe("PASS");
  });

  it("stays quiet across the whole collision class the audit enumerated", () => {
    const digest = "cdf4265165f8d7f9eec54aa2c1dfbb3d8b6d297c5d7919f0313e0836a5804bb6";
    for (const word of ["mask", "task", "disk", "desk", "risk", "kiosk", "flask"]) {
      expect(findExposedApiKeys(`<script src="/assets/${word}-${digest}.js"></script>`), word).toEqual([]);
    }
  });

  it("stays quiet mid-token even when the hash is NOT hex — the left boundary is doing work", () => {
    // Two independent guards, so each needs its own test. This tail is mixed-case
    // base62 (Vite/Rollup-style), which the all-hex rule accepts — only the
    // `(?<![A-Za-z0-9])` anchor stops `ma|sk-` matching here.
    expect(findExposedApiKeys('<link rel="mask-icon" href="/assets/govuk-icon-mask-Xk92mQaf41BbZzTt7LpQvR83NdWsYeK2gHjUc06.svg">')).toEqual([]);
    for (const word of ["task", "disk", "desk", "risk", "kiosk", "flask"]) {
      expect(findExposedApiKeys(`/assets/${word}-Xk92mQaf41BbZzTt7LpQvR83NdWsYeK2gHjUc06.js`), word).toEqual([]);
    }
  });

  it("stays quiet on a hyphen-delimited hex digest, where the left boundary passes", () => {
    // `-sk-` satisfies the word boundary, so only the all-hex tail rule rejects this.
    expect(findExposedApiKeys("/assets/icon-sk-cdf4265165f8d7f9eec54aa2c1dfbb3d8b6d297c5d7919f0.svg")).toEqual([]);
  });

  // ⚠️ SECOND-PASS REGRESSION. The first cut of the digest guard rejected ANY
  // all-hex tail, and `sk-` + 32 lowercase hex is the literal key format DeepSeek
  // and other OpenAI-compatible issuers mint — so a genuinely leaked key was
  // silently discarded. A false negative on a P1 credential finding is strictly
  // worse than the filename false positive it replaced.
  it("⚠️ FALSE NEGATIVE FIXED: still FAILs on a hex-alphabet key (DeepSeek shape)", async () => {
    const html = 'apiKey: "sk-1a2b3c4d5e6f7890abcdef1234567890"';
    expect(findExposedApiKeys(html).map((key) => key.kind)).toEqual(["OpenAI-style secret key"]);
    const checks = await run({}, `<html><body><script>${html}</script></body></html>`);
    expect(statusOf(checks, "no_api_keys_in_html")).toBe("FAIL");
  });

  it("fires on a hex-alphabet key at every length an issuer mints", () => {
    const hex = "1a2b3c4d5e6f7890abcdef1234567890abcdef1234567890abcdef1234567890";
    for (const length of [32, 33, 40, 43, 64]) {
      expect(findExposedApiKeys(`apiKey: "sk-${hex.slice(0, length)}"`), `${length} hex`).toHaveLength(1);
    }
  });

  it("fires on a hex-alphabet key carried in a query string, which is not a filename", () => {
    expect(findExposedApiKeys('<img src="https://api.example.com/t?key=sk-1a2b3c4d5e6f7890abcdef1234567890">')).toHaveLength(1);
  });

  it("still rejects the fingerprint even when a real key appears later in the page", () => {
    // The rule takes the FIRST match; a rejected fingerprint must not stop the scan.
    const html = '<link href="/a/icon-sk-cdf4265165f8d7f9eec54aa2c1dfbb3d8b6d297c5d7919f0.svg">'
      + '<script>k="sk-1a2b3c4d5e6f7890abcdef1234567890"</script>';
    expect(findExposedApiKeys(html)).toHaveLength(1);
  });

  it("still FAILs on a real OpenAI-style secret key", async () => {
    const html = '<script>const client = new OpenAI({ apiKey: "sk-proj-Xk92mQ_af41BbZzTt7LpQvR83NdWsYeK2gHjUc06" });</script>';
    expect(findExposedApiKeys(html).map((key) => key.kind)).toEqual(["OpenAI-style secret key"]);
    const checks = await run({}, html);
    expect(statusOf(checks, "no_api_keys_in_html")).toBe("FAIL");
  });

  it("still FAILs on a real Google key, AWS key id and GitHub token", () => {
    expect(findExposedApiKeys('key="AIzaSyD9fK2mQpR7tLxZ4vNbW8cYeH1jUo03aBs"')).toHaveLength(1);
    expect(findExposedApiKeys("AWSAccessKeyId=AKIAIOSFODNN7EXAMPLE&x=1")).toHaveLength(1);
    expect(findExposedApiKeys("token: ghp_16C7e42F292c6912E7710c838347Ae178B4a")).toHaveLength(1);
  });

  it("redacts the match — the report must not republish the credential", async () => {
    const secret = "sk-proj-Xk92mQ_af41BbZzTt7LpQvR83NdWsYeK2gHjUc06";
    const checks = await run({}, `<script>k="${secret}"</script>`);
    const check = find(checks, "no_api_keys_in_html");
    expect(check.evidence).toContain("sk-pro…");
    expect(check.evidence).not.toContain(secret);
    expect(check.detail).not.toContain(secret);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Item 8 — content_security_policy_nonce tested the WHOLE header for "nonce-",
// so it could not tell script-src from style-src; it did not recognise CSP L3
// hashes; and it emitted "CSP present but uses unsafe-inline" for policies that
// contain none.
// ─────────────────────────────────────────────────────────────────────────────
describe("content_security_policy_nonce — per-directive, CSP Level 3", () => {
  // developer.mozilla.org, served 2026: hashes on script-src, unsafe-inline ONLY on style-src.
  const MDN_CSP = [
    "default-src 'self'",
    "script-src 'report-sample' 'self' 'wasm-unsafe-eval' 'sha256-XNBp89FGCJ7uAoGZbEcEbCbFsNsL9Emgh0v2r0Vex5g=' 'sha256-YCNoU9DNPlOFcRuxDkQNfGaFmGnGxnGxUFR8gTIZ2Sk=' 'sha256-PZjP7OR62hqRLYQBCa9tbnFsLqTLM+RXbLQIQnLxN0M='",
    "script-src-elem 'report-sample' 'self' 'sha256-XNBp89FGCJ7uAoGZbEcEbCbFsNsL9Emgh0v2r0Vex5g='",
    "style-src 'report-sample' 'self' 'unsafe-inline' transcend-cdn.com",
  ].join("; ");

  // linear.app, served 2026 — VERIFIED CORRECT by the audit. Must keep failing.
  const LINEAR_CSP =
    "default-src 'self'; script-src 'unsafe-inline' 'self' blob: https://linear-app.statuspage.io; style-src 'self' 'unsafe-inline'; frame-ancestors 'self' https://cms.linear.app";

  it("PASSes MDN's hash-pinned script-src even though style-src carries unsafe-inline", async () => {
    const checks = await run({ "content-security-policy": MDN_CSP });
    expect(statusOf(checks, "content_security_policy_nonce")).toBe("PASS");
    expect(detailOf(checks, "content_security_policy_nonce")).toContain("hashes");
  });

  it("keeps FAILing linear.app's script-src — the finding the audit verified as correct", async () => {
    const checks = await run({ "content-security-policy": LINEAR_CSP });
    expect(statusOf(checks, "content_security_policy_nonce")).toBe("WARN");
    expect(detailOf(checks, "content_security_policy_nonce")).toContain("'unsafe-inline'");
  });

  it("keeps FAILing news.ycombinator.com's shape — CSP present, unsafe-inline, no nonce or hash", async () => {
    const checks = await run({ "content-security-policy": "default-src 'self'; script-src 'self' 'unsafe-inline' https://www.google-analytics.com" });
    expect(statusOf(checks, "content_security_policy_nonce")).toBe("WARN");
  });

  it("⚠️ CSP L3: a nonce on style-src does NOT rescue a script-src with unsafe-inline", () => {
    const policy = "script-src 'self' 'unsafe-inline'; style-src 'self' 'nonce-r4nd0mVALUE'";
    const inline = evaluateInlineScriptPolicy(policy);
    expect(inline.directive).toBe("script-src");
    expect(inline.hasNonce).toBe(false);
    expect(inline.strict).toBe(false);
  });

  it("does not claim 'uses unsafe-inline' about a policy that contains none", async () => {
    const checks = await run({ "content-security-policy": "default-src 'self'; script-src 'self'" });
    expect(statusOf(checks, "content_security_policy_nonce")).toBe("PASS");
    expect(detailOf(checks, "content_security_policy_nonce")).not.toContain("uses unsafe-inline");
    expect(detailOf(checks, "content_security_policy_nonce")).toContain("blocked outright");
  });

  it("treats a nonce alongside unsafe-inline as the backwards-compatible strict form", () => {
    const inline = evaluateInlineScriptPolicy("script-src 'self' 'unsafe-inline' 'nonce-abc123'");
    expect(inline).toMatchObject({ hasUnsafeInline: true, hasNonce: true, strict: true });
  });

  it("uses the CSP fallback chain: script-src-elem, then script-src, then default-src", () => {
    expect(evaluateInlineScriptPolicy("default-src 'self' 'unsafe-inline'; script-src 'self'; script-src-elem 'self' 'unsafe-inline'").directive)
      .toBe("script-src-elem");
    expect(evaluateInlineScriptPolicy("default-src 'unsafe-inline'; script-src 'self'").directive).toBe("script-src");
    expect(evaluateInlineScriptPolicy("default-src 'self' 'unsafe-inline'").directive).toBe("default-src");
  });

  it("honours only the FIRST occurrence of a repeated directive, as the CSP parser does", () => {
    const directives = parseCspDirectives("script-src 'self'; script-src 'unsafe-inline'");
    expect(directives.get("script-src")).toEqual(["'self'"]);
    expect(evaluateInlineScriptPolicy("script-src 'self'; script-src 'unsafe-inline'").strict).toBe(true);
  });

  it("WARNs when a CSP restricts nothing script-related", async () => {
    const checks = await run({ "content-security-policy": "img-src 'self'; frame-ancestors 'none'" });
    expect(statusOf(checks, "content_security_policy_nonce")).toBe("WARN");
    expect(detailOf(checks, "content_security_policy_nonce")).toContain("no script-src");
  });

  it("reads a <meta http-equiv> CSP rather than reporting no policy", async () => {
    const html = `<html><head><meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'nonce-xyz789'"></head></html>`;
    expect(readMetaCsp(html)).toContain("script-src");
    const checks = await run({}, html);
    expect(statusOf(checks, "content_security_policy_nonce")).toBe("PASS");
  });

  it("does not mistake a report-only meta tag for an enforced policy", () => {
    expect(readMetaCsp('<meta http-equiv="Content-Security-Policy-Report-Only" content="script-src \'none\'">')).toBe("");
  });

  // ⚠️ SECOND-PASS REGRESSION. readMetaCsp was an unscoped regex over the raw
  // HTML, so a documentation page showing a meta-CSP example inside <pre> in the
  // BODY turned a site with NO CSP at all into "inline script is blocked
  // outright". Browsers only honour a meta CSP in <head>, so this is spec-wrong
  // as well as a false negative.
  it("⚠️ FALSE NEGATIVE FIXED: a meta-CSP code sample in the BODY is not a policy", async () => {
    const html = `<html><head></head><body><pre><meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'"></pre></body></html>`;
    expect(readMetaCsp(html)).toBe("");
    const checks = await run({}, html);
    expect(statusOf(checks, "content_security_policy_nonce")).toBe("SKIPPED");
    expect(detailOf(checks, "content_security_policy_nonce")).toContain("not a second one");
  });

  it("ignores a meta CSP anywhere in the body, inside a code sample or not", () => {
    const tag = `<meta http-equiv="Content-Security-Policy" content="script-src 'none'">`;
    expect(readMetaCsp(`<html><head><title>t</title></head><body><code>${tag}</code></body></html>`)).toBe("");
    expect(readMetaCsp(`<html><head></head><body>${tag}</body></html>`)).toBe("");
    // No </head> at all: the implied head ends where <body> starts.
    expect(readMetaCsp(`<html><body>${tag}</body></html>`)).toBe("");
  });

  it("ignores a meta CSP that is commented out or inside a <script> block in the head", () => {
    expect(readMetaCsp(`<head><!-- <meta http-equiv="Content-Security-Policy" content="script-src 'none'"> --></head>`)).toBe("");
    expect(readMetaCsp(`<head><script>document.write('<meta http-equiv="Content-Security-Policy" content="script-src \\'none\\'">')</script></head>`)).toBe("");
  });

  it("still reads a real head-delivered meta CSP", () => {
    expect(readMetaCsp(`<html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="script-src 'self'"></head><body><pre>example</pre></body></html>`))
      .toBe("script-src 'self'");
  });

  // ⚠️ THIRD-PASS RESIDUAL. The head scope was `</head>`, else `<body`, else THE
  // WHOLE DOCUMENT — and both tags are optional in HTML, so a page that emits
  // neither fell through to the unscoped read the scope exists to prevent. The
  // implied head is walked instead: it ends at the first element the parser cannot
  // keep in head, or at the first non-whitespace character data.
  describe("⚠️ FALSE POSITIVE FIXED: the implied head always ends somewhere", () => {
    const TAG = `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'">`;

    it("does not read a body-level meta CSP when there is no </head> and no <body>", () => {
      // The reviewer's exact input. <h1> cannot live in head, so the body has
      // started and a browser ignores the meta that follows.
      expect(readMetaCsp(`<html><h1>docs</h1>${TAG}`)).toBe("");
    });

    it("treats character data as the start of the body, with no element needed", () => {
      expect(readMetaCsp(`<html>Documentation. ${TAG}`)).toBe("");
    });

    it("ends the head at any body-only element, not only <body>", async () => {
      for (const tag of ["<h1>x</h1>", "<div>x</div>", "<p>x", "<pre>x</pre>", "<main>", "<table><tr><td>x"]) {
        expect(readMetaCsp(`<html>${tag}${TAG}`), tag).toBe("");
      }
      // …and the check therefore still reports no enforced policy.
      const checks = await run({}, `<html><h1>docs</h1>${TAG}`);
      expect(statusOf(checks, "content_security_policy_nonce")).toBe("SKIPPED");
    });

    it("⚠️ but still reads a policy in an implied head — <head>/<body> are optional tags", () => {
      // A browser honours this one: the meta is in the head, which the <p> closes.
      expect(readMetaCsp(`<html><head><title>Docs</title>${TAG}<p>body text`)).toBe("default-src 'self'; script-src 'self'");
      // No <head> tag at all, only head-permitted elements before the meta.
      expect(readMetaCsp(`<!doctype html><html><link rel="icon" href="/i.png">${TAG}`)).toBe("default-src 'self'; script-src 'self'");
      // A document that is nothing but head really is all head.
      expect(readMetaCsp(`<html>${TAG}`)).toBe("default-src 'self'; script-src 'self'");
    });

    it("does not let a <title> or a comment before the meta cut the head short", () => {
      // Their text is character data in the raw document; it must not be read as
      // body text, or the boundary would land before the real policy.
      expect(readMetaCsp(`<html><head><title>Getting started with CSP</title>${TAG}`)).toBe("default-src 'self'; script-src 'self'");
      expect(readMetaCsp(`<html><!-- <h1>not a heading</h1> -->${TAG}`)).toBe("default-src 'self'; script-src 'self'");
      expect(readMetaCsp(`<html><script>var t = "<h1>x</h1>";</script>${TAG}`)).toBe("default-src 'self'; script-src 'self'");
    });

    it("is not fooled by a `>` inside an earlier attribute value", () => {
      expect(readMetaCsp(`<html><meta name="description" content="a > b">${TAG}`)).toBe("default-src 'self'; script-src 'self'");
    });

    it("does not let inert markup in a head <template>/<noscript> end the head early", () => {
      // A <div> inside a template is not in the document, so it cannot start the body.
      expect(readMetaCsp(`<html><head><template><div>card</div></template>${TAG}`)).toBe("default-src 'self'; script-src 'self'");
      expect(readMetaCsp(`<html><head><noscript><p>Enable JS</p></noscript>${TAG}`)).toBe("default-src 'self'; script-src 'self'");
    });
  });

  // ⚠️ SECOND-PASS REGRESSION. `script-src-elem` governs <script> ELEMENTS only.
  // Inline event handlers resolve through script-src-attr → script-src, so with
  // `script-src 'unsafe-inline'` an injected `onerror=` still executes. The
  // previous verdict PASSed this with the factually false sentence "inline script
  // is blocked outright".
  it("⚠️ FALSE NEGATIVE FIXED: a strict script-src-elem does not cover inline event handlers", async () => {
    const policy = "default-src 'self'; script-src 'self' 'unsafe-inline'; script-src-elem 'self'";
    const inline = evaluateInlineScriptPolicy(policy);
    expect(inline.directive).toBe("script-src-elem");
    expect(inline.attribute.directive).toBe("script-src");
    expect(inline.attribute.strict).toBe(false);
    expect(inline.strict).toBe(false);

    const checks = await run({ "content-security-policy": policy });
    expect(statusOf(checks, "content_security_policy_nonce")).toBe("WARN");
    const detail = detailOf(checks, "content_security_policy_nonce");
    expect(detail).toContain("script-src-attr");
    expect(detail).not.toContain("blocked outright");
  });

  it("also catches a nonce on script-src-elem with unsafe-inline left on script-src-attr", () => {
    const inline = evaluateInlineScriptPolicy("script-src-elem 'nonce-abc'; script-src-attr 'unsafe-inline'");
    expect(inline.strict).toBe(false);
    expect(inline.attribute.directive).toBe("script-src-attr");
  });

  it("PASSes when script-src-attr itself locks the attribute lane down", async () => {
    const checks = await run({ "content-security-policy": "script-src 'self' 'unsafe-inline'; script-src-elem 'self'; script-src-attr 'none'" });
    expect(statusOf(checks, "content_security_policy_nonce")).toBe("PASS");
  });

  it("still PASSes MDN's shape, where both lanes fall to a hash-pinned script-src", () => {
    const inline = evaluateInlineScriptPolicy("default-src 'self'; script-src 'self' 'sha256-AAA='; script-src-elem 'self' 'sha256-AAA='");
    expect(inline.attribute.directive).toBe("script-src");
    expect(inline.strict).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Item 9 — csp_report_directive read only the ENFORCED policy, so it could not
// see a report-only policy or the `reporting-endpoints` header that `report-to`
// needs to resolve its group name at all.
// ─────────────────────────────────────────────────────────────────────────────
describe("csp_report_directive — reporting lives on the report-only policy", () => {
  it("PASSes vercel.com's real reporting pipeline", async () => {
    const checks = await run({
      "content-security-policy": "default-src 'self'",
      "content-security-policy-report-only":
        "script-src 'none'; report-uri /vc-ap-page-integrity/csp-report?t=1; report-to vercel-page-integrity-csp",
      "reporting-endpoints": 'vercel-page-integrity-csp="https://vercel.com/vc-ap-page-integrity/csp-report?t=1"',
      "report-to": '{"group":"vercel-page-integrity-csp","endpoints":[{"url":"https://vercel.com/csp-report"}]}',
    });
    expect(statusOf(checks, "csp_report_directive")).toBe("PASS");
    expect(detailOf(checks, "csp_report_directive")).toContain("report-only");
  });

  it("accepts a reporting-endpoints header as evidence, hedged to MEDIUM", async () => {
    const checks = await run({
      "content-security-policy": "default-src 'self'",
      "reporting-endpoints": 'csp="https://example.test/csp"',
    });
    const check = find(checks, "csp_report_directive");
    expect(check.status).toBe("PASS");
    expect(check.confidence).toBe("MEDIUM");
  });

  it("still WARNs when a policy exists and nothing reports, at MEDIUM not HIGH", async () => {
    const checks = await run({ "content-security-policy": "default-src 'self'; script-src 'self'" });
    const check = find(checks, "csp_report_directive");
    expect(check.status).toBe("WARN");
    expect(check.confidence).toBe("MEDIUM");
  });

  // ⚠️ SECOND-PASS REGRESSION. `Report-To` is the generic Reporting API v0 header,
  // not a CSP header. Cloudflare emits it together with `NEL` on a very large
  // share of its zones for Network Error Logging, so accepting its presence as
  // proof of CSP reporting PASSed every Cloudflare-fronted site that reports
  // nothing at all about CSP. Verbatim Cloudflare header shape.
  const CLOUDFLARE_NEL = {
    "content-security-policy": "default-src 'self'; script-src 'self' 'unsafe-inline'",
    "report-to": '{"endpoints":[{"url":"https://a.nel.cloudflare.com/report/v4?s=abc"}],"group":"cf-nel","max_age":604800}',
    nel: '{"success_fraction":0,"report_to":"cf-nel","max_age":604800}',
  };

  it("⚠️ FALSE NEGATIVE FIXED: a Cloudflare NEL Report-To header is not CSP reporting", async () => {
    const checks = await run(CLOUDFLARE_NEL);
    const check = find(checks, "csp_report_directive");
    expect(check.status).toBe("WARN");
    expect(check.detail).toContain("Network Error Logging");
  });

  it("does not accept a bare Report-To header even without NEL alongside it", async () => {
    const checks = await run({
      "content-security-policy": "default-src 'self'",
      "report-to": '{"group":"default","endpoints":[{"url":"https://example.test/r"}]}',
    });
    expect(statusOf(checks, "csp_report_directive")).toBe("WARN");
  });

  it("still counts a Report-To GROUP when the POLICY names it", async () => {
    const checks = await run({
      "content-security-policy": "default-src 'self'; report-to csp-group",
      "report-to": '{"group":"csp-group","endpoints":[{"url":"https://example.test/r"}]}',
    });
    const check = find(checks, "csp_report_directive");
    expect(check.status).toBe("PASS");
    expect(check.confidence).toBeUndefined();
  });

  it("does not count a Reporting-Endpoints header whose only group is the one NEL claims", () => {
    expect(cspReportingEndpointPresent('cf-nel="https://a.nel.cloudflare.com/report/v4"', '{"report_to":"cf-nel"}')).toBe(false);
    // A second group could plausibly be CSP's, so that one still counts.
    expect(cspReportingEndpointPresent('cf-nel="https://a.nel/r", csp="https://example.test/csp"', '{"report_to":"cf-nel"}')).toBe(true);
    expect(cspReportingEndpointPresent('csp="https://example.test/csp"', "")).toBe(true);
    expect(cspReportingEndpointPresent("", '{"report_to":"cf-nel"}')).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Item 12 — session_cookie_httponly ran /httponly/i over the JOINED header, with
// no name filter. Two defects in one line, and the FALSE NEGATIVE is the worse:
// one HttpOnly cookie among ten passed the whole set.
// ─────────────────────────────────────────────────────────────────────────────
describe("session cookie flags — evaluated per cookie", () => {
  // The three cookies vercel.com actually sets. All must be JS-readable to work.
  const VERCEL_COOKIES = [
    '_v-consent={"essential":true,"analytics":false}; SameSite=Lax; Secure; Domain=.vercel.com',
    "_v-anonymous-id=va3CHBAksnv4RRcNvvBB; SameSite=Lax; Secure",
    "_v-anonymous-id-renewed=1; SameSite=Lax; Secure",
  ].join(", ");

  it("⚠️ FALSE NEGATIVE FIXED: one HttpOnly cookie no longer passes an exposed session cookie", async () => {
    const joined = "session=abc123def456; Path=/; SameSite=Lax, _tracker=xyz; HttpOnly; SameSite=Lax";
    const checks = await run({ "set-cookie": joined });
    expect(statusOf(checks, "session_cookie_httponly")).toBe("WARN");
    // Pin the exposed LIST exactly, not merely that the name appears somewhere:
    // a weaker assertion passes under implementations that name every cookie.
    expect(detailOf(checks, "session_cookie_httponly")).toContain("without HttpOnly: `session` —");
    expect(find(checks, "session_cookie_httponly").evidence).toBe("`session`");
  });

  it("does not warn about vercel.com's consent and analytics cookies", async () => {
    const checks = await run({ "set-cookie": VERCEL_COOKIES });
    expect(statusOf(checks, "session_cookie_httponly")).toBe("SKIPPED");
    expect(detailOf(checks, "session_cookie_httponly")).toContain("none is named like a session cookie");
    // Those three DO all carry SameSite, so that sibling check passes on evidence.
    expect(statusOf(checks, "session_cookie_samesite")).toBe("PASS");
  });

  it("does not claim a pass when the response set no cookies at all", async () => {
    const checks = await run({});
    expect(statusOf(checks, "session_cookie_httponly")).toBe("SKIPPED");
    expect(statusOf(checks, "session_cookie_samesite")).toBe("SKIPPED");
    expect(detailOf(checks, "session_cookie_samesite")).toContain("no cookies");
  });

  it("still PASSes a properly hardened session cookie", async () => {
    const checks = await run({ "set-cookie": "PHPSESSID=9d8f7; Path=/; HttpOnly; Secure; SameSite=Lax" });
    expect(statusOf(checks, "session_cookie_httponly")).toBe("PASS");
    expect(statusOf(checks, "session_cookie_samesite")).toBe("PASS");
  });

  it("names the one cookie missing SameSite among several that have it", async () => {
    const checks = await run({ "set-cookie": "a=1; SameSite=Lax, b=2; SameSite=Strict, legacy=3; Path=/" });
    expect(statusOf(checks, "session_cookie_samesite")).toBe("WARN");
    expect(detailOf(checks, "session_cookie_samesite")).toContain("`legacy`");
  });

  it("does not split a cookie in half on the comma inside an Expires date", () => {
    const raw = "id=1; Expires=Wed, 21 Oct 2025 07:28:00 GMT; HttpOnly, other=2; Expires=Thu, 01-Jan-1970 00:00:01 GMT";
    expect(splitSetCookieHeader(raw)).toHaveLength(2);
    const cookies = parseSetCookieHeader(raw);
    expect(cookies.map((cookie) => cookie.name)).toEqual(["id", "other"]);
    expect(cookies[0].httpOnly).toBe(true);
    expect(cookies[1].httpOnly).toBe(false);
  });

  it("does not split on the commas inside a JSON cookie value", () => {
    expect(splitSetCookieHeader('_v-consent={"essential":true,"analytics":false,"marketing":false}; SameSite=Lax'))
      .toHaveLength(1);
  });

  // ⚠️ The positive fixtures are OBSERVED product cookie names, not names read off
  // the implementation's own token array. The first version of this test asserted
  // `remember_me_login` — a name no product sets — while the real names
  // (`remember_me`, Laravel's `remember_web_<hash>`, `wordpress_logged_in_<hash>`)
  // all classified FALSE and therefore SKIPped instead of WARNing.
  it("classifies session cookie names without catching the lookalikes", () => {
    for (const name of [
      "PHPSESSID", "JSESSIONID", "connect.sid", "next-auth.session-token", "ASP.NET_SessionId", "access_token", "jwt",
      "wordpress_logged_in_86a9106ae65537651a8e456835b316ab", // WordPress
      "logged_in",                                            // GitHub
      "remember_me",
      "remember_web_59ba36addc2b2f9401580f014c7f58ea4e30989d", // Laravel remember-me
      "li_at",                                                // LinkedIn
      "identity",                                             // ASP.NET Identity / Devise
    ]) {
      expect(looksLikeSessionCookie(name), name).toBe(true);
    }
    for (const name of ["_v-consent", "_v-anonymous-id", "_ga", "sidebar_state", "cf_clearance", "__stripe_mid", "residual_state", "uid", "user_id"]) {
      expect(looksLikeSessionCookie(name), name).toBe(false);
    }
  });

  // ⚠️ SECOND-PASS REGRESSION, reviewer's exact input. A name the filter does not
  // know is a SKIP, so every miss reports a genuinely exposed credential as
  // "not assessed".
  it("⚠️ FALSE NEGATIVE FIXED: WARNs on WordPress's logged-in cookie without HttpOnly", async () => {
    const checks = await run({ "set-cookie": "wordpress_logged_in_86a9106ae65537651a8e456835b316ab=admin%7C1789; Path=/" });
    expect(statusOf(checks, "session_cookie_httponly")).toBe("WARN");
    expect(detailOf(checks, "session_cookie_httponly")).toContain("wordpress_logged_in_");
  });

  it("WARNs on the other auth-cookie names the filter used to miss", async () => {
    for (const name of ["remember_me", "remember_web_59ba36addc2b2f9401580f014c7f58ea4e30989d", "li_at", "logged_in"]) {
      const checks = await run({ "set-cookie": `${name}=v; Path=/; Secure; SameSite=Lax` });
      expect(statusOf(checks, "session_cookie_httponly"), name).toBe("WARN");
    }
  });

  it("still SKIPs an anonymous-id cookie, which must stay JS-readable", async () => {
    const checks = await run({ "set-cookie": "uid=va3CHBAksnv4; Path=/; SameSite=Lax" });
    expect(statusOf(checks, "session_cookie_httponly")).toBe("SKIPPED");
  });

  // ⚠️ THIRD-PASS RESIDUAL: the previous pass closed the misses by widening the
  // matcher to substrings and an `_at$` suffix, which swung it the other way. It
  // now fires on ordinary cookies — and because this key was restored to HIGH
  // confidence, each hit is a P2 actionable "your session cookie is exposed to
  // XSS" against correct configuration, not a P3 advisory.
  //
  // `li_at` and `logged_in` ARE auth cookies while `created_at` and `logged_out`
  // are not, so no blunt suffix or substring rule can separate them — hence
  // whole-token matching plus a curated name list.
  describe("⚠️ FALSE POSITIVE FIXED: a substring or a suffix is not a session name", () => {
    it("does not read a timestamp cookie as a session, for any of the observed forms", () => {
      for (const name of ["created_at", "updated_at", "expires_at", "last_seen_at", "_at"]) {
        expect(looksLikeSessionCookie(name), name).toBe(false);
      }
    });

    it("does not match `auth` or `logged` inside a longer word", () => {
      for (const name of ["author", "authorized_locale", "logged_out"]) {
        expect(looksLikeSessionCookie(name), name).toBe(false);
      }
    });

    it("does not WARN on `Set-Cookie: created_at=…`, the reviewer's exact response", async () => {
      const checks = await run({ "set-cookie": "created_at=1699999999; Path=/; SameSite=Lax" });
      expect(statusOf(checks, "session_cookie_httponly")).toBe("SKIPPED");
      expect(detailOf(checks, "session_cookie_httponly")).toContain("none is named like a session cookie");
    });

    it("does not WARN on a page whose only cookies are timestamps and analytics", async () => {
      const checks = await run({
        "set-cookie": "created_at=1699999999; Path=/, updated_at=1699999999; Path=/, _ga=GA1.1.283; Path=/, author=jane; Path=/",
      });
      expect(statusOf(checks, "session_cookie_httponly")).toBe("SKIPPED");
    });

    // The names in BOTH lists are observed product cookies, never read off the
    // implementation's own token set — the self-confirming-fixture trap the audit
    // called out at item H3.
    it("still matches every real session name, and still ignores every real non-session name", () => {
      for (const name of [
        "sessionid", "connect.sid", "PHPSESSID", "JSESSIONID", "auth_token", "jwt",
        "remember_me", "remember_web_59ba36addc2b2f9401580f014c7f58ea4e30989d",
        "wordpress_logged_in_86a9106ae65537651a8e456835b316ab", "li_at", "logged_in",
        "csrftoken",              // Django — run together, so a token rule has to reach it
        "__Secure-1PSID",         // Google — likewise
        "next-auth.session-token", "ASP.NET_SessionId", "access_token", "identity",
      ]) {
        expect(looksLikeSessionCookie(name), name).toBe(true);
      }
      for (const name of [
        "created_at", "updated_at", "expires_at", "last_seen_at", "_at",
        "author", "authorized_locale", "logged_out",
        "_ga", "_gid", "_v-consent", "_v-anonymous-id", "cf_bm", "_tracker",
        "sidebar_state", "cf_clearance", "__stripe_mid", "residual_state", "uid", "user_id",
      ]) {
        expect(looksLikeSessionCookie(name), name).toBe(false);
      }
    });

    it("still WARNs on a real session cookie sitting alongside the lookalikes", async () => {
      const checks = await run({
        "set-cookie": "created_at=1699999999; Path=/, sessionid=abc123def456; Path=/, logged_out=1; Path=/",
      });
      expect(statusOf(checks, "session_cookie_httponly")).toBe("WARN");
      expect(detailOf(checks, "session_cookie_httponly")).toContain("without HttpOnly: `sessionid` —");
      // The lookalikes are not named as session cookies either.
      expect(find(checks, "session_cookie_httponly").evidence).toBe("`sessionid`");
    });
  });

  // ⚠️ FOURTH-PASS FALSE NEGATIVE. The third pass tightened the matcher to whole
  // tokens and, in doing so, stopped reaching Drupal's session cookie — whose
  // name is SESS/SSESS plus an md5 of the site identifier. Drupal is one of the
  // largest CMS platforms in the world, so a JS-readable Drupal session cookie
  // was reported "not assessed" across a very large population. The camelCase
  // run-together forms were missed for the same reason: the whole name became one
  // unrecognised token.
  describe("⚠️ FALSE NEGATIVE FIXED: the shapes whole-token matching could not reach", () => {
    it("classifies Drupal's SESS / SSESS session cookie", () => {
      // Observed names, verbatim: the confirmer's reproducing input.
      expect(looksLikeSessionCookie("SSESS8c1b8f5e3d2a4b6c7d8e9f0a1b2c3d4e")).toBe(true);
      expect(looksLikeSessionCookie("SESS8c1b8f5e3d2a4b6c7d8e9f0a1b2c3d4e")).toBe(true);
    });

    it("WARNs on a Drupal session cookie served without HttpOnly", async () => {
      const checks = await run({ "set-cookie": "SSESS8c1b8f5e3d2a4b6c7d8e9f0a1b2c3d4e=abc123; Path=/; Secure" });
      expect(statusOf(checks, "session_cookie_httponly")).toBe("WARN");
      expect(detailOf(checks, "session_cookie_httponly")).toContain("SSESS8c1b8f5e3d2a4b6c7d8e9f0a1b2c3d4e");
    });

    it("classifies the camelCase run-together forms", () => {
      expect(looksLikeSessionCookie("sessionKey")).toBe(true);
      expect(looksLikeSessionCookie("jwtAccessToken")).toBe(true);
    });

    // The Drupal pattern is anchored, not a widened substring: it must not turn
    // an ordinary hex-suffixed name into a session cookie.
    it("does not read any hex-suffixed name as a Drupal session", () => {
      for (const name of [
        "assessment8c1b8f5e3d2a4b6c7d8e9f0a1b2c3d4e",  // the word the anchor exists to exclude
        "ab_8c1b8f5e3d2a4b6c7d8e9f0a1b2c3d4e",
        "sess8c1b",                                    // too short to be a digest
      ]) {
        expect(looksLikeSessionCookie(name), name).toBe(false);
      }
    });
  });

  // ⚠️ FOURTH-PASS FALSE POSITIVE, re-opened through a narrower door. `token`,
  // `login` and `identity` are weak nouns on their own, so a consent record, a
  // timestamp, an IdP name and a return URL all classified as session-shaped —
  // and because this key is HIGH confidence each is a P2 "your session cookie is
  // exposed to XSS" against correct configuration. Audit item 12's class.
  describe("⚠️ FALSE POSITIVE FIXED: a credential noun with a non-credential qualifier", () => {
    it("does not read a consent record as a session credential", () => {
      for (const name of ["consent_token", "cookie_consent_token", "consentToken"]) {
        expect(looksLikeSessionCookie(name), name).toBe(false);
      }
    });

    it("does not read login metadata or an IdP name as a session credential", () => {
      for (const name of ["last_login", "login_hint", "identity_provider", "login_redirect", "token_expiry"]) {
        expect(looksLikeSessionCookie(name), name).toBe(false);
      }
    });

    it("SKIPs a response whose only cookies are consent and login metadata", async () => {
      const checks = await run({
        "set-cookie": "cookie_consent_token=granted; Path=/, last_login=1699999999; Path=/, identity_provider=google; Path=/",
      });
      expect(statusOf(checks, "session_cookie_httponly")).toBe("SKIPPED");
      expect(detailOf(checks, "session_cookie_httponly")).toContain("none is named like a session cookie");
    });

    // The veto must not swallow the credential itself. `token`, `access_token`
    // and `identity` are the exact names the qualifiers were attached to.
    it("still matches the bare credential nouns and their real qualified forms", () => {
      for (const name of ["token", "access_token", "refresh_token", "id_token", "identity", "auth_token", "csrf_token"]) {
        expect(looksLikeSessionCookie(name), name).toBe(true);
      }
    });

    it("still WARNs on a real token cookie sitting alongside the consent lookalikes", async () => {
      const checks = await run({
        "set-cookie": "cookie_consent_token=granted; Path=/, access_token=eyJhbGciOi; Path=/, token_expiry=1699999999; Path=/",
      });
      expect(statusOf(checks, "session_cookie_httponly")).toBe("WARN");
      expect(find(checks, "session_cookie_httponly").evidence).toBe("`access_token`");
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Item 13 — rate_limiting_headers asked an HTML document for an API convention,
// so it could not pass on any non-API surface. The probed implementation already
// exists as api_rate_limit_headers in api-behaviour.ts.
// ─────────────────────────────────────────────────────────────────────────────
describe("rate_limiting_headers — the wrong response class", () => {
  it("does not grade a cached HTML document, and says which check owns it", async () => {
    const checks = await run({ "content-type": "text/html; charset=utf-8", "x-nextjs-cache": "HIT" });
    expect(statusOf(checks, "rate_limiting_headers")).toBe("SKIPPED");
    expect(detailOf(checks, "rate_limiting_headers")).toContain("API rate-limit check");
  });

  it("still WARNs on a JSON API response with no rate-limit headers", async () => {
    const checks = await run({ "content-type": "application/json" });
    expect(statusOf(checks, "rate_limiting_headers")).toBe("WARN");
    expect(find(checks, "rate_limiting_headers").confidence).toBe("MEDIUM");
  });

  it("still PASSes when the headers are genuinely there", async () => {
    const checks = await run({ "content-type": "text/html", "x-ratelimit-remaining": "42" });
    expect(statusOf(checks, "rate_limiting_headers")).toBe("PASS");
  });

  it("classifies response classes and header names", () => {
    expect(isApiResponseClass("text/html; charset=utf-8")).toBe(false);
    expect(isApiResponseClass("")).toBe(false);
    expect(isApiResponseClass("application/json")).toBe(true);
    expect(isApiResponseClass("application/graphql-response+json")).toBe(true);
    expect(rateLimitHeaderNames({ "ratelimit-limit": "10", "retry-after": "5", "x-cache": "HIT" }))
      .toEqual(["ratelimit-limit", "retry-after"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Item 18 — with no CSP header, the three dependent checks each emitted their own
// verdict, so one fact ("there is no CSP") appeared as four findings.
// ─────────────────────────────────────────────────────────────────────────────
describe("entailed CSP findings defer to csp_header", () => {
  const DEPENDENTS = ["csp_report_directive", "csp_frame_ancestors", "content_security_policy_nonce"];

  it("emits all three as SKIPPED, referencing the parent, when no CSP is present", async () => {
    const checks = await run({});
    for (const key of DEPENDENTS) {
      expect(statusOf(checks, key), key).toBe("SKIPPED");
      expect(detailOf(checks, key), key).toContain("not a second one");
    }
  });

  it("counts no actionable findings for the absent CSP beyond csp_header itself", async () => {
    const checks = await run({});
    const actionable = checks.filter((check) => DEPENDENTS.includes(check.checkKey) && ["WARN", "FAIL"].includes(check.status));
    expect(actionable).toEqual([]);
  });

  it("mentions X-Frame-Options when it is the thing actually restricting framing", async () => {
    const checks = await run({ "x-frame-options": "DENY" });
    expect(detailOf(checks, "csp_frame_ancestors")).toContain("X-Frame-Options is set");
  });

  it("still WARNs on frame-ancestors when a CSP exists without it", async () => {
    const checks = await run({ "content-security-policy": "default-src 'self'" });
    expect(statusOf(checks, "csp_frame_ancestors")).toBe("WARN");
  });

  it("still PASSes frame-ancestors when the policy carries it", async () => {
    const checks = await run({ "content-security-policy": "frame-ancestors 'self' https://cms.linear.app" });
    expect(statusOf(checks, "csp_frame_ancestors")).toBe("PASS");
  });

  it("does not credit a <meta> policy with frame-ancestors — meta delivery ignores it", async () => {
    const html = `<html><head><meta http-equiv="Content-Security-Policy" content="frame-ancestors 'self'"></head></html>`;
    const checks = await run({}, html);
    expect(statusOf(checks, "csp_frame_ancestors")).toBe("SKIPPED");
  });

  // ⚠️ Presence is not protection, and PASSing a wildcard also contradicted
  // clickjackingVerdict in pulse-scan.ts on the same response — the one-scan
  // self-contradiction audit items 10/18 exist to remove.
  it("⚠️ FALSE NEGATIVE FIXED: frame-ancestors * is not clickjacking protection", async () => {
    const checks = await run({ "content-security-policy": "default-src 'self'; frame-ancestors *" });
    expect(statusOf(checks, "csp_frame_ancestors")).toBe("WARN");
    expect(detailOf(checks, "csp_frame_ancestors")).toContain("permits every origin");
  });

  it("does not credit a scheme-wildcard or bare-scheme source list either", async () => {
    for (const list of ["https://*", "http: https:", "'self' *", "//*"]) {
      const checks = await run({ "content-security-policy": `frame-ancestors ${list}` });
      expect(statusOf(checks, "csp_frame_ancestors"), list).toBe("WARN");
    }
  });

  it("classifies frame-ancestors source lists", () => {
    expect(restrictsFraming(["'none'"])).toBe(true);
    expect(restrictsFraming(["'self'", "https://cms.linear.app"])).toBe(true);
    expect(restrictsFraming(["https://*.linear.app"])).toBe(true); // a wildcard SUBDOMAIN is still a restriction
    expect(restrictsFraming(["*"])).toBe(false);
    expect(restrictsFraming(["https:"])).toBe(false);
    expect(restrictsFraming(["https://*"])).toBe(false);
    expect(restrictsFraming(["'self'", "*"])).toBe(false); // the list is a union
    expect(restrictsFraming([])).toBe(false);
  });

  // ⚠️ FOURTH-PASS FALSE POSITIVE. The bare-scheme rule was unconditional, so a
  // policy that genuinely restricts WEB framing while additionally admitting an
  // app or extension context was WARNed "permits every origin" — an explanation
  // that is untrue of it. pulse-scan.ts's own copy (permitsEveryOrigin) was gated
  // on the remote-page schemes in the third pass; this copy was missed.
  describe("⚠️ FALSE POSITIVE FIXED: a non-remote scheme is not every origin", () => {
    it("PASSes a restricting list that also admits an app or extension context", async () => {
      for (const list of ["'self' chrome-extension:", "'self' moz-extension:", "'self' blob:", "'self' data:", "'self' file:"]) {
        const checks = await run({ "content-security-policy": `frame-ancestors ${list}` });
        expect(statusOf(checks, "csp_frame_ancestors"), list).toBe("PASS");
      }
    });

    it("keeps WARNing on the schemes that CAN carry an arbitrary remote page", () => {
      for (const scheme of ["http:", "https:", "ws:", "wss:", "ftp:"]) {
        expect(restrictsFraming(["'self'", scheme]), scheme).toBe(false);
      }
      for (const scheme of ["chrome-extension:", "moz-extension:", "blob:", "data:", "file:", "capacitor:", "tauri:"]) {
        expect(restrictsFraming(["'self'", scheme]), scheme).toBe(true);
      }
    });
  });

  // ⚠️ FOURTH-PASS FALSE NEGATIVE. A port-scoped bare wildcard host is every
  // origin on that port, but the wildcard-host rule required the `//`, so
  // `frame-ancestors 'self' *:443` PASSed as clickjacking protection.
  describe("⚠️ FALSE NEGATIVE FIXED: a port-scoped wildcard host is still every origin", () => {
    it("does not credit a bare wildcard host carrying a port", () => {
      expect(restrictsFraming(["'self'", "*:443"])).toBe(false);
      expect(restrictsFraming(["*:80"])).toBe(false);
      expect(restrictsFraming(["*:*"])).toBe(false);
    });

    it("WARNs on the policy, not merely on the classifier", async () => {
      const checks = await run({ "content-security-policy": "frame-ancestors 'self' *:443" });
      expect(statusOf(checks, "csp_frame_ancestors")).toBe("WARN");
      expect(detailOf(checks, "csp_frame_ancestors")).toContain("permits every origin");
    });

    it("still PASSes the named-host forms a port does not turn into a wildcard", () => {
      expect(restrictsFraming(["https://cms.linear.app:443"])).toBe(true);
      expect(restrictsFraming(["https://*.example.com:443"])).toBe(true);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Hygiene H2 — the COOP detail read "No COOP header — prevents cross-origin
// window attacks (Spectre)", which says the ABSENCE prevents the attack.
// ─────────────────────────────────────────────────────────────────────────────
describe("cross_origin_opener_policy — the absent-header sentence is not inverted", () => {
  it("does not attribute the protection to the missing header", async () => {
    const checks = await run({});
    const detail = detailOf(checks, "cross_origin_opener_policy");
    expect(statusOf(checks, "cross_origin_opener_policy")).toBe("WARN");
    expect(detail).not.toMatch(/No COOP header\s*[—-]\s*prevents/i);
    expect(detail).toContain("Cross-Origin-Opener-Policy: same-origin");
  });

  it("still reports the header when it is set", async () => {
    const checks = await run({ "cross-origin-opener-policy": "same-origin" });
    expect(statusOf(checks, "cross_origin_opener_policy")).toBe("PASS");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A branch that returns early or forgets a push silently deletes a control.
// ─────────────────────────────────────────────────────────────────────────────
describe("every declared check is still emitted exactly once", () => {
  const HEADER_SHAPES: Array<[string, Record<string, string>]> = [
    ["bare response", {}],
    ["full CSP + cookies + rate limit", {
      "content-security-policy": "default-src 'self'; script-src 'self' 'nonce-abc'; frame-ancestors 'none'; report-uri /csp",
      "set-cookie": "sid=1; HttpOnly; SameSite=Lax",
      "content-type": "application/json",
      "ratelimit-limit": "100",
      "cross-origin-opener-policy": "same-origin",
    }],
    ["report-only CSP and consent cookies only", {
      "content-security-policy-report-only": "script-src 'none'",
      "set-cookie": "_v-consent=1; SameSite=Lax",
      "content-type": "text/html",
    }],
  ];

  it.each(HEADER_SHAPES)("%s", async (_name, headers) => {
    const checks = await run(headers);
    const keys = checks.map((check) => check.checkKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain("no_api_keys_in_html");
    expect(keys).toHaveLength(30);
  });

  // The count guard above cannot catch the specific way this family would be
  // hollowed out: a check that still pushes, but pushes an UNCONDITIONAL SKIP.
  // These pin that the WARN direction is still reachable on a deliberately broken
  // response, per check, so "we could not establish this" can never quietly become
  // "this is fine".
  it("still WARNs, per check, on a deliberately broken response", async () => {
    const checks = await run(
      {
        "content-security-policy": "default-src 'self'; script-src 'self' 'unsafe-inline'; frame-ancestors *",
        "content-type": "application/json",
        "set-cookie": "sessionid=abc123; Path=/",
      },
      '<html><head><link rel="stylesheet" href="/a.css?v=1"></head><body><script src="/app.js.map"></script></body></html>',
    );
    const expected: Array<[string, string]> = [
      ["content_security_policy_nonce", "WARN"], // unsafe-inline, no nonce or hash
      ["csp_frame_ancestors", "WARN"],           // wildcard source list
      ["csp_report_directive", "WARN"],          // policy present, nothing reports
      ["rate_limiting_headers", "WARN"],         // JSON response, no rate-limit headers
      ["session_cookie_httponly", "WARN"],       // session cookie, no HttpOnly
      ["session_cookie_samesite", "WARN"],       // no SameSite either
      ["cross_origin_opener_policy", "WARN"],
      ["cross_origin_resource_policy", "WARN"],
      ["cross_origin_embedder_policy", "WARN"],
      ["caa_dns_record", "WARN"],                // empty DNS answer, not a failed lookup
      ["dnssec_enabled", "WARN"],
      ["no_exposed_source_maps", "WARN"],
      ["csrf_protection_signals", "WARN"],
      ["bot_protection_present", "WARN"],
      ["brute_force_protection", "WARN"],
    ];
    for (const [key, status] of expected) expect(statusOf(checks, key), key).toBe(status);
    expect(checks.filter((check) => check.status === "SKIPPED")).toHaveLength(0);
  });

  it("still FAILs, per check, on a response that is genuinely exposing things", async () => {
    const html = '<script>const k="sk-proj-Xk92mQ_af41BbZzTt7LpQvR83NdWsYeK2gHjUc06"; const password = "hunter2hunter2";</script>'
      + "<p>You have an error in your SQL syntax near LIMIT 1</p>";
    const checks = await run({ "access-control-allow-origin": "*", "access-control-allow-credentials": "true" }, html);
    for (const key of ["no_api_keys_in_html", "secret_scanning_github", "sql_error_exposure", "cors_credentials_restricted"]) {
      expect(statusOf(checks, key), key).toBe("FAIL");
    }
  });
});
