import { describe, expect, it } from "vitest";
import { runAuthExtended } from "../auth-extended";
import type { ExtendedCheckContext } from "../_types";

function context(html: string): ExtendedCheckContext {
  return {
    pageResult: { ok: true, status: 200, headers: {}, html, responseTimeMs: 1, finalUrl: "https://example.test" },
    httpsUrl: "https://example.test", hostname: "example.test", platform: "SAAS",
    ctx: { isPaymentEnabled: false, isAuthEnabled: true, isSaas: true, isMobileApp: false, hasBackend: true, authMethod: "password" },
    htmlLower: html.toLowerCase(), catchAll200: false,
  };
}

const statusOf = async (html: string, key: string) =>
  (await runAuthExtended(context(html))).find((c) => c.checkKey === key)?.status;

describe("token_expiry_short (audit auth-extended-1)", () => {
  it("does not PASS on design-system 'tokens' JSON joined to a distant 'h' (flipkart.com shape)", async () => {
    const filler = "x".repeat(5000);
    const html = `<script>window.__INITIAL_STATE__={"tokens":{"flex":1},"children":[{"type":"Label","tokens":[{"color":"default-fk-color"}]}],${filler}"widgetId":"hp_l1_navigation_widget_8_20","ttlCache":true,"label":"Fashion","height":"48","unit":"h"}</script>`;
    expect(await statusOf(html, "token_expiry_short")).toBe("WARN");
  });

  it("still PASSes on genuine short access-token lifetime prose", async () => {
    expect(await statusOf("<p>Access tokens expire after 15 minutes; refresh tokens rotate on each use.</p>", "token_expiry_short")).toBe("PASS");
    expect(await statusOf("<p>The token expires in 3600 seconds.</p>", "token_expiry_short")).toBe("PASS");
    expect(await statusOf("<p>Set token TTL to 15 min for public clients.</p>", "token_expiry_short")).toBe("PASS");
  });
});

describe("auth_security_notifications (audit auth-extended-1)", () => {
  it("does not PASS on marketing copy about handling security alerts (notion.so shape)", async () => {
    const html = `<a class="cardCompactAnchor" aria-label="Respond to security alerts faster" href="/product/ai/use-cases/respond-to-security-alerts-faster">&nbsp;</a><div class="card">Notion AI</div>`;
    expect(await statusOf(html, "auth_security_notifications")).toBe("WARN");
  });

  it("still PASSes on genuine account security-event notification disclosures", async () => {
    expect(await statusOf("<p>We send a security alert when a new device signs in or your password changes.</p>", "auth_security_notifications")).toBe("PASS");
    expect(await statusOf("<p>Password change alerts: we email you whenever your password changes.</p>", "auth_security_notifications")).toBe("PASS");
    expect(await statusOf("<li>Get a security notification email for every sign-in from a new device.</li>", "auth_security_notifications")).toBe("PASS");
  });
});

describe("audit auth-extended-1: reviewer-requested regressions", () => {
  it("still PASSes TTL prose written with minutes or hours spelled out", async () => {
    expect(await statusOf("<p>Token TTL: 15 minutes.</p>", "token_expiry_short")).toBe("PASS");
    expect(await statusOf("<p>Token TTL is 1 hour.</p>", "token_expiry_short")).toBe("PASS");
  });

  it("still PASSes a security-alerts heading followed by the new-device email disclosure", async () => {
    expect(await statusOf("<h3>Security alerts</h3><p>We email you when a new device signs in to your account.</p>", "auth_security_notifications")).toBe("PASS");
    expect(await statusOf("<p>Get notified of every new sign-in.</p>", "auth_security_notifications")).toBe("PASS");
  });
});
