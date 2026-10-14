import { describe, expect, it, vi } from "vitest";

// No network: catchAll200 is set so the /security-whitepaper HEAD probe is skipped,
// and the transport is stubbed defensively.
vi.mock("@/server/pulse-lite/url-guard", () => ({
  fetchScannableUrl: async () => new Response(null, { status: 404 }),
}));

import { runTrustBrandExtended } from "../trust-brand-extended";
import type { ExtendedCheckContext } from "../_types";

function ctxFor(html: string, url = "https://example.test"): ExtendedCheckContext {
  return {
    pageResult: { ok: true, status: 200, headers: {}, html, responseTimeMs: 50, finalUrl: url },
    httpsUrl: url,
    hostname: new URL(url).hostname,
    platform: "SAAS",
    ctx: { isPaymentEnabled: false, isAuthEnabled: false, isSaas: true, isMobileApp: false, hasBackend: false, authMethod: "unknown" },
    htmlLower: html.toLowerCase(),
    catchAll200: true,
  };
}

async function statusOf(html: string, key: string) {
  const checks = await runTrustBrandExtended(ctxFor(html));
  return checks.find((c) => c.checkKey === key)?.status;
}

describe("uptime_history_public — linked status pages count", () => {
  it("PASSes github.com-style footer linking www.githubstatus.com", async () => {
    const html = `<footer><ul><li><a href="https://www.githubstatus.com" data-analytics-event="footer">Status</a></li><li><a href="https://docs.github.com">Docs</a></li></ul></footer>`;
    expect(await statusOf(html, "uptime_history_public")).toBe("PASS");
  });

  it("PASSes linear.app-style link to linearstatus.com and cal.com-style status.cal.com", async () => {
    expect(await statusOf(`<a class="Footer_link" href="https://linearstatus.com">Status</a>`, "uptime_history_public")).toBe("PASS");
    expect(await statusOf(`<a href="https://status.cal.com/" target="_blank">Status</a>`, "uptime_history_public")).toBe("PASS");
  });

  it("still WARNs on a page with no status link (news.ycombinator.com-style), even with an order-status path", async () => {
    const html = `<span class="yclinks"><a href="newsguidelines.html">Guidelines</a> | <a href="newsfaq.html">FAQ</a> | <a href="https://shop.example.test/order-status">Order status</a></span>`;
    expect(await statusOf(html, "uptime_history_public")).toBe("WARN");
  });
});

describe("named_customer_quotes — 'Title, Company' attribution", () => {
  it("PASSes linear.app testimonial markup (name then 'Staff Software Engineer, OpenAI')", async () => {
    const html = `<figure><blockquote>You can just feel the craft that using Linear infuses on your brain.</blockquote><figcaption><span>Gabriel Peal</span><span>Staff Software Engineer, OpenAI</span></figcaption></figure>`;
    expect(await statusOf(html, "named_customer_quotes")).toBe("PASS");
  });

  it("PASSes cal.com testimonial markup ('Co-Founder &amp; CTO, Supabase')", async () => {
    const html = `<div><p>"I finally made the move to Cal.com."</p><p>Ant Wilson</p><p>Co-Founder &amp; CTO, Supabase</p></div>`;
    expect(await statusOf(html, "named_customer_quotes")).toBe("PASS");
  });

  it("still WARNs on an anonymous-quote page and does not match titles hidden in script", async () => {
    const html = `<section><p>"Best tool we've used." — a happy customer</p><p>Our engineers, designers and support team are here to help.</p></section><script>window.__d={role:"Staff Software Engineer, OpenAI"}</script>`;
    expect(await statusOf(html, "named_customer_quotes")).toBe("WARN");
  });
});

describe("named_customer_quotes — anchored on a personal name", () => {
  it("does not PASS on news prose, role lists, job lists or company bios", async () => {
    for (const html of [
      "<p>Nvidia, Benchmark and Flock's CEO, Nvidia, Benchmark weigh in.</p>",
      "<p>Made for every CEO, Founder</p>",
      "<h2>Careers</h2><p>Careers Senior Software Engineer, Product Designer</p>",
      "<p>Our CEO, Jane Smith, founded the company.</p>",
      "<p>Founder, Acme</p>",
    ]) {
      expect(await statusOf(html, "named_customer_quotes")).toBe("WARN");
    }
  });
  it("PASSes the live attribution shapes", async () => {
    for (const html of [
      "<p>Guillermo Rauch</p><p>CEO, Vercel</p>",
      "<p>Mark Rees, CTO, Xero</p>",
      "<p>Bryan Byrne, Product Manager, Lovable</p>",
    ]) {
      expect(await statusOf(html, "named_customer_quotes")).toBe("PASS");
    }
  });
});
