import { describe, expect, it } from "vitest";
import { runPaymentsExtended } from "../payments-extended";
import type { ExtendedCheckContext } from "../_types";

function context(html: string, isSaas = true): ExtendedCheckContext {
  return { pageResult: { ok: true, status: 200, headers: {}, html, responseTimeMs: 1, finalUrl: "https://example.test/" }, httpsUrl: "https://example.test", hostname: "example.test", platform: "SAAS", ctx: { isPaymentEnabled: true, isAuthEnabled: true, isSaas, isMobileApp: false, hasBackend: true, authMethod: "unknown" }, htmlLower: html.toLowerCase(), catchAll200: false };
}
const statusOf = async (html: string, key: string) => (await runPaymentsExtended(context(html))).find((c) => c.checkKey === key)?.status;

describe("sepa_bank_transfer reads visible copy, not CSS/class names", () => {
  it("does not treat border-collapse:separate or a Separator class as SEPA (posthog/github/linear homepages)", async () => {
    const html = '<style>.prose table{border-collapse:separate;border-spacing:0}</style><link rel="stylesheet" href="/_next/static/css/HomepageSeparator.DAb6YYB9.css"><ul><li><div class="group__i-sw4v hasSeparator__DZ8QkP"><span>Product</span></div></li></ul><a href="/pricing">Pricing</a>';
    expect(await statusOf(html, "sepa_bank_transfer")).toBe("WARN");
  });
  it("still detects a real SEPA / bank transfer offer", async () => {
    expect(await statusOf('<ul><li>Pay annually by SEPA Direct Debit or bank transfer (IBAN on invoice)</li></ul>', "sepa_bank_transfer")).toBe("PASS");
    expect(await statusOf('<p>We accept card and Bank-Transfer payments.</p>', "sepa_bank_transfer")).toBe("PASS");
  });
});

describe("payment_price_currency needs a visible price", () => {
  it("ignores asset hashes, RSC refs and headline revenue figures (github/vercel/bolt/HN homepages)", async () => {
    const html = '<link crossorigin="anonymous" rel="stylesheet" href="https://github.githubassets.com/assets/light_colorblind-3862d92e8cad06f0.css" /><script>self.__next_f.push([1,"3:I[1081182,[\\"$2\\"],\\"default\\"]"])</script><main><h1>Build and ship software on a single, collaborative platform</h1><p>Built in an afternoon — no code, no developer, no $100K project.</p><p>Chatbase scaled from zero to $10M ARR.</p><a href="/pricing">Pricing</a></main>';
    expect(await statusOf(html, "payment_price_currency")).toBe("WARN");
  });
  it("still detects real displayed prices (cal.com, notion, github pricing copy)", async () => {
    expect(await statusOf('<p>Teams ($16/user/month) adds round-robin scheduling</p>', "payment_price_currency")).toBe("PASS");
    expect(await statusOf('<div>Free</div><div>&pound;0 per member / month</div>', "payment_price_currency")).toBe("PASS");
    expect(await statusOf('<span>$</span><span>0</span> USD per month', "payment_price_currency")).toBe("PASS");
    expect(await statusOf('<p>Enterprise plans from $1,000.</p>', "payment_price_currency")).toBe("PASS");
    expect(await statusOf('<p>Pro: 20 EUR / month</p>', "payment_price_currency")).toBe("PASS");
  });
});

describe("audit payments-extended-1: reviewer-requested regressions", () => {
  it("keeps a SEPA logo's alt text and hyphenated Direct-Debit", async () => {
    expect(await statusOf('<img src="/logos/sepa.svg" alt="SEPA Direct Debit">', "sepa_bank_transfer")).toBe("PASS");
    expect(await statusOf("<p>Pay by Direct-Debit.</p>", "sepa_bank_transfer")).toBe("PASS");
  });
  it("PASSes a price whose currency symbol sits in its own span, or is a hex entity", async () => {
    expect(await statusOf("<span>$</span><span>29</span>/mo", "payment_price_currency")).toBe("PASS");
    expect(await statusOf("<p>&#x24;19 per seat</p>", "payment_price_currency")).toBe("PASS");
    expect(await statusOf("<p>$49 M-F support</p>", "payment_price_currency")).toBe("PASS");
    expect(await statusOf("<p>€ 20 / Monat</p>", "payment_price_currency")).toBe("PASS");
  });
  it("does not read a magnitude as a price", async () => {
    expect(await statusOf("<p>Raised $1.5M. Over $100k+ saved. A $2 bn market, $ 5 million users.</p>", "payment_price_currency")).toBe("WARN");
  });
});
