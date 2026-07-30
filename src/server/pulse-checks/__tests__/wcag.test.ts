import { describe, expect, it } from "vitest";
import { runWcagChecks } from "../wcag";
import type { ExtendedCheckContext } from "../_types";

function context(html: string): ExtendedCheckContext {
  return {
    pageResult: { ok: true, status: 200, headers: {}, html, responseTimeMs: 1, finalUrl: "https://example.test" },
    httpsUrl: "https://example.test", hostname: "example.test", platform: "WEB_APP",
    ctx: { isPaymentEnabled: false, isAuthEnabled: false, isSaas: false, isMobileApp: false, hasBackend: false, authMethod: "unknown" },
    htmlLower: html.toLowerCase(), catchAll200: false,
  };
}

const statusOf = (checks: { checkKey: string; status: string }[], key: string) => checks.find((check) => check.checkKey === key)?.status;

describe("deterministic WCAG markup checks", () => {
  it("passes named and correctly hidden controls", async () => {
    const checks = await runWcagChecks(context('<img src="chart.png" alt="Quarterly chart"><button aria-label="Close"><svg></svg></button><iframe title="Location map"></iframe><dialog aria-labelledby="dialog-title"></dialog><div aria-hidden="true"><span>decorative</span></div>'));
    for (const key of ["images_have_alt", "buttons_have_names", "iframes_have_titles", "dialogs_have_names", "aria_hidden_not_focusable"]) expect(statusOf(checks, key)).toBe("PASS");
  });

  it("finds missing names and a keyboard/screen-reader mismatch", async () => {
    const checks = await runWcagChecks(context('<img src="chart.png"><button><svg></svg></button><iframe><div role="dialog"></div><div aria-hidden="true"><button>Hidden action</button></div>'));
    expect(statusOf(checks, "images_have_alt")).toBe("FAIL");
    expect(statusOf(checks, "buttons_have_names")).toBe("FAIL");
    expect(statusOf(checks, "iframes_have_titles")).toBe("WARN");
    expect(statusOf(checks, "dialogs_have_names")).toBe("FAIL");
    expect(statusOf(checks, "aria_hidden_not_focusable")).toBe("FAIL");
  });
});
