import { describe, expect, it } from "vitest";

import {
  isLive,
  markState,
  renderCountermarkBadge,
  type CountermarkBadgeGrade,
  type CountermarkBadgeInput,
  type CountermarkBadgeStatus,
  type CountermarkStyle,
} from "../countermark-badge";
import { DARK, LIGHT } from "../svg-kit";

const STYLES: CountermarkStyle[] = ["shield", "disc", "card"];
const GRADES: CountermarkBadgeGrade[] = ["CERTIFIED", "CONDITIONAL", "NOT_CERTIFIED", "INCOMPLETE"];
const DEAD: CountermarkBadgeStatus[] = ["LAPSED", "REVOKED", "SUPERSEDED"];

const base: CountermarkBadgeInput = {
  grade: "CERTIFIED",
  status: "VALID",
  daysRemaining: 62,
  validityDays: 90,
  sealed: true,
  subject: "example.com",
  standard: "SAS-1 v1.0",
};

// This badge is the most likely place for an attestation to get overstated, so
// the tests are about honesty rather than pixels. Each block maps to one of the
// three rules in the module header.

describe("rule 1 — validity dominates grade", () => {
  it.each(DEAD)("a %s mark never leads with its grade", (status) => {
    // The failure this guards against: a badge still reading CERTIFIED months
    // after the mark expired.
    const state = markState("CERTIFIED", status, LIGHT);
    expect(state.headline).toBe(status);
    expect(state.live).toBe(false);
    expect(state.tone).toBe(LIGHT.neutral);
  });

  it.each(DEAD)("%s says so in the accessible label too", (status) => {
    const { svg } = renderCountermarkBadge({ ...base, status, style: "card" });
    expect(svg).toContain("no longer asserting");
    expect(svg).not.toContain("certified,");
  });

  it("leads with the grade only while the mark is inside its window", () => {
    expect(markState("CERTIFIED", "VALID", LIGHT).headline).toBe("CERTIFIED");
    expect(markState("CERTIFIED", "EXPIRING", LIGHT).headline).toBe("CERTIFIED");
    expect(isLive("VALID")).toBe(true);
    expect(isLive("EXPIRING")).toBe(true);
    expect(isLive("LAPSED")).toBe(false);
  });

  it("draws no validity arc once the mark is dead", () => {
    const live = renderCountermarkBadge({ ...base, style: "disc" });
    const dead = renderCountermarkBadge({ ...base, status: "LAPSED", style: "disc" });
    expect(live.svg).toMatch(/class="arc"/);
    expect(dead.svg).not.toMatch(/class="arc"/);
  });

  it("strikes through the dead shield rather than only grey-ing it", () => {
    const dead = renderCountermarkBadge({ ...base, status: "REVOKED", style: "shield" });
    const live = renderCountermarkBadge({ ...base, style: "shield" });
    expect(dead.svg).toMatch(/stroke-width="1" opacity="0.5"/);
    expect(live.svg).not.toMatch(/stroke-width="1" opacity="0.5"/);
  });
});

describe("rule 2 — INCOMPLETE is not NOT_CERTIFIED", () => {
  it("gives them different tones", () => {
    // "We could not check this" and "this is provably broken" are different
    // facts with different fixes — CLAUDE.md §35.
    const incomplete = markState("INCOMPLETE", "VALID", LIGHT);
    const failed = markState("NOT_CERTIFIED", "VALID", LIGHT);
    expect(incomplete.tone).toBe(LIGHT.neutral);
    expect(failed.tone).toBe(LIGHT.bad);
    expect(incomplete.tone).not.toBe(failed.tone);
  });

  it("never paints INCOMPLETE in the danger colour", () => {
    for (const theme of ["light", "dark"] as const) {
      const t = theme === "dark" ? DARK : LIGHT;
      const { svg } = renderCountermarkBadge({ ...base, grade: "INCOMPLETE", theme, style: "card" });
      expect(svg).not.toContain(t.bad);
    }
  });

  it("maps each live grade to its own tone", () => {
    const tones = GRADES.map((g) => markState(g, "VALID", LIGHT).tone);
    expect(tones).toEqual([LIGHT.ok, LIGHT.warn, LIGHT.bad, LIGHT.neutral]);
  });
});

describe("rule 3 — an unsealed mark says so", () => {
  it.each(STYLES)("%s marks an unsealed certificate in its label", (style) => {
    const unsealed = renderCountermarkBadge({ ...base, sealed: false, style });
    expect(unsealed.svg).toContain("(unsealed)");
    const sealed = renderCountermarkBadge({ ...base, sealed: true, style });
    expect(sealed.svg).not.toContain("(unsealed)");
  });

  it("shows an UNSEALED marker on the card and disc artwork", () => {
    for (const style of ["card", "disc"] as const) {
      const before = renderCountermarkBadge({ ...base, sealed: true, style }).svg.length;
      const after = renderCountermarkBadge({ ...base, sealed: false, style }).svg.length;
      expect(after).toBeGreaterThan(before);
    }
  });
});

describe("days remaining", () => {
  it("never renders a negative countdown", () => {
    // A lapsed mark is not "-12 days remaining".
    const { svg } = renderCountermarkBadge({ ...base, daysRemaining: -12, status: "LAPSED", style: "disc" });
    expect(svg).not.toContain("-12");
  });

  it("scales the arc to the share of the window left", () => {
    const dash = (days: number) =>
      Number(
        renderCountermarkBadge({ ...base, daysRemaining: days, style: "disc" })
          .svg.match(/stroke-dasharray="([\d.]+)/)?.[1] ?? 0,
      );
    expect(dash(90)).toBeGreaterThan(dash(45));
    expect(dash(45)).toBeGreaterThan(dash(9));
    expect(dash(45)).toBeCloseTo(dash(90) / 2, 0);
  });

  it("clamps an over-long remainder to a full ring", () => {
    const over = renderCountermarkBadge({ ...base, daysRemaining: 400, validityDays: 90, style: "disc" });
    const full = renderCountermarkBadge({ ...base, daysRemaining: 90, validityDays: 90, style: "disc" });
    const dash = (s: string) => s.match(/stroke-dasharray="([\d.]+)/)![1];
    expect(dash(over.svg)).toBe(dash(full.svg));
  });

  it("puts the exact remaining count in the accessible label", () => {
    // The artwork's type is outlined, so the label is where the number is
    // actually readable to a screen reader or a link preview.
    expect(renderCountermarkBadge({ ...base, daysRemaining: 1, style: "disc" }).svg)
      .toContain("1 days remaining");
    expect(renderCountermarkBadge({ ...base, daysRemaining: 62, style: "card" }).svg)
      .toContain("62 days remaining");
  });
});

describe("self-containment", () => {
  it.each(STYLES)("%s fetches nothing and uses no <text>", (style) => {
    const { svg } = renderCountermarkBadge({ ...base, style, motion: true });
    expect(svg.replace(/xmlns="[^"]*"/g, "")).not.toMatch(/https?:\/\//);
    expect(svg).not.toMatch(/<text\b|<image\b|<script|@font-face|xlink:href/);
  });

  it.each(STYLES)("%s stays correct with no animation", (style) => {
    const still = renderCountermarkBadge({ ...base, style });
    expect(still.svg).not.toContain("<style>");
    // The disc's arc must carry its finished dasharray as an attribute, not only
    // as a keyframe — an <img> that never scrolls into view freezes at frame 0.
    if (style === "disc") expect(still.svg).toMatch(/stroke-dasharray="[\d.]+ [\d.]+"/);
  });
});
