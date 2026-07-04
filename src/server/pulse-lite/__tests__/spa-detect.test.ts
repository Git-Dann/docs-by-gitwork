import { describe, it, expect } from "vitest";
import {
  detectSpaContext,
  reclassifySpaChecks,
  isEmptyShell,
  staticTextWordCount,
  HTML_RENDER_DEPENDENT_CHECK_KEYS,
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

  it("flips FAIL/WARN html-dependent checks to SKIPPED", () => {
    expect(out[0].status).toBe("SKIPPED");
    expect(out[0].detail).toContain("Not assessable");
    expect(out[1].status).toBe("SKIPPED");
  });
  it("leaves PASS checks and non-set checks untouched", () => {
    expect(out[2].status).toBe("PASS");
    expect(out[3].status).toBe("FAIL"); // ssl_valid keeps its hard-cap-triggering FAIL
  });
  it("only skips keys in the dependent set", () => {
    expect(HTML_RENDER_DEPENDENT_CHECK_KEYS.has("meta_title")).toBe(true);
    expect(HTML_RENDER_DEPENDENT_CHECK_KEYS.has("ssl_valid")).toBe(false);
  });
});
