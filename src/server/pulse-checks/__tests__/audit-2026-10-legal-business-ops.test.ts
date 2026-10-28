import { describe, expect, it, vi } from "vitest";
import { runBusinessOperationsChecks } from "../business-operations";
import type { ExtendedCheckContext } from "../_types";

vi.mock("@/server/pulse-lite/url-guard", () => ({
  fetchScannableUrl: (url: string, init?: RequestInit) => fetch(url, init),
}));

// Audit 2026-10 (legal / business false positives). Two-sided: the false positive must
// stop and a genuine signal must keep firing.

function context(html: string, hostname: string): ExtendedCheckContext {
  return {
    pageResult: { ok: true, status: 200, headers: {}, html, responseTimeMs: 10, finalUrl: `https://${hostname}/` },
    httpsUrl: `https://${hostname}`,
    hostname,
    platform: "WEB_APP",
    ctx: { isPaymentEnabled: false, isAuthEnabled: false, isSaas: false, isMobileApp: false, hasBackend: true, authMethod: "unknown" },
    htmlLower: html.toLowerCase(),
    catchAll200: false,
  };
}

async function check(html: string, hostname: string, key: string) {
  const found = (await runBusinessOperationsChecks(context(html, hostname))).find((c) => c.checkKey === key);
  if (!found) throw new Error(`missing ${key}`);
  return found;
}

const page = (body: string, lang = "en") => `<html lang="${lang}"><head><title>Acme</title></head><body>${body}</body></html>`;

describe("support_sla_documented reads a bounded window of visible text", () => {
  it("does not join 'response' in markup or script to a 'time' far away", async () => {
    const minified = page(`<div data-response="1"></div><p>${"Lorem ipsum dolor sit amet. ".repeat(40)}</p><p>Save time every day.</p>
<script>const responseTime=performance.now(); fetch("/sla");</script>`);
    expect((await check(minified, "linear.app", "support_sla_documented")).status).toBe("WARN");
    const apart = page(`<p>We reply to every message, ${"and much more besides ".repeat(5)}and ship within 2 days.</p>`);
    expect((await check(apart, "shop.example.com", "support_sla_documented")).status).toBe("WARN");
  });

  it("still passes a stated response time", async () => {
    expect((await check(page("<p>Our team will reply within 24 hours.</p>"), "shop.example.com", "support_sla_documented")).status).toBe("PASS");
    expect((await check(page("<h2>Support response times</h2>"), "shop.example.com", "support_sla_documented")).status).toBe("PASS");
    expect((await check(page("<p>15-minute response SLA</p>"), "shop.example.com", "support_sla_documented")).status).toBe("PASS");
  });

  // An uptime SLA promises availability, not a support response time (linear.app's pricing
  // page), and "response times may be longer than usual" promises nothing (basecamp.com/support).
  it("does not read an uptime SLA or an unquantified 'response times' as a support commitment", async () => {
    expect((await check(page("<p>99.9% uptime SLA</p>"), "shop.example.com", "support_sla_documented")).status).toBe("WARN");
    expect((await check(page("<p>99.95% uptime SLA, our highest priority support, and more.</p>"), "shop.example.com", "support_sla_documented")).status).toBe("WARN");
    expect((await check(page("<p>We read and respond to every message, though response times may be a bit longer than usual right now.</p>"), "shop.example.com", "support_sla_documented")).status).toBe("WARN");
  });
});

describe("uk_companies_house_number needs a UK signal, not the word 'Ltd'", () => {
  it("skips a non-UK company that merely says Ltd / Limited (old: WARN)", async () => {
    const r = await check(page("<footer>© 2026 Lazada Ltd. Limited time offer! $49</footer>"), "www.lazada.co.th", "uk_companies_house_number");
    expect(r.status).toBe("SKIPPED");
  });

  it("passes a UK company that shows its number, in the usual footer shapes", async () => {
    for (const footer of [
      "Monzo Bank Limited, Broadwalk House, 5 Appold St, London EC2A 2AG. Registered in England and Wales No. 09446231.",
      "Acme Ltd · Company number: SC123456 · Registered in Scotland",
      "Octopus Energy Ltd is a company registered in England and Wales. Registered number: 09263424.",
    ]) {
      expect((await check(page(`<footer>${footer}</footer>`, "en-GB"), "example.com", "uk_companies_house_number")).status, footer).toBe("PASS");
    }
  });

  it("warns a UK company that shows no number, and is INCONCLUSIVE when it is not established to be a company", async () => {
    expect((await check(page("<footer>Acme Ltd, 1 High Street, Leeds LS1 4AP</footer>"), "acme.co.uk", "uk_companies_house_number")).status).toBe("WARN");
    const r = await check(page("<p>Fresh bread daily, £3.50</p>"), "bakery.co.uk", "uk_companies_house_number");
    expect(r.status).toBe("INCONCLUSIVE");
    // "Registered in England" without a number is a company with no number shown.
    expect((await check(page("<footer>Registered in England and Wales.</footer>"), "example.com", "uk_companies_house_number")).status).toBe("WARN");
  });
});

describe("eu_director_info: absence is not a defect, and the word-bounded roles only", () => {
  it("does not pass on 'endpoint' or an art director, and never WARNs on absence", async () => {
    const api = await check(page("<p>Call our API endpoint.</p><p>Meet our art director, Sam.</p>"), "app.example.com", "eu_director_info");
    expect(api.status).toBe("INCONCLUSIVE");
    expect((await check(page("<p>Welcome</p>"), "app.example.com", "eu_director_info")).status).not.toBe("WARN");
  });

  it("still passes a named managing director / Geschäftsführer", async () => {
    expect((await check(page("<footer>Geschäftsführer: Max Mustermann</footer>", "de"), "www.example.de", "eu_director_info")).status).toBe("PASS");
    expect((await check(page("<footer>Managing Director: Jane Doe</footer>"), "example.com", "eu_director_info")).status).toBe("PASS");
  });
});
