/**
 * One header band, read by both shells.
 *
 * The sidebar's brand cell and the page header have to read as ONE band across the top: their
 * bottom hairlines must land on the same pixel. They are not in a shared grid row, so nothing
 * enforces it structurally — §40.2 records them drifting 48.6px apart when the logo shrank, and
 * fixed it by having both sides read one constant.
 *
 * That constant lived inside `app-shell.tsx`, where `demo-shell.tsx` — a second copy of the same
 * header, used by all 16 public sales demos and the white-label `/demo/[client]` pages — could
 * not reach it. So the demo never got the fix. Measured at 1440 before this: a **130px band with
 * a 44px title** against the app's 80px and 28px, and its own two sides **78px out of true**
 * (brand 97px, header 175px). Every screenshot taken on a demo page to check an app page was
 * therefore a screenshot of a different header — and §42.15 had already noticed the symptom
 * ("/demo/care under-reports available height by ~80px") without the cause being fixed.
 *
 * Source-shape, because jsdom computes no layout; the pixels are measured by driving the demo.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
const APP = read("src/components/app-shell.tsx");
const DEMO = read("src/components/demo/demo-shell.tsx");
const SHARED = read("src/components/shell-header.ts");

describe("the header band is defined once", () => {
  it("holds the geometry, and holds it only here", () => {
    expect(SHARED).toContain('export const HEADER_BAND_H = "h-20"');
    expect(SHARED).toContain('export const HEADER_BAND_MIN = "min-h-20"');
    expect(SHARED).toMatch(/HEADER_TITLE_CLASS[\s\S]*text-\[28px\]/);
  });

  for (const [name, src] of [["app-shell", APP], ["demo-shell", DEMO]] as const) {
    it(`${name} reads it rather than repeating it`, () => {
      expect(src).toContain('from "@/components/shell-header"');
      expect(src).toContain("HEADER_BAND_CLASS");
      expect(src).toContain("HEADER_TITLE_CLASS");
      expect(src).toContain("HEADER_BAND_H");
    });

    it(`${name} writes no band size of its own`, () => {
      /*
       * The two edits that re-break it: a literal title size, or a literal band height. Both
       * compile, both lint clean, and both are invisible to `audit:ui` — the demo carried
       * `text-[44px]` and `pb-5 pt-7` for months with every gate green.
       */
      expect(src, "the title size belongs in shell-header.ts").not.toMatch(/text-\[44px\]/);
      expect(src, "the band height belongs in shell-header.ts").not.toMatch(/pb-5 pt-7/);
      // `h-20` / `min-h-20` may appear only via the constants, never typed into a className.
      expect(src).not.toMatch(/className="[^"]*\bmin-h-20\b/);
      expect(src).not.toMatch(/className="[^"]*\bh-20\b[^"]*border-b/);
    });
  }

  it("the page title truncates and keeps a title attribute", () => {
    // Wrapping would grow the band and knock the hairlines out of step again; truncating with no
    // `title` is a TRUNCATED defect under audit:clipping — it has to be both.
    expect(SHARED).toMatch(/HEADER_TITLE_CLASS[\s\S]*truncate/);
    for (const src of [APP, DEMO]) expect(src).toMatch(/<h1 title=\{/);
  });

  it("⚠️ the demo banner is outside the grid, above both columns", () => {
    /*
     * Inside the content column it pushed the page header 45px down while the brand cell stayed
     * at the top, so the hairlines could never meet however well the band was sized — measured
     * 80px vs 125px after the band itself was already correct. Out here it is plainly a wrapper
     * around the app rather than part of it.
     */
    const grid = DEMO.indexOf("lg:grid-cols-[280px_minmax(0,1fr)]");
    const banner = DEMO.indexOf("border-[var(--brand-200)] bg-[var(--surface-brand)]");
    expect(banner).toBeGreaterThan(0);
    expect(banner, "the demo banner must sit before the grid, not inside the content column").toBeLessThan(grid);
  });
});
