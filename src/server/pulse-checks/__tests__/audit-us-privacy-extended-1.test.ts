import { describe, expect, it } from "vitest";
import { runUsPrivacyExtended } from "../us-privacy-extended";
import type { ExtendedCheckContext } from "../_types";

function context(html: string): ExtendedCheckContext {
  return {
    pageResult: { ok: true, status: 200, headers: {}, html, responseTimeMs: 10, finalUrl: "https://example.test" },
    httpsUrl: "https://example.test",
    hostname: "example.test",
    platform: "WEB_APP",
    ctx: { isPaymentEnabled: false, isAuthEnabled: false, isSaas: false, isMobileApp: false, hasBackend: true, authMethod: "unknown" },
    htmlLower: html.toLowerCase(),
    catchAll200: false,
  } as ExtendedCheckContext;
}

async function doNotSell(html: string) {
  const checks = await runUsPrivacyExtended(context(html));
  return checks.find((c) => c.checkKey === "ccpa_do_not_sell")?.status;
}

describe("ccpa_do_not_sell real-world link wordings", () => {
  it("detects GitHub's 'Do not share my personal information' subfooter link", async () => {
    const html = `<footer><ul><li><a href="https://docs.github.com/site-policy/github-terms/github-terms-of-service">Terms</a></li><li><button type="button" data-analytics-event="{&quot;action&quot;:&quot;dont_share_info&quot;,&quot;context&quot;:&quot;subfooter&quot;}">Do not share my personal information</button></li></ul></footer>`;
    expect(await doNotSell(html)).toBe("PASS");
  });

  it("detects Anthropic's bare 'Privacy choices' footer link", async () => {
    const html = `<footer><a id="privacy-choices-btn" class="footer_link_wrap"><div class="footer_link_text">Privacy choices</div></a></footer>`;
    expect(await doNotSell(html)).toBe("PASS");
  });

  it("detects Figma's 'Do Not Sell/Share My Personal Info' link text", async () => {
    const html = `<script>window.__cfg={"showPersonalInformationLink":true,"personalInformationLinkText":"Do Not Sell/Share My Personal Info + Opt-Out","countryCodes":["US"]}</script>`;
    expect(await doNotSell(html)).toBe("PASS");
  });

  it("still detects the canonical CCPA wording", async () => {
    expect(await doNotSell(`<a href="/opt-out">Do Not Sell or Share My Personal Information</a>`)).toBe("PASS");
  });

  it("does NOT pass a footer with only privacy policy and cookie settings", async () => {
    const html = `<footer><a href="./privacy">Privacy</a><a href="/terms">Terms</a><button>Cookie settings</button></footer>`;
    expect(await doNotSell(html)).toBe("WARN");
  });

  it("does NOT treat a 'we do not sell your personal information' claim as an opt-out link", async () => {
    const html = `<p>We do not sell your personal information to third parties.</p><a href="/privacy">Privacy Policy</a>`;
    expect(await doNotSell(html)).toBe("WARN");
  });
});

describe("ccpa_do_not_sell: link text broken across lines", () => {
  it("PASSes a server-rendered footer that wraps the opt-out label", async () => {
    const status = await doNotSell(`<footer><a href="/privacy/opt-out">Do Not Sell or Share
          My Personal Information</a></footer>`);
    expect(status).toBe("PASS");
  });
});
