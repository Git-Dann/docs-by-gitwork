import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The sidebar brand cell and the page header must take their height from ONE constant.
 *
 * These two elements sit side by side and are meant to show a single continuous hairline
 * across the top of the app, but they are not in a shared grid row — the rail spans full
 * height and carries its own brand block — so nothing structural keeps them level. In
 * August 2026 the logo was reduced from 48px to 32px and the two drifted 48.6px apart
 * (brand line at 81px, header line at 129.6px) with no error, no failing test, and nothing
 * for `audit:ui` or `audit:clipping` to catch: nothing was clipped and no class was misused,
 * the top of the app was just crooked.
 *
 * So the guard is not "are they equal" — a static test cannot measure rendered pixels — but
 * the property that makes them equal: neither cell hardcodes its own vertical size, and both
 * reference the shared constant. That is the thing a future edit would break.
 *
 * ⚠️ Nov 2026: the constants moved OUT of `app-shell.tsx` into `shell-header.ts`, because the
 * DEMO shell is a second copy of this same header and could not reach them there — so it never
 * got the fix above, and carried a 130px band with a 44px title (against the app's 80px and 28px)
 * with its own two sides 78px out of true. This file keeps watching the app shell's two cells;
 * `src/components/__tests__/shell-header.test.ts` watches that both shells read the one source.
 */

const SHELL = join(__dirname, "..", "components", "app-shell.tsx");
const source = readFileSync(SHELL, "utf8");
const shared = readFileSync(join(__dirname, "..", "components", "shell-header.ts"), "utf8");

/** The brand cell — the sidebar's logo block, identified by its border + horizontal padding. */
const BRAND_CELL = /"flex shrink-0 items-center border-b border-\[var\(--border-2\)\] px-3"/;
/** The page header element. Its classes come from the shared constants, not an inline string. */
const HEADER = /<header className=\{cn\(/;

describe("top band alignment", () => {
  it("declares both band constants, in the one place both shells can read", () => {
    expect(shared).toMatch(/export const HEADER_BAND_H = "h-20";/);
    expect(shared).toMatch(/export const HEADER_BAND_MIN = "min-h-20";/);
    // And the app shell reads them rather than keeping a second copy.
    expect(source).toContain('from "@/components/shell-header"');
    expect(source).not.toMatch(/const HEADER_BAND_(H|MIN) =/);
  });

  it("the brand cell takes its height from HEADER_BAND_H", () => {
    expect(source).toMatch(BRAND_CELL);
    // The constant must appear in the same className expression as the brand cell classes.
    const at = source.search(BRAND_CELL);
    const window = source.slice(at, at + 300);
    expect(
      window,
      "The sidebar brand cell must use HEADER_BAND_H so it stays level with the page header.",
    ).toContain("HEADER_BAND_H");
  });

  it("the page header takes its height from HEADER_BAND_MIN", () => {
    const m = source.match(HEADER);
    expect(m, "Could not find the <header> element — this test needs updating.").toBeTruthy();
    const at = source.search(HEADER);
    const window = source.slice(at, at + 120);
    expect(
      window,
      "The page header must use HEADER_BAND_MIN so it stays level with the sidebar brand cell.",
    ).toContain("HEADER_BAND_MIN");
  });

  it("neither band cell hardcodes vertical padding that would fight the shared height", () => {
    // `pt-7`/`pb-5` on either cell is exactly how the two drifted apart the first time:
    // the height then comes from content, so changing the logo or the title size moves
    // one line and not the other.
    const brandAt = source.search(BRAND_CELL);
    const brandWindow = source.slice(brandAt, brandAt + 300);
    expect(brandWindow).not.toMatch(/\bp[tby]-\d/);

    // The header's own classes live in the shared module now. py-3 is fine (it is inside a
    // min-height, so it cannot drive the band taller than 80px on its own); pt-7/pb-5 style
    // asymmetric padding is what must not come back — in EITHER shell.
    const bandClasses = shared.match(/HEADER_BAND_CLASS =\s*([\s\S]*?);/)?.[1] ?? "";
    expect(bandClasses).not.toMatch(/\bpt-\d/);
    expect(bandClasses).not.toMatch(/\bpb-\d/);
  });

  it("the page title truncates AND carries a title attribute", () => {
    // Truncating keeps the band from growing; the title attribute is what stops that being
    // a TRUNCATED defect under audit:clipping. Neither is optional on its own.
    expect(source).toMatch(/title=\{title\}/);
    expect(shared).toMatch(/HEADER_TITLE_CLASS =[\s\S]*truncate text-\[28px\]/);
    expect(source).toMatch(/title=\{subtitle\}/);
  });
});
