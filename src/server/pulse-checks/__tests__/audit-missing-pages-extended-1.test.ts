import { describe, expect, it, vi } from "vitest";

// Every path probe answers 404, so the verdict depends only on the homepage's link
// detection under test (and the test makes no network calls).
vi.mock("../path-probe", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../path-probe")>()),
  fetchSnippet: async () => ({ status: 404, contentType: "text/html", body: "" }),
}));

import { runMissingPagesExtended } from "../missing-pages-extended";
import type { ExtendedCheckContext } from "../_types";

function context(html: string, hostname: string): ExtendedCheckContext {
  const url = `https://${hostname}`;
  return {
    pageResult: { ok: true, status: 200, headers: {}, html, responseTimeMs: 10, finalUrl: url },
    httpsUrl: url,
    hostname,
    platform: "SAAS",
    ctx: { isPaymentEnabled: false, isAuthEnabled: false, isSaas: true, isMobileApp: false, hasBackend: true, authMethod: "unknown" },
    htmlLower: html.toLowerCase(),
    catchAll200: true,
  };
}

const statusOf = async (html: string, hostname: string) =>
  (await runMissingPagesExtended(context(html, hostname))).find((c) => c.checkKey === "security_dedicated_page")?.status;

describe("security_dedicated_page link detection", () => {
  it("passes when the security page is linked by absolute same-site URL (cal.com)", async () => {
    const html = `<footer><a class="flex" name="Icon Wrapper" href="https://cal.com/security" target="_blank">Security</a></footer>`;
    expect(await statusOf(html, "cal.com")).toBe("PASS");
  });

  it("passes when the site links a trust-centre subdomain (anthropic.com)", async () => {
    const html = `<footer><a href="https://trust.anthropic.com/">Transparency</a><a href="https://www.anthropic.com/legal/privacy">Privacy</a></footer>`;
    expect(await statusOf(html, "www.anthropic.com")).toBe("PASS");
  });

  it("still passes on the original relative /security link (notion.so)", async () => {
    expect(await statusOf(`<a href="/security">Security</a>`, "www.notion.so")).toBe("PASS");
  });

  it("still warns when only off-site or product pages mention security", async () => {
    const html = `<a href="https://claude.com/product/claude-security">Claude Security</a><a href="https://claude.com/solutions/cybersecurity">Cyber</a><a href="https://github.com/security">GitHub</a>`;
    expect(await statusOf(html, "www.anthropic.com")).toBe("WARN");
  });

  it("does not treat a look-alike domain as same-site", async () => {
    expect(await statusOf(`<a href="https://notexample.com/security">x</a>`, "example.com")).toBe("WARN");
  });

  it("does not treat a trust. subdomain of a look-alike host as same-site", async () => {
    expect(await statusOf(`<a href="https://trust.example.com.evil.net/">x</a>`, "example.com")).toBe("WARN");
    expect(await statusOf(`<a href="https://trust.example.community/">x</a>`, "example.com")).toBe("WARN");
  });

  it("accepts ./security and a trailing slash", async () => {
    expect(await statusOf(`<a href="./security/">Security</a>`, "example.com")).toBe("PASS");
  });
});
