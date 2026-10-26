import { describe, expect, it } from "vitest";
import { runLegalExtended } from "../legal-extended";
import type { ExtendedCheckContext } from "../_types";

// Live-scan audit 2026-10-14 (packet legal-extended-1). Each case is two-sided: the
// real false positive must stop, and a genuine signal must keep firing.

function context(html: string, hostname: string, isPaymentEnabled = false): ExtendedCheckContext {
  return {
    pageResult: { ok: true, status: 200, headers: {}, html, responseTimeMs: 1, finalUrl: `https://${hostname}/` },
    httpsUrl: `https://${hostname}`,
    hostname,
    platform: "MARKETING_SITE",
    ctx: { isPaymentEnabled, isAuthEnabled: false, isSaas: false, isMobileApp: false, hasBackend: false, authMethod: "unknown" },
    htmlLower: html.toLowerCase(),
    catchAll200: false,
  };
}

async function statusOf(html: string, hostname: string, key: string, isPaymentEnabled = false) {
  const checks = await runLegalExtended(context(html, hostname, isPaymentEnabled));
  return checks.find((c) => c.checkKey === key)?.status;
}

describe("age_gate gates on what the site is, not on headlines", () => {
  const guardian = `<html lang="en"><head><title>Latest news, sport and opinion from the Guardian</title>
<meta name="description" content="Latest news, sport, business, comment, analysis and reviews from the Guardian, the world's leading liberal voice"></head>
<body><h3><a href="/sport/2026/oct/14/kevin-pietersen-gambling-site-england-batting-coach-cricket"><span>Pietersen tells ECB he will not promote gambling site while on England duty</span></a></h3>
<p>Alcohol duty rise confirmed in budget</p></body></html>`;

  it("does not warn a news homepage that mentions gambling in a headline", async () => {
    expect(await statusOf(guardian, "www.theguardian.com", "age_gate")).toBe("PASS");
  });

  it("still warns a wine merchant with no age gate", async () => {
    const shop = `<html lang="en-GB"><head><title>Majestic Wine | Buy Wine Online</title><meta name="description" content="Buy wine, spirits and beer online with free delivery"></head><body><a href="/red-wine">Red wine</a> £9.99</body></html>`;
    expect(await statusOf(shop, "www.majestic.co.uk", "age_gate", true)).toBe("WARN");
  });

  it("passes a wine merchant that shows an age gate", async () => {
    const shop = `<html lang="en-GB"><head><title>Majestic Wine | Buy Wine Online</title></head><body><div role="dialog">You must be 18 or over to enter this site</div></body></html>`;
    expect(await statusOf(shop, "www.majestic.co.uk", "age_gate", true)).toBe("PASS");
  });
});

describe("regional privacy gates ignore headlines, URL params and hreflang", () => {
  const bbc = `<html lang="en-GB" class="no-js"><head><title>BBC - Home</title>
<link rel="alternate" hreflang="en-CA" href="https://example.com/en-ca"></head><body>
<span>Projectile sinks in Strait of Hormuz, Singapore says</span>
<span>Cokayne back as England face Canada threat in Toronto</span>
<a href="/news/world/us_and_canada">US &amp; Canada</a>
<span>Companionship grows as loneliness rises in China</span>
<span>Brazil election: what happens next</span>
<span>Council staff invited on government trade trip to India</span></body></html>`;

  it("skips Singapore, Canada, China, Brazil and India for a UK news homepage", async () => {
    expect(await statusOf(bbc, "www.bbc.co.uk", "pdpa_singapore")).toBe("SKIPPED");
    expect(await statusOf(bbc, "www.bbc.co.uk", "pipeda_canada")).toBe("SKIPPED");
    expect(await statusOf(bbc, "www.bbc.co.uk", "lgpd_brazil")).toBe("SKIPPED");
    expect(await statusOf(bbc, "www.bbc.co.uk", "dpdp_india")).toBe("SKIPPED");
  });

  it("does not read China into an Indian retailer's URL parameter", async () => {
    const flipkart = `<html lang="en-IN" class="useInterFont"><head><title>Online Shopping India Mobile, Cameras, Lifestyle &amp; more Online @ Flipkart.com</title></head><body>
<a href="/womens-night-suits/pr?sid=clo,1hc,5d2,cny&amp;otracker=undefined_footer" title="Women's night suits">Night suits</a>
<div>From ₹99</div></body></html>`;
    expect(await statusOf(flipkart, "www.flipkart.com", "pipl_china")).toBe("SKIPPED");
    // The genuine Indian market signal must still fire.
    expect(await statusOf(flipkart, "www.flipkart.com", "dpdp_india")).toBe("INCONCLUSIVE");
  });

  // A market anchor makes the law relevant; a homepage that does not mention it is not proof
  // the business ignores it (the notice usually lives in the privacy policy), so the
  // honest answer is INCONCLUSIVE, while an unrelated market stays SKIPPED.
  it("still fires on genuine market anchors", async () => {
    const plain = `<html lang="en"><body><p>Welcome</p></body></html>`;
    expect(await statusOf(plain, "www.cbc.ca", "pipeda_canada")).toBe("INCONCLUSIVE");
    expect(await statusOf(plain, "shop.example.sg", "pdpa_singapore")).toBe("INCONCLUSIVE");
    expect(await statusOf(`<html lang="pt-BR"><body>Frete Grátis</body></html>`, "www.mercadolivre.com.br", "lgpd_brazil")).toBe("INCONCLUSIVE");
    expect(await statusOf(`<html lang="zh-CN"><body>欢迎</body></html>`, "shop.example.com", "pipl_china")).toBe("INCONCLUSIVE");
    expect(await statusOf(`<html lang="en"><body><p>Plans from S$ 49.90 / month</p></body></html>`, "shop.example.com", "pdpa_singapore")).toBe("INCONCLUSIVE");
    expect(await statusOf(`<html lang="en-CA"><body><p>Welcome</p></body></html>`, "shop.example.com", "pipeda_canada")).toBe("INCONCLUSIVE");
  });
});

describe("distance_selling_notice EU gate", () => {
  it("does not treat encodeURIComponent / Europe timezones as an EU shop", async () => {
    const cal = `<html lang="en"><head><title>Cal.com | Scheduling Software for Online Bookings</title></head><body>
<script>document.cookie = \`_fbp=\${encodeURIComponent(fbp)}\`;</script>
<div dir="auto">Europe/Amsterdam</div><p>$15 per user / month</p></body></html>`;
    expect(await statusOf(cal, "cal.com", "distance_selling_notice", true)).toBe("PASS");
  });

  it("still warns a paying EU shop with no distance-selling information", async () => {
    const shop = `<html lang="de"><body><p>Laufschuhe ab €89,00</p></body></html>`;
    expect(await statusOf(shop, "www.example.de", "distance_selling_notice", true)).toBe("WARN");
    const euroPrices = `<html lang="en"><body><p>From €29 per month</p></body></html>`;
    expect(await statusOf(euroPrices, "shop.example.com", "distance_selling_notice", true)).toBe("WARN");
  });
});

describe("reviewer-requested market anchors that a headline cannot fake", () => {
  const plain = (body: string, lang = "en") => `<html lang="${lang}"><head><title>Shop</title></head><body>${body}</body></html>`;

  it("treats a CAD price as Canadian, but not CAD as software vocabulary", async () => {
    expect(await statusOf(plain("<p>Plans from $49 CAD / month</p>"), "shop.example.com", "pipeda_canada")).toBe("INCONCLUSIVE");
    expect(await statusOf(plain("<p>CAD $49 per month</p>"), "shop.example.com", "pipeda_canada")).toBe("INCONCLUSIVE");
    expect(await statusOf(plain("<p>Import your CAD drawings and BIM models</p>"), "www.autodesk-like.com", "pipeda_canada")).toBe("SKIPPED");
  });

  it("treats Rs. / INR prices as Indian", async () => {
    expect(await statusOf(plain("<p>Starting at Rs. 499</p>"), "shop.example.com", "dpdp_india")).toBe("INCONCLUSIVE");
    expect(await statusOf(plain("<p>INR 1,299 per year</p>"), "shop.example.com", "dpdp_india")).toBe("INCONCLUSIVE");
    expect(await statusOf(plain("<p>Open 24 hrs 7 days a week</p>"), "shop.example.com", "dpdp_india")).toBe("SKIPPED");
  });

  it("treats a displayed CNPJ as a Brazilian business", async () => {
    expect(await statusOf(plain("<footer>Acme Comércio Ltda — CNPJ 12.345.678/0001-90</footer>"), "shop.example.com", "lgpd_brazil")).toBe("INCONCLUSIVE");
  });

  it("treats an ICP filing number as mainland China, but zh-TW as not", async () => {
    expect(await statusOf(plain("<footer>京ICP备11041704号</footer>"), "www.jd-like.com", "pipl_china")).toBe("INCONCLUSIVE");
    expect(await statusOf(plain("<p>歡迎</p>", "zh-TW"), "shop.example.com.tw", "pipl_china")).toBe("SKIPPED");
  });

  it("treats a Pte. Ltd. footer as a Singapore business", async () => {
    expect(await statusOf(plain("<footer>© 2026 Acme Pte. Ltd. All rights reserved.</footer>"), "acme.com", "pdpa_singapore")).toBe("INCONCLUSIVE");
  });

  it("catches a nicotine seller whose title says nothing (juul.com)", async () => {
    const juul = `<html lang="en"><head><title>JUUL Login | JUUL</title><meta name="description" content="Log in to JUUL.com here"></head>
<body><div class="warning">WARNING: This product contains nicotine. Nicotine is an addictive chemical.</div><p>Age restricted product</p></body></html>`;
    expect(await statusOf(juul, "www.juul.com", "age_gate", true)).toBe("WARN");
  });
});

describe("adversarial review: market anchors stay tight and survive entity encoding", () => {
  const plain = (body: string, lang = "en") => `<html lang="${lang}"><head><title>Shop</title></head><body>${body}</body></html>`;

  it("does not read CAD software vocabulary followed by a number as a Canadian price", async () => {
    expect(await statusOf(plain("<p>CAD 3D modelling for engineers</p>"), "www.cad-tool.com", "pipeda_canada")).toBe("SKIPPED");
    expect(await statusOf(plain("<p>Compatible with CAD 2024 and later</p>"), "www.cad-tool.com", "pipeda_canada")).toBe("SKIPPED");
    expect(await statusOf(plain("<p>From CAD 49.99 a month</p>"), "shop.example.com", "pipeda_canada")).toBe("INCONCLUSIVE");
  });

  it("reads prices written with HTML entities", async () => {
    expect(await statusOf(plain("<p>Rs.&nbsp;499</p>"), "shop.example.com", "dpdp_india")).toBe("INCONCLUSIVE");
    expect(await statusOf(plain("<p>&#8377;499</p>"), "shop.example.com", "dpdp_india")).toBe("INCONCLUSIVE");
    expect(await statusOf(plain("<p>$49&nbsp;CAD</p>"), "shop.example.com", "pipeda_canada")).toBe("INCONCLUSIVE");
  });

  it("does not age-gate a news page that names Drinkaware or BeGambleAware, but does a seller showing their URLs", async () => {
    const news = `<html lang="en-GB"><head><title>UK news</title></head><body><p>Drinkaware survey finds drinking down</p><p>BeGambleAware funding row</p></body></html>`;
    expect(await statusOf(news, "news.example.co.uk", "age_gate")).toBe("PASS");
    const seller = `<html lang="en-GB"><head><title>Shop</title></head><body><footer>drinkaware.co.uk</footer></body></html>`;
    expect(await statusOf(seller, "shop.example.co.uk", "age_gate", true)).toBe("WARN");
  });
});
