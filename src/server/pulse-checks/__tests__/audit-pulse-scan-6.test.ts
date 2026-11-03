import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  findPrivacyPolicyHref,
  hasResourceHint,
  isOpenApiDocument,
  linksPricingPage,
  policyHasMaintenanceDate,
  resolveLegalDocumentChecks,
} from "@/server/pulse-scan";

// Audit packet pulse-scan-6 (October 2026). Every fixture is a fragment of a response
// observed live with curl; each "must change" case failed on the old code, and each
// "must not change" case pins a correct verdict the fix must keep.

const SOURCE = readFileSync("src/server/pulse-scan.ts", "utf8");

describe("pricing_page resolves hrefs instead of substring-matching href=\"/pricing", () => {
  it("cal.com links ./pricing — now detected", () => {
    const html = `<nav><a class="nav" href="./pricing">Pricing</a><a href="./enterprise">Enterprise</a></nav>`;
    expect(linksPricingPage(html, "https://cal.com")).toBe(true);
  });
  it("absolute same-site and locale-prefixed links count", () => {
    expect(linksPricingPage(`<a href="https://www.notion.com/pricing">Pricing</a>`, "https://notion.com")).toBe(true);
    expect(linksPricingPage(`<a href="/en-gb/pricing">Pricing</a>`, "https://example.com")).toBe(true);
  });
  it("still detects the classic supabase.com href=\"/pricing\"", () => {
    expect(linksPricingPage(`<a href="/pricing">Pricing</a>`, "https://supabase.com")).toBe(true);
  });
  it("does not credit another company's pricing page, an anchor, or unrelated links", () => {
    expect(linksPricingPage(`<a href="https://stripe.com/pricing">Powered by Stripe</a>`, "https://example.com")).toBe(false);
    expect(linksPricingPage(`<a href="#pricing">x</a><a href="/blog">Blog</a><a href="mailto:hi@example.com">Mail</a>`, "https://example.com")).toBe(false);
  });
});

describe("resource hints read dns-prefetch, Link headers, and skip comments", () => {
  const PRECONNECT = ["preconnect", "dns-prefetch"];
  const PRELOAD = ["preload", "modulepreload"];

  it("www.baidu.com dns-prefetch counts for preconnect_hints", () => {
    const html = `<link rel="dns-prefetch" href="//dss0.bdstatic.com"/><link rel="dns-prefetch" href="//sp0.baidu.com"/>`;
    expect(hasResourceHint(html, undefined, PRECONNECT)).toBe(true);
  });
  it("www.gov.uk Link-header preloads count for preload_hints", () => {
    const link = "</assets/frontend/views/_homepage-4b78.css>; rel=preload; as=style; nopush,</assets/frontend/rum-custom-data-b9e1.js>; rel=modulepreload; as=script; nopush";
    expect(hasResourceHint("<!doctype html><html lang=\"en\"><head><title>Welcome to GOV.UK</title></head></html>", link, PRELOAD)).toBe(true);
  });
  it("still detects quoted markup hints (wordpress.org/news, zalando)", () => {
    expect(hasResourceHint(`<link rel='preload' href='https://wordpress.org/news/Inter-latin.woff2' as='font' crossorigin='crossorigin' />`, undefined, PRELOAD)).toBe(true);
    expect(hasResourceHint(`<link rel="preconnect" href="https://img01.ztat.net/">`, undefined, PRECONNECT)).toBe(true);
  });
  it("badssl.com's commented-out <link rel=preload> does NOT count", () => {
    const html = `<div id="preload" style="width: 0; height: 0;">\n    <!-- <link rel=preload> results in warnings in Chrome: https://crbug.com/661055 -->\n  </div>`;
    expect(hasResourceHint(html, undefined, PRELOAD)).toBe(false);
  });
  it("example.com with no hints stays WARN, and modulepreload is not a preconnect", () => {
    expect(hasResourceHint(`<html><head><title>Example Domain</title><style>body{}</style></head></html>`, undefined, PRELOAD)).toBe(false);
    expect(hasResourceHint(`<link rel="modulepreload" href="/a.js"><link rel="stylesheet" href="/preconnect.css">`, undefined, PRECONNECT)).toBe(false);
  });
  it("both checks are wired to the helper and the Link header", () => {
    expect(SOURCE).toContain('hasResourceHint(pageResult.html, pageResult.headers["link"], ["preload", "modulepreload"])');
    expect(SOURCE).toContain('hasResourceHint(pageResult.html, pageResult.headers["link"], ["preconnect", "dns-prefetch"])');
  });
});

describe("openapi_endpoint recognises a scanned URL that IS the spec", () => {
  it("petstore3.swagger.io/api/v3/openapi.json body is a spec", () => {
    expect(isOpenApiDocument('{"openapi":"3.0.4","info":{"title":"Swagger Petstore - OpenAPI 3.0"}}')).toBe(true);
    expect(isOpenApiDocument("openapi: 3.1.0\ninfo:\n  title: Petstore")).toBe(true);
    expect(isOpenApiDocument('{\n  "swagger" : "2.0",\n  "info": {}\n}')).toBe(true);
  });
  it("an HTML page that merely mentions swagger-ui or quotes YAML is not a spec", () => {
    expect(isOpenApiDocument('<!doctype html><html><body><div class="swagger-ui"></div><pre>\nopenapi: 3.0.0</pre></body></html>')).toBe(false);
    expect(isOpenApiDocument('{"name":"not a spec"}')).toBe(false);
  });
  it("probes the origin and consults the scanned page", () => {
    expect(SOURCE).toContain("checkPaths(openApiOrigin, [\"/openapi.json\"");
    expect(SOURCE).toContain("scannedPageIsSpec || openApiProbe.exposedPaths.length > 0");
  });
});

describe("privacy_last_updated reads the policy, not the homepage", () => {
  it("finds the linked policy URL (webflow, flipkart)", () => {
    expect(findPrivacyPolicyHref(`<footer><a href="https://webflow.com/legal/privacy">Privacy</a></footer>`, "https://webflow.com")).toBe("https://webflow.com/legal/privacy");
    expect(findPrivacyPolicyHref(`<a href="/pages/privacypolicy?otracker=footer_navlinks" aria-label="Privacy">Privacy</a>`, "https://www.flipkart.com")).toBe("https://www.flipkart.com/pages/privacypolicy?otracker=footer_navlinks");
  });
  it("ignores commented-out and non-policy links", () => {
    expect(findPrivacyPolicyHref(`<!-- <a href="/privacy">old</a> --><a href="/privacy-shield-explained">x</a>`, "https://example.com")).toBeNull();
  });
  it("recognises real maintenance dates (webflow, rakuten, figma)", () => {
    expect(policyHasMaintenanceDate('<h1>Global Privacy Policy</h1></div><p data-animation-css="large-1" class="u-mb-0">Effective date: March 17, 2025</p>')).toBe(true);
    expect(policyHasMaintenanceDate("最終改定日：2022年3月31日 改定前の方針は こちら")).toBe(true);
    expect(policyHasMaintenanceDate('<div>Effective Date</div><time dateTime="2026-09-01">September 1, 2026</time>')).toBe(true);
  });
  it("a policy with no date is still reported as undated", () => {
    expect(policyHasMaintenanceDate("<h1>Privacy Policy</h1><p>We provide an effective service and update our systems regularly.</p>")).toBe(false);
  });
  it("only WARNs after actually reading a confirmed policy", () => {
    expect(SOURCE).toMatch(/status: hasPrivacyLastUpdated \? "PASS" : privacyPolicyRead \? "WARN" : "INCONCLUSIVE"/);
  });
});

describe("privacy_policy credits a policy published inline on the page", () => {
  const NOT_FOUND = { status: 404, contentType: "text/html", body: "<html><title>404</title><h1>Page not found</h1></html>" };

  it("allbirds.co.uk footer modal with the full policy — now PASS", async () => {
    const html = `<html><head><title>Allbirds: Comfortable, Sustainable Shoes &amp; Apparel</title></head><body>
<footer><a role='button' class='cursor-pointer hover:text-white hover:underline'>Privacy policy</a></footer>
<div id='modal-privacy-policy' aria-modal='true' aria-labelledby='dialog_Privacy policy'>
<h2 class='mb-4 text-center font-sans text-3xl font-medium text-black'>Privacy policy</h2>
<h1 style="font-size: 1.9em; font-weight: bold;"><span style="color: rgb(0, 0, 0);">Privacy Policy</span></h1>
${"<p>We collect personal information when you place an order, and we use that personal information to fulfil it.</p>".repeat(8)}
<h3>Sharing with third parties</h3><p>We share personal information with third-party service providers who process it on our behalf.</p>
<h3>Your rights</h3><p>You may request access to, or deletion of, the personal information we hold about you.</p>
</div></body></html>`;
    const probe = vi.fn(async () => NOT_FOUND);
    const result = await resolveLegalDocumentChecks({ html, baseUrl: "https://www.allbirds.co.uk", catchAll200: false, unreadableShell: false, probe });
    expect(result.privacy.status).toBe("PASS");
    // An inline privacy policy says nothing about terms.
    expect(result.terms.status).toBe("FAIL");
  });

  it("a blog post ABOUT privacy policies is not one — still FAIL", async () => {
    const html = `<html><head><title>Why your startup needs a Privacy Policy</title></head><body><h1>Why your startup needs a Privacy Policy</h1>
${"<p>Any business that collects personal data needs to explain how it uses that personal data.</p>".repeat(4)}</body></html>`;
    const probe = vi.fn(async () => NOT_FOUND);
    const result = await resolveLegalDocumentChecks({ html, baseUrl: "https://blog.example", catchAll200: false, unreadableShell: false, probe });
    expect(result.privacy.status).toBe("FAIL");
  });

  it("many mentions in a headed page still need the sections a real policy has", async () => {
    const html = `<html><head><title>Privacy Policy generator</title></head><body><h1>Free Privacy Policy generator</h1>
${"<p>Generate a policy that explains how you handle personal data and personal information.</p>".repeat(10)}</body></html>`;
    const probe = vi.fn(async () => NOT_FOUND);
    const result = await resolveLegalDocumentChecks({ html, baseUrl: "https://generator.example", catchAll200: false, unreadableShell: false, probe });
    expect(result.privacy.status).toBe("FAIL");
  });

  it("a footer heading plus a cookie banner is NOT a policy — still FAIL", async () => {
    const html = `<html><head><title>Acme</title></head><body><div class="cookie-banner">We use cookies and process personal data to improve the site.</div><footer><h3>Privacy policy</h3><p>Coming soon</p></footer></body></html>`;
    const probe = vi.fn(async () => NOT_FOUND);
    const result = await resolveLegalDocumentChecks({ html, baseUrl: "https://acme.example", catchAll200: false, unreadableShell: false, probe });
    expect(result.privacy.status).toBe("FAIL");
  });
});

describe("no_x_powered_by severity", () => {
  it("a framework-only X-Powered-By is a WARN, not a FAIL, and still never a PASS", () => {
    const block = SOURCE.slice(SOURCE.indexOf('checkKey: "no_x_powered_by"'), SOURCE.indexOf('checkKey: "no_x_powered_by"') + 1600);
    expect(block).toContain('status: xPoweredBy ? "WARN" : "PASS"');
    expect(block).not.toContain('status: xPoweredBy ? "FAIL"');
    expect(block).not.toContain("target known vulnerabilities");
    // A versioned value (PHP/7.2.24) is named as a version leak, at the same WARN severity
    // no_server_version gives a version in the Server header.
    expect(block).toContain("includes a version number");
  });
});
