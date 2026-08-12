import { describe, expect, it } from "vitest";
import {
  AA_LARGE,
  extractColorStops,
  readableInkOnGradient,
  AA_NORMAL,
  contrastRatio,
  ensureContrast,
  INK_DARK,
  INK_LIGHT,
  isLightBackground,
  parseHex,
  readableInk,
  relativeLuminance,
} from "../contrast";

/**
 * The bug these pin: a brand-guidelines cover whose title and tagline were
 * invisible, because "which ink reads on this background" was decided by a
 * LUMINANCE THRESHOLD rather than by comparing contrast.
 *
 * White and black contrast equally at relative luminance ≈ 0.179. The old code
 * used 0.5 (and 0.6 elsewhere), so every background in between — which is most
 * mid-tone brand colours — was given white text.
 */

/** Mid-tone brand colours: the band the old threshold got wrong. */
const MID_BRANDS = {
  pollenGold: "#D4A017",
  warmSand: "#C9A227",
  clay: "#B5651D",
  olive: "#6B8E23",
  teal: "#1F7A8C",
};

describe("relativeLuminance", () => {
  it("is gamma-corrected, not a naive channel average", () => {
    // The naive average for #808080 is 0.5; the correct value is ~0.216. A
    // threshold tuned against the naive number is wrong for every mid tone.
    expect(relativeLuminance("#808080")).toBeCloseTo(0.2159, 3);
  });

  it("anchors at black and white", () => {
    expect(relativeLuminance("#000000")).toBe(0);
    expect(relativeLuminance("#FFFFFF")).toBeCloseTo(1, 5);
  });

  it("treats an unparseable colour as white, so callers fall back to dark ink", () => {
    // Safer than assuming dark: dark ink on an unknown ground is the readable bet.
    expect(relativeLuminance("linear-gradient(...)")).toBe(1);
    expect(readableInk("linear-gradient(...)")).toBe(INK_DARK);
  });
});

describe("contrastRatio", () => {
  it("is symmetric and bounded 1..21", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 1);
    expect(contrastRatio("#FFFFFF", "#000000")).toBeCloseTo(21, 1);
    expect(contrastRatio("#123456", "#123456")).toBeCloseTo(1, 5);
  });
});

describe("readableInk", () => {
  it.each(Object.entries(MID_BRANDS))(
    "picks the ink that actually reads on %s",
    (_name, hex) => {
      const ink = readableInk(hex);
      const chosen = contrastRatio(hex, ink);
      const other = contrastRatio(hex, ink === INK_DARK ? INK_LIGHT : INK_DARK);
      expect(chosen).toBeGreaterThanOrEqual(other);
      // And it must be usable for large display type, which is what a cover is.
      expect(chosen).toBeGreaterThanOrEqual(AA_LARGE);
    },
  );

  it("would have failed under the old luminance > 0.5 rule", () => {
    // Direct regression: pollen gold sits at ~0.39 luminance, so the old rule
    // chose white — about 2.4:1, the invisible cover.
    const gold = MID_BRANDS.pollenGold;
    expect(relativeLuminance(gold)).toBeLessThan(0.5);
    expect(contrastRatio(gold, INK_LIGHT)).toBeLessThan(AA_LARGE);
    expect(readableInk(gold)).toBe(INK_DARK);
  });

  it("still uses white on genuinely dark brands", () => {
    for (const dark of ["#0F172A", "#1D1D1F", "#3B0764"]) {
      expect(readableInk(dark)).toBe(INK_LIGHT);
    }
  });

  it("always maximises contrast across a full grey ramp", () => {
    /**
     * Asserting the INVARIANT rather than a hand-picked tie colour. The first
     * version of this test expected dark ink at #767676 on the basis that white
     * and black are equal at luminance 0.179 — true for PURE black, but INK_DARK
     * is #141414, which moves the tie to ≈0.19. The code was right and the test
     * was wrong, so the test now checks the property that actually matters.
     */
    for (let v = 0; v <= 255; v += 5) {
      const hex = `#${v.toString(16).padStart(2, "0").repeat(3)}`;
      const ink = readableInk(hex);
      const other = ink === INK_DARK ? INK_LIGHT : INK_DARK;
      expect(
        contrastRatio(hex, ink),
        `readableInk("${hex}") chose ${ink}, but ${other} contrasts more`,
      ).toBeGreaterThanOrEqual(contrastRatio(hex, other));
    }
  });

  it("agrees with isLightBackground", () => {
    expect(isLightBackground("#FFFFFF")).toBe(true);
    expect(isLightBackground("#000000")).toBe(false);
  });
});

describe("ensureContrast", () => {
  it("leaves a colour alone when it already passes", () => {
    expect(ensureContrast("#0F172A", "#FFFFFF")).toBe("#0F172A");
  });

  it("darkens a pale brand colour used as text on near-white paper", () => {
    // The other half of the bug: a brand-coloured eyebrow at ~1.3:1.
    const paper = "#FBFBFA";
    const pale = "#F5C542";
    expect(contrastRatio(pale, paper)).toBeLessThan(AA_NORMAL);
    const fixed = ensureContrast(pale, paper);
    expect(contrastRatio(fixed, paper)).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it("keeps the hue recognisable rather than collapsing to black", () => {
    const fixed = ensureContrast("#F5C542", "#FBFBFA");
    const rgb = parseHex(fixed)!;
    // Still warm: red channel clearly ahead of blue.
    expect(rgb.r).toBeGreaterThan(rgb.b);
    expect(fixed).not.toBe("#000000");
  });

  it("brightens instead, on a dark ground", () => {
    const ink = ensureContrast("#1F2937", "#0F172A");
    expect(contrastRatio(ink, "#0F172A")).toBeGreaterThanOrEqual(AA_NORMAL);
    expect(relativeLuminance(ink)).toBeGreaterThan(relativeLuminance("#1F2937"));
  });

  it("honours a looser bar for large text", () => {
    const paper = "#FBFBFA";
    const atLarge = ensureContrast("#C9A227", paper, AA_LARGE);
    expect(contrastRatio(atLarge, paper)).toBeGreaterThanOrEqual(AA_LARGE);
    // A looser bar should not darken more than the strict one.
    const atNormal = ensureContrast("#C9A227", paper, AA_NORMAL);
    expect(relativeLuminance(atLarge)).toBeGreaterThanOrEqual(relativeLuminance(atNormal));
  });

  it("falls back to a readable ink for an unparseable colour", () => {
    expect(ensureContrast("not-a-colour", "#FFFFFF")).toBe(INK_DARK);
  });
});

describe("gradient bands", () => {
  /** The reported case: a pale cream/peach brand gradient. */
  const PALE = "linear-gradient(135deg, #FDF6E9 0%, #F7E3C8 100%)";
  /** A conventional dark brand gradient. */
  const DARK = "linear-gradient(135deg, #0F172A 0%, #1F2937 100%)";

  it("reads hex stops out of a gradient", () => {
    expect(extractColorStops(PALE)).toEqual(["#FDF6E9", "#F7E3C8"]);
  });

  it("reads rgb()/rgba() stops and ignores alpha", () => {
    expect(extractColorStops("linear-gradient(90deg, rgb(15, 23, 42), rgba(255,255,255,0.5))")).toEqual([
      "#0F172A",
      "#FFFFFF",
    ]);
  });

  it("skips stops it cannot parse", () => {
    expect(extractColorStops("linear-gradient(90deg, var(--brand), rebeccapurple)")).toEqual([]);
  });

  it("picks dark ink on a pale gradient — the invisible-hero case", () => {
    // This is the bug: the ink used to come from the brand PRIMARY (a mid gold →
    // white) while this band was what actually got painted.
    expect(readableInkOnGradient(PALE)).toBe(INK_DARK);
    for (const stop of extractColorStops(PALE)) {
      expect(contrastRatio(stop, INK_DARK)).toBeGreaterThanOrEqual(AA_LARGE);
    }
  });

  it("still picks white on a dark gradient", () => {
    expect(readableInkOnGradient(DARK)).toBe(INK_LIGHT);
  });

  it("judges by the WORST stop, not by the first one", () => {
    /**
     * A band running dark → white. Looking only at the first stop says "white
     * text" (it reads on the navy) and then white lands on white at the far end.
     *
     * The first version of this test used a gradient where both rules happened to
     * agree, so it passed even when the implementation was weakened to read only
     * stops[0] — it was proving nothing. This case makes the two rules disagree.
     */
    const band = "linear-gradient(90deg, #0F172A 0%, #FFFFFF 100%)";
    const stops = extractColorStops(band);
    const firstStopAnswer = readableInk(stops[0]); // what the weak rule would say
    const actual = readableInkOnGradient(band);

    expect(firstStopAnswer).toBe(INK_LIGHT);
    expect(actual).not.toBe(firstStopAnswer);

    // And the answer it does give maximises the minimum contrast along the band.
    const worst = (ink: string) => Math.min(...stops.map((st) => contrastRatio(st, ink)));
    expect(worst(actual)).toBeGreaterThan(worst(firstStopAnswer));
  });

  it("falls back to the given background when nothing parses", () => {
    expect(readableInkOnGradient("var(--brand-gradient)", "#0F172A")).toBe(INK_LIGHT);
    expect(readableInkOnGradient(null, "#FFFFFF")).toBe(INK_DARK);
  });
});
