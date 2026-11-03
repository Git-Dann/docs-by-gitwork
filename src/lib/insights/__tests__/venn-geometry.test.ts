import { describe, expect, it } from "vitest";
import {
  VENN_REGIONS_2,
  VENN_REGIONS_3,
  regionAt,
  regionLabel,
  regionsFor,
  vennGeometry,
  type VennGeometry,
} from "@/lib/insights/venn-geometry";

const parseViewBox = (viewBox: string) => {
  const [minX, minY, width, height] = viewBox.split(/\s+/).map(Number);
  return { minX, minY, width, height };
};

const inViewBox = (geo: VennGeometry, x: number, y: number) => {
  const box = parseViewBox(geo.viewBox);
  return x >= box.minX && x <= box.minX + box.width && y >= box.minY && y <= box.minY + box.height;
};

describe("vennGeometry", () => {
  it("draws one circle per set", () => {
    expect(vennGeometry(2).circles).toHaveLength(2);
    expect(vennGeometry(3).circles).toHaveLength(3);
  });

  it("declares a viewBox that matches its own width and height", () => {
    // A viewBox disagreeing with width/height scales every hand-tuned constant below by a
    // factor nobody intended, which looks like every anchor being wrong at once.
    for (const setCount of [2, 3] as const) {
      const geo = vennGeometry(setCount);
      expect(geo.viewBox).toBe(`0 0 ${geo.width} ${geo.height}`);
    }
  });
});

describe("region anchors", () => {
  // This is the test the module exists for. Every anchor is a hand-typed pair of numbers, so
  // the only realistic defect is a mistyped one — and a mistyped anchor prints a region's
  // count inside the wrong region, silently, while the diagram still looks plausible.
  // Asking which circles actually contain each anchor verifies every constant by construction.
  it.each([2, 3] as const)(
    "put each %i-set region's count inside exactly that region's circles and no others",
    (setCount) => {
      const geo = vennGeometry(setCount);
      for (const region of regionsFor(setCount)) {
        const anchor = geo.anchors[region];
        expect(anchor, `no anchor declared for region ${region}`).toBeDefined();
        expect(regionAt(anchor, geo)).toBe(region);
      }
    },
  );

  it.each([2, 3] as const)("declare an anchor for every %i-set region and no stray extras", (setCount) => {
    // An anchor map with a region missing draws no count for it; one with an extra key is a
    // leftover from an earlier arrangement that no longer means anything.
    const geo = vennGeometry(setCount);
    expect(Object.keys(geo.anchors).sort()).toEqual([...regionsFor(setCount)].sort());
  });

  it.each([2, 3] as const)("keep every %i-set anchor inside the drawn area", (setCount) => {
    const geo = vennGeometry(setCount);
    for (const [region, anchor] of Object.entries(geo.anchors)) {
      expect(inViewBox(geo, anchor.x, anchor.y), `anchor ${region} is outside the viewBox`).toBe(true);
    }
  });
});

describe("set name labels", () => {
  it.each([2, 3] as const)("sit inside the drawn area for every %i-set circle", (setCount) => {
    // A set name placed outside the viewBox is clipped away entirely, so the diagram renders
    // with unnamed circles — and nothing else in the layout reports a problem.
    const geo = vennGeometry(setCount);
    for (const circle of geo.circles) {
      expect(
        inViewBox(geo, circle.labelX, circle.labelY),
        `label for set ${circle.key} is outside the viewBox`,
      ).toBe(true);
    }
  });

  it.each([2, 3] as const)("sit outside the circles they name, for %i sets", (setCount) => {
    // The labels are documented as sitting outside the circles rather than above them; one
    // that drifts inside collides with the region count printed there.
    const geo = vennGeometry(setCount);
    for (const circle of geo.circles) {
      expect(
        regionAt({ x: circle.labelX, y: circle.labelY }, geo),
        `label for set ${circle.key} has drifted inside a circle`,
      ).toBe("");
    }
  });
});

describe("regionsFor", () => {
  it("lists three regions for two sets and seven for three", () => {
    expect(regionsFor(2)).toHaveLength(3);
    expect(regionsFor(3)).toHaveLength(7);
  });

  it("lists the single sets first, A first of all", () => {
    expect(regionsFor(2)[0]).toBe("A");
    expect(regionsFor(3)[0]).toBe("A");
    expect(regionsFor(2)).toEqual(["A", "B", "AB"]);
    expect(regionsFor(3)).toEqual(["A", "B", "C", "AB", "AC", "BC", "ABC"]);
  });

  it("returns the same order on every call", () => {
    // The order is the order the counts are rendered in; a list that reshuffles between
    // renders moves the numbers around under the reader.
    expect([...regionsFor(3)]).toEqual([...regionsFor(3)]);
    expect(regionsFor(2)).toEqual(VENN_REGIONS_2);
    expect(regionsFor(3)).toEqual(VENN_REGIONS_3);
  });
});

describe("regionLabel", () => {
  const setLabels = { A: "Tows", B: "Stores on site", C: "Has a service plan" };

  it("names a region in English using the sets' own labels", () => {
    expect(regionLabel("A", setLabels)).toBe("Only — Tows");
    expect(regionLabel("AB", setLabels)).toBe("Both — Tows + Stores on site");
    expect(regionLabel("ABC", setLabels)).toBe("All three");
  });

  it("never uses set notation or a bare set key, for any region of either arrangement", () => {
    // This page is read by clients. `A ∩ B` — or a stray bare "A" left in because a set had
    // no label — communicates nothing to someone who was never told what A and B are.
    const bareSetKey = /(^|[^A-Za-z])[ABC]([^A-Za-z]|$)/;
    const regions = [...regionsFor(2), ...regionsFor(3)];
    for (const region of regions) {
      const label = regionLabel(region, setLabels);
      expect(label, `${region} used set notation`).not.toMatch(/[∩∪∖\\]/);
      expect(label, `${region} leaked a bare set key`).not.toMatch(bareSetKey);
    }
  });

  it("falls back to the raw set key only while a set is still unlabelled", () => {
    // Pinned because it is the one case where a bare key can reach the page, and it must stay
    // confined to it: an unlabelled set is an authoring state, never a rendered board.
    expect(regionLabel("AB", { A: "Tows" })).toBe("Both — Tows + B");
    expect(regionLabel("AB", setLabels)).not.toMatch(/(^|[^A-Za-z])[ABC]([^A-Za-z]|$)/);
  });
});
