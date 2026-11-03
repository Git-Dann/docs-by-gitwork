import { describe, expect, it } from "vitest";
import { runObservabilityExtended } from "../observability-extended";
import type { ExtendedCheckContext } from "../_types";

function context(html: string, platform = "SAAS"): ExtendedCheckContext {
  return {
    pageResult: { ok: true, status: 200, headers: {}, html, responseTimeMs: 10, finalUrl: "https://example.test" },
    httpsUrl: "https://example.test",
    hostname: "example.test",
    platform,
    ctx: { isPaymentEnabled: false, isAuthEnabled: false, isSaas: true, isMobileApp: false, hasBackend: true, authMethod: "unknown" },
    htmlLower: html.toLowerCase(),
    catchAll200: false,
  } as ExtendedCheckContext;
}

async function check(html: string, key: string) {
  const checks = await runObservabilityExtended(context(html));
  return checks.find((c) => c.checkKey === key)!;
}

describe("public_status_page (audit observability-extended-1)", () => {
  it("does not treat tweet/X permalinks as a status page", async () => {
    const html = `<footer><a href="https://twitter.com/nerdburn/status/1356857261495214085">tweet</a>
      <a href="https://x.com/patrickc/status/1979157875600617913">tweet</a>
      <script src="/assets/usePaymentIntentStatusMessage-BLrORoKZ.js"></script></footer>`;
    const c = await check(html, "public_status_page");
    expect(c.status).toBe("WARN");
    expect(c.detail).toMatch(/No link to a public status page was found on the scanned page/);
  });

  it("still passes real status-page links (control)", async () => {
    for (const href of [
      "https://status.supabase.com/",
      "https://www.githubstatus.com",
      "https://www.vercel-status.com",
      "https://www.notion-status.com",
      "https://status.cal.com/",
      "/status",
    ]) {
      const html = `<footer><a href="https://x.com/someone/status/1">tweet</a><a href="${href}" target="_blank">Status</a></footer>`;
      const c = await check(html, "public_status_page");
      expect(c.status, href).toBe("PASS");
    }
  });

  it("still passes on explicit 'System status' text (control)", async () => {
    const c = await check(`<a href="/help">System status</a>`, "public_status_page");
    expect(c.status).toBe("PASS");
  });
});

describe("public_status_page: status-like last path segment (audit observability-extended-1)", () => {
  it("PASSes locale-prefixed, query-string and system-status paths", async () => {
    for (const href of [
      "https://example.com/en/status",
      "https://example.com/status?x=1",
      "/system-status",
      "/support/systemstatus/",
    ]) {
      expect((await check(`<a href="${href}">Status</a>`, "public_status_page")).status).toBe("PASS");
    }
  });
  it("still WARNs on order-status pages and status.yml files", async () => {
    for (const href of ["/order-status", "https://github.com/acme/repo/blob/main/status.yml", "https://bsky.app/profile/a.bsky.social/post/3k"]) {
      expect((await check(`<a href="${href}">x</a>`, "public_status_page")).status).toBe("WARN");
    }
  });
});
