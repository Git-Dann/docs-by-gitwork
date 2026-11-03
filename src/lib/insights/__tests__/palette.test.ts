import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  INSIGHT_COLOR_KEYS,
  INSIGHT_MARK_COLOR,
  insightColor,
  insightColorKey,
  isInsightColorKey,
} from "@/lib/insights/palette";

describe("the palette itself", () => {
  it("is the documented six keys, in the documented order", () => {
    expect(INSIGHT_COLOR_KEYS).toEqual(["blue", "violet", "emerald", "amber", "rose", "slate"]);
  });

  it("gives every key a distinct colour", () => {
    // Two keys resolving to the same hex makes two categories indistinguishable on the chart
    // while every other check still passes.
    const hexes = Object.values(INSIGHT_MARK_COLOR);
    expect(new Set(hexes).size).toBe(hexes.length);
    expect(hexes).toHaveLength(INSIGHT_COLOR_KEYS.length);
  });

  it("agrees with the gantt chart, which is the repo's one sanctioned categorical set", () => {
    // A source-text assertion rather than an import: `gantt-chart.tsx` is `"use client"` and
    // drags a React tree into this node test. Same discipline as the wiki wiring tests.
    // Without it the two lists drift and the same category is one colour on a Gantt and
    // another on a chart beside it, with nothing to catch it.
    const source = readFileSync(
      path.join(process.cwd(), "src/components/tasks/gantt-chart.tsx"),
      "utf8",
    );
    for (const key of INSIGHT_COLOR_KEYS) {
      expect(source, `gantt-chart.tsx no longer contains the ${key} hex`).toContain(
        INSIGHT_MARK_COLOR[key],
      );
    }
  });
});

describe("isInsightColorKey", () => {
  it("accepts each of the six keys", () => {
    for (const key of INSIGHT_COLOR_KEYS) {
      expect(isInsightColorKey(key)).toBe(true);
    }
  });

  it("rejects a hex, so a stored colour can never pass for a stored key", () => {
    // The module's central rule: a board stores a KEY, never a hex. A hex that satisfied the
    // guard would be written back and would outlive the palette it came from.
    expect(isInsightColorKey("#2563eb")).toBe(false);
    expect(isInsightColorKey(INSIGHT_MARK_COLOR.violet)).toBe(false);
  });

  it("rejects everything else, including near-misses and non-strings", () => {
    const rejected: unknown[] = [
      "Blue",
      "BLUE",
      " blue",
      "blue ",
      "indigo",
      "",
      null,
      undefined,
      0,
      1,
      true,
      {},
      [],
      ["blue"],
      new String("blue"),
    ];
    for (const value of rejected) {
      expect(isInsightColorKey(value), `${String(value)} was accepted`).toBe(false);
    }
  });
});

describe("insightColor", () => {
  it("cycles the six colours by position when a point has no colour of its own", () => {
    // A single default would draw a six-slice pie in one colour, which is not a pie.
    const cycled = Array.from({ length: 6 }, (_, i) => insightColor(null, i));
    expect(cycled).toEqual(INSIGHT_COLOR_KEYS.map((k) => INSIGHT_MARK_COLOR[k]));
  });

  it("wraps round rather than running out, past the sixth point", () => {
    for (let i = 0; i < 20; i += 1) {
      expect(insightColor(null, i)).toBe(insightColor(null, i + INSIGHT_COLOR_KEYS.length));
    }
  });

  it("treats an absent colour the same however it is absent", () => {
    for (let i = 0; i < 6; i += 1) {
      expect(insightColor(undefined, i)).toBe(insightColor(null, i));
    }
  });

  it("is deterministic — the same point resolves to the same colour on every render", () => {
    // A colour that moves between renders makes a legend wrong and a screenshot unreproducible.
    for (let i = 0; i < 6; i += 1) {
      expect(insightColor(null, i)).toBe(insightColor(null, i));
      expect(insightColor("emerald", i)).toBe(insightColor("emerald", i));
    }
  });

  it("falls back to the cycle for an unrecognised colour, never echoing it back", () => {
    // A raw string reaching the fill attribute is either an invalid colour (the mark vanishes)
    // or an off-palette one (the board stops matching the rest of the page).
    const unknown = ["indigo", "#ff0000", "red", "rgb(1,2,3)", "", "BLUE", "var(--brand)"];
    const palette = Object.values(INSIGHT_MARK_COLOR);
    unknown.forEach((value, i) => {
      const resolved = insightColor(value, i);
      expect(resolved).not.toBe(value);
      expect(palette).toContain(resolved);
      expect(resolved).toBe(insightColor(null, i));
    });
  });

  it("honours a valid key whatever position the point sits in", () => {
    for (const key of INSIGHT_COLOR_KEYS) {
      for (const index of [0, 1, 5, 6, 97]) {
        expect(insightColor(key, index)).toBe(INSIGHT_MARK_COLOR[key]);
      }
    }
  });
});

describe("insightColorKey", () => {
  it("returns the key for the colour insightColor would draw", () => {
    // The two must not disagree: this is what a form writes back when an author accepts the
    // default, so a mismatch silently recolours the point the moment it is saved.
    const cases: Array<[string | null | undefined, number]> = [
      [null, 0],
      [undefined, 3],
      ["indigo", 4],
      ["#2563eb", 5],
      ["rose", 1],
      ["slate", 11],
    ];
    for (const [key, index] of cases) {
      expect(INSIGHT_MARK_COLOR[insightColorKey(key, index)]).toBe(insightColor(key, index));
    }
  });

  it("always returns a key the guard accepts, never a raw input", () => {
    for (const value of ["indigo", "#2563eb", "", null, undefined]) {
      expect(isInsightColorKey(insightColorKey(value, 2))).toBe(true);
    }
  });
});
