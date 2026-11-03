// @vitest-environment node
/**
 * total_page_weight used to compare the HTML's character count with 300KB and call the
 * total "likely within budget". It must now come from the measured resources: a 2KB page
 * whose images weigh 4MB is over budget. The measurement itself is stubbed here (its
 * verdict is covered in unwithhold-scanB.test.ts); this pins that the module uses it.
 */
import { describe, expect, it, vi } from "vitest";
import type { ExtendedCheckContext } from "../_types";

vi.mock("../page-weight", async (importOriginal) => {
  const real = await importOriginal<typeof import("../page-weight")>();
  return { ...real, measurePageWeight: vi.fn(async () => ({ htmlBytes: 2_000, measuredBytes: 4_000_000, measured: 3, unmeasured: 0, skipped: 0 })) };
});

const { runPerformanceExtended } = await import("../performance-extended");

describe("total_page_weight is the measured weight, not the HTML's length", () => {
  it("a small HTML document with heavy images is over budget", async () => {
    const html = '<html lang="en"><body><img src="/a.jpg"><img src="/b.jpg"><img src="/c.jpg"></body></html>';
    const ctx: ExtendedCheckContext = {
      pageResult: { ok: true, status: 200, headers: {}, html, responseTimeMs: 1, finalUrl: "https://weight.invalid/" },
      httpsUrl: "https://weight.invalid", hostname: "weight.invalid", platform: "WEB_APP",
      ctx: { isPaymentEnabled: false, isAuthEnabled: false, isSaas: false, isMobileApp: false, hasBackend: false, authMethod: "unknown" },
      htmlLower: html.toLowerCase(), catchAll200: false,
    };
    const checks = await runPerformanceExtended(ctx);
    const weight = checks.find((c) => c.checkKey === "total_page_weight");
    expect(weight?.status).toBe("WARN");
    expect(weight?.detail).toMatch(/3\.8MB/);
  }, 30_000);
});
