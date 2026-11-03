// @vitest-environment node
// The four company-policy checks rebuilt from the withdrawn list (business-operations.ts):
// a policy the site names or links is a PASS with the quote; its absence on a public page is
// INCONCLUSIVE, never a WARN, because none of them has to be published.
import { describe, expect, it } from "vitest";
import type { ExtendedCheckContext, ProjectContext } from "../_types";
import { runBusinessOperationsChecks } from "../business-operations";

const project: ProjectContext = { isPaymentEnabled: false, isAuthEnabled: true, isSaas: true, isMobileApp: false, hasBackend: true, authMethod: "unknown" };
function context(html: string): ExtendedCheckContext {
  return {
    pageResult: { ok: true, status: 200, headers: {}, html, responseTimeMs: 1, finalUrl: "https://example.test/" },
    httpsUrl: "https://example.test", hostname: "example.test", platform: "SAAS",
    ctx: project, htmlLower: html.toLowerCase(), catchAll200: false,
  } as ExtendedCheckContext;
}
const status = async (html: string, key: string) => (await runBusinessOperationsChecks(context(html))).find((c) => c.checkKey === key)?.status;

const footer = `<footer><a href="/legal/anti-bribery">Anti-bribery policy</a> <a href="/speak-up">Whistleblowing</a> <a href="/subprocessors">Sub-processors</a><p>We hold professional indemnity insurance of £5m.</p></footer>`;

describe("company policies", () => {
  it("pass when the site names or links them", async () => {
    for (const key of ["bribery_act_policy", "whistleblower_policy", "supplier_due_diligence", "insurance_mention"]) {
      expect(await status(`<html><body>${footer}</body></html>`, key), key).toBe("PASS");
    }
  });
  it("are INCONCLUSIVE, never WARN, when the page says nothing", async () => {
    for (const key of ["bribery_act_policy", "whistleblower_policy", "supplier_due_diligence", "insurance_mention"]) {
      expect(await status("<html><body><p>Hello</p></body></html>", key), key).toBe("INCONCLUSIVE");
    }
  });
  it("do not pass on a near miss: 'processors' alone, or 'insurance' in a product name", async () => {
    expect(await status("<p>Our payment processors are PCI compliant.</p>", "supplier_due_diligence")).toBe("INCONCLUSIVE");
    expect(await status("<p>Compare car insurance quotes in minutes.</p>", "insurance_mention")).toBe("INCONCLUSIVE");
  });
});
