import { describe, expect, it } from "vitest";
import { isMateriallyRicher } from "@/server/pulse-agents/render-agent";
import { renderCoverageCheck } from "@/server/pulse-scan";

// ─────────────────────────────────────────────────────────────────────────────
// Rendering a client-built page is the difference between assessing it and
// declining to. The risk runs the other way from the usual one: a render that
// silently fails leaves the empty shell in place, and measuring THAT would put
// back the confident "your page has 4 words" this whole thread removed.
// ─────────────────────────────────────────────────────────────────────────────

describe("isMateriallyRicher", () => {
  it("accepts a shell that hydrated into a real page", () => {
    expect(isMateriallyRicher(6, 840)).toBe(true);
  });

  it("rejects a render that produced no more than the source", () => {
    // Hydration errored, or the content is behind a sign-in. Either way the DOM is the
    // shell, and adopting it would measure emptiness as a finding.
    expect(isMateriallyRicher(40, 44)).toBe(false);
  });

  it("rejects a tiny result even when it multiplies the source", () => {
    // 4 → 12 words triples the count and is still not a page.
    expect(isMateriallyRicher(4, 12)).toBe(false);
  });

  it("accepts a large absolute gain that is not a doubling", () => {
    // A partly server-rendered page that fills in the rest client-side.
    expect(isMateriallyRicher(400, 900)).toBe(true);
  });
});

describe("renderCoverageCheck", () => {
  const rendered = (over: Partial<{ renderedWords: number; error: string | null; html: string | null }> = {}) => ({
    html: "<html></html>",
    staticWords: 6,
    renderedWords: 840,
    error: null,
    ...over,
  });

  it("passes only when the content was actually read", () => {
    const check = renderCoverageCheck({ rendered: rendered(), staticWords: 6, adopted: true, requested: true });
    expect(check.status).toBe("PASS");
    expect(check.detail).toContain("840");
  });

  it("is INCONCLUSIVE — never FAIL — when the render errored", () => {
    // A browser that could not load the page is not a defect in the customer's product.
    const check = renderCoverageCheck({
      rendered: rendered({ html: null, error: "Rendering timed out." }),
      staticWords: 6,
      adopted: false,
      requested: true,
    });
    expect(check.status).toBe("INCONCLUSIVE");
    expect(check.detail).toContain("says nothing about the page itself");
  });

  it("is INCONCLUSIVE when the render added nothing", () => {
    const check = renderCoverageCheck({
      rendered: rendered({ renderedWords: 7 }),
      staticWords: 6,
      adopted: false,
      requested: true,
    });
    expect(check.status).toBe("INCONCLUSIVE");
    expect(check.detail).toContain("not used");
  });

  it("says so when the scan did not run a browser at all", () => {
    const check = renderCoverageCheck({ rendered: null, staticWords: 6, adopted: false, requested: false });
    expect(check.status).toBe("INCONCLUSIVE");
    expect(check.detail).toContain("did not run a browser");
  });

  it("never reports a failure to render as a finding about the product", () => {
    for (const input of [
      { rendered: rendered({ html: null, error: "boom" }), adopted: false, requested: true },
      { rendered: rendered({ renderedWords: 7 }), adopted: false, requested: true },
      { rendered: null, adopted: false, requested: false },
    ]) {
      const status = renderCoverageCheck({ ...input, staticWords: 6 }).status;
      expect(status).not.toBe("FAIL");
      expect(status).not.toBe("WARN");
      expect(status).not.toBe("PASS");
    }
  });
});
