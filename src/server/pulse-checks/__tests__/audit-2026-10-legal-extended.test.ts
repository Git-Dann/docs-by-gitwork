import { describe, expect, it } from "vitest";
import { runLegalExtended } from "../legal-extended";
import type { ExtendedCheckContext } from "../_types";

// Audit 2026-10 (legal / compliance false positives). Every case is two-sided: the
// false positive must stop AND a genuine signal must keep firing. Fixtures are slices
// of what real homepages carry (monzo.com, linear.app, intercom.com, lazada.co.th),
// where the old substring triggers fired on "brand", "audio", "happiness" and inline JS.

function context(html: string, hostname: string): ExtendedCheckContext {
  return {
    pageResult: { ok: true, status: 200, headers: {}, html, responseTimeMs: 1, finalUrl: `https://${hostname}/` },
    httpsUrl: `https://${hostname}`,
    hostname,
    platform: "WEB_APP",
    ctx: { isPaymentEnabled: false, isAuthEnabled: false, isSaas: false, isMobileApp: false, hasBackend: false, authMethod: "unknown" },
    htmlLower: html.toLowerCase(),
    catchAll200: false,
  };
}

async function check(html: string, hostname: string, key: string) {
  const found = (await runLegalExtended(context(html, hostname))).find((c) => c.checkKey === key);
  if (!found) throw new Error(`missing ${key}`);
  return found;
}

const page = (body: string, lang = "en", head = "") => `<html lang="${lang}"><head><title>Acme</title>${head}</head><body>${body}</body></html>`;

describe("eu_ai_act_disclosure: an AI product is established, never inferred from the letters 'ai'", () => {
  it("does not treat email / contain / maintain plus 'model' and 'generate' as an AI product", async () => {
    const bank = page(`<p>Email us. Our pricing model is simple. Accounts contain no hidden fees; we maintain them for you.</p>
<p>Generate a statement in seconds. Paid monthly.</p><script>var detail="ai";</script>`);
    expect((await check(bank, "monzo.com", "eu_ai_act_disclosure")).status).toBe("SKIPPED");
  });

  it("detects an AI product from a visible claim and is INCONCLUSIVE without a disclosure on the page", async () => {
    const r = await check(page("<h1>AI agents that triage your issues</h1>"), "linear.app", "eu_ai_act_disclosure");
    expect(r.status).toBe("INCONCLUSIVE");
    expect(r.detail).toContain("AI agents");
  });

  it("detects an AI product from a model API called by the page", async () => {
    const r = await check(page(`<p>Welcome</p><script>fetch("https://api.openai.com/v1/chat/completions")</script>`), "app.example.com", "eu_ai_act_disclosure");
    expect(r.status).toBe("INCONCLUSIVE");
  });

  it("passes when the page tells users AI is involved, and the PASS never claims the Act is satisfied", async () => {
    const r = await check(page("<p>Summaries are AI-generated and labelled as such.</p><p>Uses GPT-4 for drafting.</p>"), "app.example.com", "eu_ai_act_disclosure");
    expect(r.status).toBe("PASS");
    expect(r.detail).not.toMatch(/requirements addressed/i);
    expect(r.detail).toMatch(/did not assess/i);
  });

  it("is never WARN: disclosure belongs inside the AI surface, which a homepage scan cannot see", async () => {
    for (const body of ["<h1>AI-powered search</h1>", "<p>Built with large language models</p>"]) {
      expect((await check(page(body), "app.example.com", "eu_ai_act_disclosure")).status).not.toBe("WARN");
    }
  });
});

describe("regional triggers are word-bounded real market signals", () => {
  // Words that used to trigger five regions on a UK bank's homepage.
  const noise = page(`<p>Our brand is grand. Random rewards. Audio and audit logs for your audience — fraud protection.</p>
<p>News: Japan raises rates; Thailand floods; Korea elects; the yen slides.</p><p>¥ symbol explained</p>
<script>window.sentry_sample_rand=0.4; var a$=1; const zar="bizarre bazaar";</script>`, "en-GB");

  it("skips South Africa, Japan, Thailand, Korea and Australia for substring and headline noise", async () => {
    for (const key of ["popia_south_africa", "appi_japan", "pdpa_thailand", "pipa_korea", "australian_privacy_act"]) {
      expect((await check(noise, "monzo.com", key)).status, key).toBe("SKIPPED");
    }
  });

  it("South Africa: .co.za, a rand price, (Pty) Ltd or a +27 number trigger it", async () => {
    expect((await check(page("<p>Hi</p>"), "www.takealot.co.za", "popia_south_africa")).status).toBe("INCONCLUSIVE");
    expect((await check(page("<p>Now R 1 299,00</p>"), "shop.example.com", "popia_south_africa")).status).toBe("INCONCLUSIVE");
    expect((await check(page("<footer>Acme (Pty) Ltd</footer>"), "shop.example.com", "popia_south_africa")).status).toBe("INCONCLUSIVE");
    expect((await check(page("<p>Call +27 11 123 4567</p>"), "shop.example.com", "popia_south_africa")).status).toBe("INCONCLUSIVE");
    expect((await check(page("<p>Up +27% this year</p>"), "shop.example.com", "popia_south_africa")).status).toBe("SKIPPED");
    expect((await check(page("<footer>Acme (Pty) Ltd — POPIA notice</footer>"), "shop.example.com", "popia_south_africa")).status).toBe("PASS");
  });

  it("Japan: a 円 price or 株式会社 triggers it; 'happiness' is not a mention of the APPI", async () => {
    expect((await check(page("<p>1,980円（税込）</p>", "ja"), "shop.example.com", "appi_japan")).status).toBe("INCONCLUSIVE");
    expect((await check(page("<footer>株式会社サンプル</footer><p>Customer happiness</p>"), "shop.example.com", "appi_japan")).status).toBe("INCONCLUSIVE");
    expect((await check(page("<p>1,980円</p><a href=\"/privacy\">APPI disclosures</a>"), "shop.example.com", "appi_japan")).status).toBe("PASS");
  });

  it("Thailand, Korea, Australia: a local price triggers them, a country name does not", async () => {
    expect((await check(page("<p>฿1,290</p>"), "www.lazada.co.th", "pdpa_thailand")).status).toBe("INCONCLUSIVE");
    expect((await check(page("<p>Thailand travel guide</p>"), "travel.example.com", "pdpa_thailand")).status).toBe("SKIPPED");
    expect((await check(page("<p>₩39,000</p>"), "shop.example.com", "pipa_korea")).status).toBe("INCONCLUSIVE");
    expect((await check(page("<p>Plans from $49 AUD / month</p>"), "shop.example.com", "australian_privacy_act")).status).toBe("INCONCLUSIVE");
    expect((await check(page("<footer>ABN 51 824 753 556</footer>"), "shop.example.com", "australian_privacy_act")).status).toBe("INCONCLUSIVE");
    expect((await check(page("<p>A$29</p><p>We comply with the Privacy Act 1988.</p>"), "shop.example.com", "australian_privacy_act")).status).toBe("PASS");
  });
});

describe("a triggered region whose law is not named on the homepage is INCONCLUSIVE, and labels state the observable fact", () => {
  it("Brazil: pt-BR with no LGPD on the page is INCONCLUSIVE; naming LGPD passes without claiming compliance", async () => {
    const missing = await check(page("<p>Frete Grátis</p>", "pt-BR"), "www.mercadolivre.com.br", "lgpd_brazil");
    expect(missing.status).toBe("INCONCLUSIVE");
    expect(missing.detail).toMatch(/privacy policy/i);
    const named = await check(page('<p>Frete Grátis</p><a href="/privacidade">Seus direitos LGPD</a>', "pt-BR"), "www.mercadolivre.com.br", "lgpd_brazil");
    expect(named.status).toBe("PASS");
    expect(named.detail).toMatch(/did not assess compliance/i);
  });

  it("no regional check ever WARNs or calls itself a compliance verdict", async () => {
    const triggered = page("<p>R$ 49 · ₹499 · S$ 49 · CNY 99 · $49 CAD · ฿1,290 · R 1 299,00 · 1,980円 · ₩39,000 · A$29</p>");
    const checks = await runLegalExtended(context(triggered, "shop.example.com"));
    const regional = ["lgpd_brazil", "pipeda_canada", "pdpa_singapore", "pdpa_thailand", "popia_south_africa", "appi_japan", "pipl_china", "pipa_korea", "dpdp_india", "australian_privacy_act"];
    for (const key of regional) {
      const c = checks.find((x) => x.checkKey === key)!;
      expect(c.status, key).toBe("INCONCLUSIVE");
      expect(c.label, key).not.toMatch(/compliance/i);
    }
  });
});
