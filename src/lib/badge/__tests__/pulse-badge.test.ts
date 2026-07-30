import { describe, expect, it } from "vitest";
import {
  monoWidth,
  renderPulseBadge,
  scoreBand,
  scoreGrade,
  serifWidth,
  type BadgeStyle,
} from "../pulse-badge";

const STYLES: BadgeStyle[] = ["shield", "ring", "card", "bar"];

// The badge ends up on a client's own site, so the properties worth testing are
// the ones that make it safe to hand out: it never fetches anything, it renders
// correctly with no animation, and it can't be made to disagree with the report
// it links to.

describe("score bands", () => {
  // Mirrors HealthScoreRing in src/components/document-cover.tsx. If that ever
  // changes, this fails and the two are reconciled deliberately rather than
  // drifting into a badge that contradicts its own report.
  it("matches the report's thresholds", () => {
    expect(scoreGrade(100)).toBe("EXCELLENT");
    expect(scoreGrade(90)).toBe("EXCELLENT");
    expect(scoreGrade(89)).toBe("GOOD");
    expect(scoreGrade(75)).toBe("GOOD");
    expect(scoreGrade(74)).toBe("NEEDS WORK");
    expect(scoreGrade(50)).toBe("NEEDS WORK");
    expect(scoreGrade(49)).toBe("AT RISK");
    expect(scoreGrade(0)).toBe("AT RISK");
  });

  it("colours on the same boundaries as the grade", () => {
    expect(scoreBand(75)).toBe("#16A34A");
    expect(scoreBand(74)).toBe("#D97706");
    expect(scoreBand(50)).toBe("#D97706");
    expect(scoreBand(49)).toBe("#DC2626");
  });
});

describe("self-containment", () => {
  it.each(STYLES)("%s references no external resource", (style) => {
    const { svg } = renderPulseBadge({ score: 82, style, motion: true, project: "example.com", bars: [{ label: "SECURITY", value: 0.9 }] });
    // An <img>-embedded SVG cannot fetch anything, so anything that tries is a
    // silently broken badge on someone else's page. The SVG namespace is a
    // declaration rather than a fetch, so it is dropped before the check.
    expect(svg.replace(/xmlns="[^"]*"/g, "")).not.toMatch(/https?:\/\//);
    expect(svg).not.toMatch(/<image\b/);
    expect(svg).not.toMatch(/@font-face|font-family/);
    expect(svg).not.toMatch(/<script/i);
    expect(svg).not.toMatch(/xlink:href/);
  });

  it.each(STYLES)("%s composes type as outlined paths, never <text>", (style) => {
    const { svg } = renderPulseBadge({ score: 82, style, project: "example.com" });
    expect(svg).not.toMatch(/<text\b/);
    expect(svg).toMatch(/<path/);
  });
});

describe("static build", () => {
  it.each(STYLES)("%s carries no <style> block unless motion is asked for", (style) => {
    const still = renderPulseBadge({ score: 82, style, project: "x", bars: [{ label: "A", value: 0.5 }] });
    expect(still.svg).not.toContain("<style>");
    expect(still.svg).not.toContain("@keyframes");

    const moving = renderPulseBadge({ score: 82, style, motion: true, project: "x", bars: [{ label: "A", value: 0.5 }] });
    expect(moving.svg).toContain("@keyframes");
  });

  it("keeps the finished geometry when motion is dropped", () => {
    // The static build is the animated one minus <style>, which is only correct
    // because every base style already equals the finished state. If an entrance
    // animation ever moves back into a base attribute, this catches it: the
    // score arc's dasharray must be the FILLED value in both builds.
    const still = renderPulseBadge({ score: 82, style: "ring" });
    const moving = renderPulseBadge({ score: 82, style: "ring", motion: true });
    const dash = /stroke-dasharray="([\d.]+) ([\d.]+)"/;
    expect(still.svg.match(dash)?.[1]).toBe(moving.svg.match(dash)?.[1]);
    expect(Number(still.svg.match(dash)![1])).toBeGreaterThan(0);
  });

  it("honours prefers-reduced-motion in the animated build", () => {
    const { svg } = renderPulseBadge({ score: 82, style: "ring", motion: true });
    expect(svg).toContain("prefers-reduced-motion");
  });
});

describe("score handling", () => {
  it("clamps out-of-range scores rather than throwing", () => {
    // A badge is decoration on someone else's page: a 500 there is worse than a
    // rounded number.
    // Asserted on the accessible label: the artwork's own type is outlined to
    // paths, so the grade never appears as a matchable string.
    expect(renderPulseBadge({ score: 140, style: "ring" }).svg).toContain("score 100 of 100");
    expect(renderPulseBadge({ score: -20, style: "ring" }).svg).toContain("score 0 of 100");
    expect(renderPulseBadge({ score: 140, style: "ring" }).svg).toContain("excellent");
    expect(renderPulseBadge({ score: -20, style: "ring" }).svg).toContain("at risk");
    expect(() => renderPulseBadge({ score: Number.NaN, style: "ring" })).not.toThrow();
  });

  it("widens the shield as the value gets longer", () => {
    const two = renderPulseBadge({ score: 92 });
    const three = renderPulseBadge({ score: 100 });
    expect(three.width).toBeGreaterThan(two.width);
    // …and the declared width matches the viewBox, or the host page mis-sizes it.
    expect(three.svg).toContain(`viewBox="0 0 ${three.width} ${three.height}"`);
  });

  it("draws the arc in proportion to the score", () => {
    const dash = (s: number) =>
      Number(renderPulseBadge({ score: s, style: "ring" }).svg.match(/stroke-dasharray="([\d.]+)/)![1]);
    expect(dash(50)).toBeCloseTo(dash(100) / 2, 1);
    expect(dash(0)).toBe(0);
  });
});

describe("theming", () => {
  it("lifts the accent on dark, where the light-mode blue fails contrast", () => {
    // `card` is the style that actually paints with the accent (its domain
    // bars); the score-coloured styles only ever use the semantic band.
    const opts = { score: 82, style: "card" as const, project: "x", bars: [{ label: "SECURITY", value: 0.9 }] };
    const light = renderPulseBadge({ ...opts, theme: "light" });
    const dark = renderPulseBadge({ ...opts, theme: "dark" });
    expect(dark.svg).toContain("#6BA0FF");
    expect(light.svg).toContain("#1D4ED8");
    expect(light.svg).not.toContain("#6BA0FF");
    // …and the semantic green lifts too, for the same contrast reason.
    expect(dark.svg).toContain("#4ADE80");
    expect(light.svg).toContain("#16A34A");
  });
});

describe("escaping", () => {
  it("escapes the project name into the accessible label", () => {
    const { svg } = renderPulseBadge({
      score: 82, style: "card", project: '"><script>alert(1)</script>',
    });
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;");
    // The glyph table is caps-only, so the project name in the artwork itself is
    // composed from mapped glyphs and cannot emit markup at all.
    expect(svg).not.toContain('aria-label=""');
  });
});

describe("type metrics", () => {
  it("measures mono as a fixed advance per character", () => {
    expect(monoWidth("AAAA", 10)).toBeCloseTo(monoWidth("WWWW", 10), 6);
    expect(monoWidth("", 10)).toBe(0);
    // tracking applies between glyphs, not after the last one
    expect(monoWidth("AB", 10, 2)).toBeCloseTo(monoWidth("AB", 10) + 2, 6);
  });

  it("measures serif digits proportionally", () => {
    expect(serifWidth("11", 40)).toBeGreaterThan(0);
    expect(serifWidth("88", 40)).toBeGreaterThan(serifWidth("8", 40));
  });
});
