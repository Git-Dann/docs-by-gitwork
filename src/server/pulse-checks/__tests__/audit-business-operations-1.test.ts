import { describe, expect, it, vi } from "vitest";
import { runBusinessOperationsChecks } from "../business-operations";
import type { ExtendedCheckContext } from "../_types";

vi.mock("@/server/pulse-lite/url-guard", () => ({
  fetchScannableUrl: (url: string, init?: RequestInit) => fetch(url, init),
}));

function context(html: string): ExtendedCheckContext {
  return {
    pageResult: { ok: true, status: 200, headers: {}, html, responseTimeMs: 10, finalUrl: "https://example.test" },
    httpsUrl: "https://example.test",
    hostname: "example.test",
    platform: "WEB_APP",
    ctx: { isPaymentEnabled: false, isAuthEnabled: false, isSaas: false, isMobileApp: false, hasBackend: true, authMethod: "unknown" },
    htmlLower: html.toLowerCase(),
    catchAll200: false,
  };
}

async function check(html: string, key: string) {
  const checks = await runBusinessOperationsChecks(context(html));
  const found = checks.find((c) => c.checkKey === key);
  if (!found) throw new Error(`missing ${key}`);
  return found;
}

describe("physical_address_footer truthfulness", () => {
  it("does not treat prose ending in st/ct as a street address (headspace.com, mailchimp.com)", async () => {
    const headspace = `<script id="__NEXT_DATA__">{"fields":{"title":"3 Finding your Best Sleep (sleep tab)"}}</script><footer>© 2026 Headspace Inc.</footer>`;
    const mailchimp = `<p>Send up to 12 times your maximum contact count each month.</p>`;
    expect((await check(headspace, "physical_address_footer")).status).toBe("WARN");
    expect((await check(mailchimp, "physical_address_footer")).status).toBe("WARN");
  });

  it("still detects real addresses (Monzo, Wise registered office, US street line, UK postcode)", async () => {
    const monzo = `<p>Our address is Broadwalk House, 5 Appold St, London EC2A 2AG.</p>`;
    const wise = `<p>Wise Europe SA is a company incorporated in Belgium. Our registered office is at Rue du Trône 100, 3rd floor, 1050 Brussels, Belgium.</p>`;
    const us = `<footer><address>548 Market Street, San Francisco, CA 94104</address></footer>`;
    const ukPostcodeOnly = `<footer>Acme Ltd, Unit B, Riverside, Manchester M1 1AE</footer>`;
    for (const html of [monzo, wise, us, ukPostcodeOnly]) {
      expect((await check(html, "physical_address_footer")).status).toBe("PASS");
    }
  });

  it("does not claim the address is legally required in the footer", async () => {
    const result = await check("<main><p>Plan your week.</p></main>", "physical_address_footer");
    expect(result.status).toBe("WARN");
    expect(result.detail).toMatch(/scanned page/);
    expect(result.detail).not.toMatch(/in your footer/);
  });
});

describe("data_retention_schedule truthfulness", () => {
  it("does not pass on unrelated tokens joined across minified HTML (wise.com, docs.github.com)", async () => {
    const wise = `<div data-testid="chromeless-video" preload="none"></div><p>Our tools save you money.</p><span>Customer retention is our priority</span>`;
    const ghDocs = `<p>GitHub may retain questions and answers generated in the Docs search function.</p><a href="/en/rest/troubleshooting">Troubleshooting</a>`;
    expect((await check(wise, "data_retention_schedule")).status).toBe("WARN");
    expect((await check(ghDocs, "data_retention_schedule")).status).toBe("WARN");
  });

  it("still detects real retention sections (supabase.com/privacy, linear.app/privacy)", async () => {
    const supabase = `<a href="#5-data-retention-and-security">Data retention and security</a>`;
    const linear = `<h2>Data Security and Retention</h2><p>We retain Personal Data about you for as long as you have an open account with us.</p>`;
    expect((await check(supabase, "data_retention_schedule")).status).toBe("PASS");
    expect((await check(linear, "data_retention_schedule")).status).toBe("PASS");
  });

  it("scopes the WARN to the scanned page instead of asserting site-wide absence", async () => {
    const result = await check("<main><h1>Build in a weekend</h1></main>", "data_retention_schedule");
    expect(result.status).toBe("WARN");
    expect(result.detail).toMatch(/scanned page/);
  });
});
