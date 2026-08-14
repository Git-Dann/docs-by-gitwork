import { describe, it, expect } from "vitest";
import {
  detectSpaContext,
  reclassifySpaChecks,
  isEmptyShell,
  staticTextWordCount,
  HTML_RENDER_DEPENDENT_CHECK_KEYS,
  VACUOUS_ON_EMPTY_SHELL_KEYS,
} from "../spa-detect";
import type { PulseScanCheckInput } from "@/types/pulse";

const EMPTY_SHELL = `<!doctype html><html><head><title>app</title></head><body><div id="root"></div><script src="/main.js"></script></body></html>`;
const CONTENT_RICH_SSR = `<!doctype html><html><head><title>Real Site</title></head><body><div id="__next"><h1>Welcome</h1>${"<p>Lots of genuine server rendered words here that describe the product in detail.</p>".repeat(20)}</div></body></html>`;

describe("staticTextWordCount", () => {
  it("counts visible words and ignores scripts", () => {
    expect(staticTextWordCount(EMPTY_SHELL)).toBeLessThan(100);
    expect(staticTextWordCount(CONTENT_RICH_SSR)).toBeGreaterThan(100);
  });
});

describe("isEmptyShell", () => {
  it("is true for an empty SPA shell", () => {
    expect(isEmptyShell(EMPTY_SHELL)).toBe(true);
  });
  it("is false for content-rich SSR even with a #__next marker", () => {
    expect(isEmptyShell(CONTENT_RICH_SSR)).toBe(false);
  });
});

describe("detectSpaContext", () => {
  it("flags a known client-rendered builder even without shell heuristics", () => {
    expect(detectSpaContext({ builder: "Lovable", html: CONTENT_RICH_SSR }).isSpa).toBe(true);
  });
  it("flags an empty shell with no builder", () => {
    expect(detectSpaContext({ builder: null, html: EMPTY_SHELL }).isSpa).toBe(true);
  });
  it("does NOT flag content-rich SSR (e.g. Framer) — SEO checks stay valid", () => {
    expect(detectSpaContext({ builder: "Framer", html: CONTENT_RICH_SSR }).isSpa).toBe(false);
  });
});

describe("reclassifySpaChecks", () => {
  const checks: PulseScanCheckInput[] = [
    { category: "SEO", checkKey: "meta_title", label: "title", status: "FAIL", detail: "no title" },
    { category: "SEO", checkKey: "h1_present", label: "h1", status: "WARN" },
    { category: "SEO", checkKey: "meta_title", label: "title", status: "PASS" }, // PASS untouched
    { category: "Infrastructure", checkKey: "ssl_valid", label: "ssl", status: "FAIL" }, // not in set
  ];
  const out = reclassifySpaChecks(checks);

  it("flips FAIL/WARN html-dependent checks to INCONCLUSIVE", () => {
    expect(out[0].status).toBe("INCONCLUSIVE");
    expect(out[0].detail).toContain("Not assessable");
    expect(out[1].status).toBe("INCONCLUSIVE");
  });

  it("does NOT use SKIPPED — an unread page must cost coverage, not vanish from it", () => {
    // SKIPPED and NOT_APPLICABLE leave score-breakdown's denominator entirely, so the scan would
    // keep claiming ~96% coverage of a page whose content it never read. INCONCLUSIVE is counted
    // as unknown: excluded from the score, subtracted from completeness, widening the bounds.
    expect(out.map((c) => c.status)).not.toContain("SKIPPED");
    expect(out.map((c) => c.status)).not.toContain("NOT_APPLICABLE");
  });

  it("leaves an earned PASS and non-set checks untouched", () => {
    expect(out[2].status).toBe("PASS");
    expect(out[3].status).toBe("FAIL"); // ssl_valid keeps its hard-cap-triggering FAIL
  });

  it("rewrites a PASS that was manufactured from the absence of body content", () => {
    // image_alt_coverage reports "no images detected" on a shell whose images had not rendered.
    // It is the one non-adverse status that is evidence of nothing.
    const vacuous = reclassifySpaChecks([
      { category: "Accessibility", checkKey: "image_alt_coverage", label: "alt", status: "NOT_APPLICABLE" },
      { category: "Accessibility", checkKey: "image_alt_coverage", label: "alt", status: "PASS" },
      // Already excluded by a platform/jurisdiction filter — must stay excluded.
      { category: "Accessibility", checkKey: "image_alt_coverage", label: "alt", status: "SKIPPED" },
    ]);
    expect(vacuous.map((c) => c.status)).toEqual(["INCONCLUSIVE", "INCONCLUSIVE", "SKIPPED"]);
    expect(VACUOUS_ON_EMPTY_SHELL_KEYS.has("image_alt_coverage")).toBe(true);
    expect(VACUOUS_ON_EMPTY_SHELL_KEYS.has("meta_title")).toBe(false);
  });

  it("only reclassifies keys in the dependent set", () => {
    expect(HTML_RENDER_DEPENDENT_CHECK_KEYS.has("meta_title")).toBe(true);
    expect(HTML_RENDER_DEPENDENT_CHECK_KEYS.has("ssl_valid")).toBe(false);
  });
});
