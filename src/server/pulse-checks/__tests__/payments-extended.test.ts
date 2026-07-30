import { describe, expect, it } from "vitest";
import { runPaymentsExtended } from "../payments-extended";
import type { ExtendedCheckContext } from "../_types";

function context(html: string, isSaas = true): ExtendedCheckContext {
  return { pageResult: { ok: true, status: 200, headers: {}, html, responseTimeMs: 1, finalUrl: "https://example.test/pricing" }, httpsUrl: "https://example.test", hostname: "example.test", platform: "SAAS", ctx: { isPaymentEnabled: true, isAuthEnabled: true, isSaas, isMobileApp: false, hasBackend: true, authMethod: "unknown" }, htmlLower: html.toLowerCase(), catchAll200: false };
}
const statusOf = (checks: { checkKey: string; status: string }[], key: string) => checks.find((check) => check.checkKey === key)?.status;

describe("payment surface evidence", () => {
  it("recognises customer-visible terms and a hosted checkout", async () => {
    const checks = await runPaymentsExtended(context('<a href="/refunds">Refund policy</a><p>£20/month, renews automatically. Cancel anytime.</p><script src="https://js.stripe.com/v3"></script><a href="/billing-support">Billing support</a>'));
    for (const key of ["payment_refund_policy", "payment_recurring_terms", "payment_checkout_provider", "payment_billing_support", "payment_price_currency"]) expect(statusOf(checks, key)).toBe("PASS");
  });

  it("does not mistake an empty payment page for disclosed terms", async () => {
    const checks = await runPaymentsExtended(context("<main>Upgrade now</main>"));
    for (const key of ["payment_refund_policy", "payment_recurring_terms", "payment_checkout_provider", "payment_billing_support", "payment_price_currency"]) expect(statusOf(checks, key)).toBe("WARN");
  });
});
