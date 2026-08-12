import { describe, expect, it } from "vitest";
import {
  AA_LARGE,
  contrastRatio,
  extractColorStops,
  INK_DARK,
  INK_LIGHT,
  readableInkOnGradient,
  relativeLuminance,
} from "../contrast";

/**
 * The reported defect, end to end: PollenIQ's brand-guidelines hero.
 *
 * A warm palette — golden pollen primary — with a pale cream/peach gradient. The
 * hero derived its ink from the PRIMARY while painting the GRADIENT, so it chose
 * white and put it on a near-white band.
 *
 * Kept as its own test because the two-part nature is what made it survive a
 * first fix: correcting the ink-choice rule changed nothing here, since the
 * colour being measured was never the one on screen.
 */

const POLLEN = {
  primary: "#D4A017", // golden pollen — mid tone
  gradient: "linear-gradient(135deg, #FDF6E9 0%, #F7E3C8 100%)", // linen → pale peach
};

/** What the hero used to do: threshold on the PRIMARY. */
const oldHeroInk = (primary: string) => (relativeLuminance(primary) > 0.5 ? "#0B0F19" : INK_LIGHT);

describe("brand guidelines hero", () => {
  it("used to choose white and paint it on a near-white band", () => {
    expect(oldHeroInk(POLLEN.primary)).toBe(INK_LIGHT);
    for (const stop of extractColorStops(POLLEN.gradient)) {
      // Nowhere near legible: ~1.1:1 against both stops.
      expect(contrastRatio(stop, INK_LIGHT)).toBeLessThan(1.5);
    }
  });

  it("now chooses an ink that reads across the whole band", () => {
    const ink = readableInkOnGradient(POLLEN.gradient, POLLEN.primary);
    expect(ink).toBe(INK_DARK);
    for (const stop of extractColorStops(POLLEN.gradient)) {
      expect(contrastRatio(stop, ink)).toBeGreaterThanOrEqual(AA_LARGE);
    }
  });

  it("is decided by the gradient, not the primary — even when they disagree", () => {
    // The heart of it: a mid-tone primary would say "white", the pale band says
    // "dark". The band wins, because the band is what the reader sees.
    expect(relativeLuminance(POLLEN.primary)).toBeLessThan(0.5);
    expect(readableInkOnGradient(POLLEN.gradient, POLLEN.primary)).toBe(INK_DARK);
  });

  it("does not regress a conventional dark brand hero", () => {
    const dark = "linear-gradient(135deg, #0F172A 0%, #1F2937 100%)";
    expect(readableInkOnGradient(dark, "#1D4ED8")).toBe(INK_LIGHT);
  });
});
