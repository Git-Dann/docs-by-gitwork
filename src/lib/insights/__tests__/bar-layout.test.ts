import { describe, expect, it } from "vitest";
import { layoutColumns, type BarLayout, type BarPoint } from "@/lib/insights/bar-layout";

const point = (id: string, value: number, label = id, color = "#2563eb"): BarPoint => ({
  id,
  label,
  value,
  color,
});

const numbersIn = (layout: BarLayout): number[] => [
  layout.baselineY,
  layout.width,
  layout.height,
  ...layout.bars.flatMap((b) => [b.x, b.y, b.width, b.height, b.valueX, b.valueY, b.labelX]),
];

const parseViewBox = (viewBox: string) => viewBox.split(/\s+/).map(Number);

describe("all-positive charts", () => {
  const layout = layoutColumns([point("a", 4), point("b", 10), point("c", 1)]);

  it("stand every bar on a baseline at the foot of the plot", () => {
    const top = Math.min(...layout.bars.map((b) => b.y));
    expect(layout.baselineY).toBeGreaterThan(top);
    for (const bar of layout.bars) {
      expect(bar.y + bar.height).toBeCloseTo(layout.baselineY, 6);
    }
  });

  it("never let a bar hang below the baseline when nothing is negative", () => {
    // A positive bar drawn downwards reads as a loss. The whole point of the baseline rule.
    for (const bar of layout.bars) {
      expect(bar.y).toBeLessThanOrEqual(layout.baselineY);
      expect(bar.y + bar.height).toBeLessThanOrEqual(layout.baselineY + 1e-6);
    }
  });

  it("size bars in proportion to their values", () => {
    const [a, b, c] = layout.bars;
    expect(b.height).toBeCloseTo(a.height * 2.5, 6);
    expect(a.height).toBeCloseTo(c.height * 4, 6);
  });

  it("keep the whole plot inside the declared height", () => {
    const [, , , height] = parseViewBox(layout.viewBox);
    for (const bar of layout.bars) {
      expect(bar.y).toBeGreaterThanOrEqual(0);
      expect(bar.y + bar.height).toBeLessThanOrEqual(height);
    }
  });
});

describe("charts mixing positive and negative values", () => {
  const layout = layoutColumns([point("up", 8), point("down", -8), point("small", -2)]);

  it("put the baseline at the middle of the plot so both directions have room", () => {
    // An all-positive chart of the same magnitude gives the two reference edges: its baseline
    // is the foot of the plot, and its tallest bar spans the plot's full height. The mixed
    // baseline has to land midway between them — anywhere lower and the negative bars run off
    // the bottom of the chart, where they are clipped rather than drawn short.
    const allPositive = layoutColumns([point("up", 8)]);
    const foot = allPositive.baselineY;
    const plotTop = foot - allPositive.bars[0].height;
    expect(layout.baselineY).toBeCloseTo((plotTop + foot) / 2, 6);
  });

  it("draw positive bars above the baseline and negative bars below it", () => {
    const up = layout.bars.find((b) => b.id === "up")!;
    const down = layout.bars.find((b) => b.id === "down")!;
    expect(up.y + up.height).toBeCloseTo(layout.baselineY, 6);
    expect(up.y).toBeLessThan(layout.baselineY);
    expect(down.y).toBeCloseTo(layout.baselineY, 6);
    expect(down.y + down.height).toBeGreaterThan(layout.baselineY);
  });

  it("make the geometry continuous across the baseline — equal magnitudes are equal lengths", () => {
    // A +8 bar and a -8 bar that differ in length say the negative one is smaller than it is.
    const up = layout.bars.find((b) => b.id === "up")!;
    const down = layout.bars.find((b) => b.id === "down")!;
    expect(down.height).toBeCloseTo(up.height, 6);
    const small = layout.bars.find((b) => b.id === "small")!;
    expect(small.height).toBeCloseTo(down.height / 4, 6);
  });

  it("never emit a negative height — direction is carried by y, not by the height", () => {
    for (const bar of layout.bars) {
      expect(bar.height).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("value labels", () => {
  const layout = layoutColumns([point("up", 8), point("down", -8)]);

  it("sit above a positive bar and below a negative one", () => {
    const up = layout.bars.find((b) => b.id === "up")!;
    const down = layout.bars.find((b) => b.id === "down")!;
    // Above means a SMALLER y in SVG coordinates; getting this backwards prints the number
    // inside the bar, where it is unreadable against the fill.
    expect(up.valueY).toBeLessThan(up.y);
    expect(down.valueY).toBeGreaterThan(down.y + down.height);
  });

  it("are centred on the bar they belong to", () => {
    for (const bar of layout.bars) {
      expect(bar.valueX).toBeCloseTo(bar.x + bar.width / 2, 6);
      expect(bar.labelX).toBeCloseTo(bar.valueX, 6);
    }
  });

  it("leave room above the tallest bar for its own value", () => {
    // TOP_PAD exists for exactly this; a tallest bar reaching y=0 would have its value clipped.
    const tallest = layout.bars.reduce((a, b) => (b.height > a.height ? b : a));
    expect(tallest.valueY).toBeGreaterThan(0);
  });
});

describe("degenerate inputs", () => {
  it("report an empty chart when every value is zero, and still emit a baseline", () => {
    const layout = layoutColumns([point("a", 0), point("b", 0), point("c", 0)]);
    expect(layout.empty).toBe(true);
    expect(layout.bars).toHaveLength(3);
    for (const bar of layout.bars) {
      expect(bar.height).toBe(0);
    }
    // Divide-by-zero on the scale is the obvious defect here — it would poison every number.
    for (const n of numbersIn(layout)) {
      expect(Number.isFinite(n)).toBe(true);
    }
    expect(Number.isFinite(layout.baselineY)).toBe(true);
    expect(layout.baselineY).toBeGreaterThan(0);
  });

  it("report an empty chart for no points at all, with a still-valid viewBox", () => {
    const layout = layoutColumns([]);
    expect(layout.empty).toBe(true);
    expect(layout.bars).toEqual([]);
    for (const n of numbersIn(layout)) {
      expect(Number.isFinite(n)).toBe(true);
    }
    const [minX, minY, width, height] = parseViewBox(layout.viewBox);
    expect([minX, minY]).toEqual([0, 0]);
    expect(width).toBeGreaterThan(0);
    expect(height).toBeGreaterThan(0);
    expect(width).toBe(layout.width);
    expect(height).toBe(layout.height);
  });

  it("do not report an empty chart when a value is merely negative", () => {
    // `empty` gates the caller's empty state; treating a wholly-negative chart as "no data"
    // would hide a board whose every number is a real, measured loss.
    const layout = layoutColumns([point("a", -3), point("b", -7)]);
    expect(layout.empty).toBe(false);
  });
});

describe("a chart with a single point", () => {
  const layout = layoutColumns([point("only", 5, "Only")]);

  it("caps the bar width instead of drawing one slab across the chart", () => {
    // Without the cap a lone point becomes a 640-wide block, which reads as a background fill
    // rather than as a measurement.
    expect(layout.bars[0].width).toBeLessThanOrEqual(88);
    expect(layout.bars[0].width).toBeGreaterThan(0);
  });

  it("centres that bar in the chart", () => {
    const bar = layout.bars[0];
    expect(bar.x + bar.width / 2).toBeCloseTo(layout.width / 2, 6);
  });
});

describe("category labels", () => {
  it("sit inline when a few short names comfortably fit", () => {
    const layout = layoutColumns([point("a", 1, "Tows"), point("b", 2, "Stores"), point("c", 3, "Hires")]);
    expect(layout.labelMode).toBe("inline");
  });

  it("stagger once names can no longer sit side by side", () => {
    // Overlapping labels are the defect; staggering is the fix that keeps the height bounded.
    const many = Array.from({ length: 12 }, (_, i) =>
      point(`p${i}`, i + 1, `Long category name ${i}`),
    );
    expect(layoutColumns(many).labelMode).toBe("stagger");
  });

  it("stagger for a long name even when there are only a few of them", () => {
    const layout = layoutColumns([
      point("a", 1, "Stores the caravan on site all year round"),
      point("b", 2, "Tows it to a seasonal pitch every spring"),
      point("c", 3, "Keeps it at home on the drive between trips"),
      point("d", 4, "Uses a commercial storage compound nearby"),
      point("e", 5, "Leaves it with the dealer over the winter"),
      point("f", 6, "Shares it with family for part of the year"),
    ]);
    expect(layout.labelMode).toBe("stagger");
  });
});

describe("the points the caller gave", () => {
  const points = [
    point("first", 3, "First", "#2563eb"),
    point("second", 9, "Second", "#059669"),
    point("third", 6, "Third", "#e11d48"),
  ];
  const layout = layoutColumns(points);

  it("keep their order left to right, whatever their values", () => {
    // Sorting by value would silently rewrite an author-ordered categorical axis.
    expect(layout.bars.map((b) => b.id)).toEqual(["first", "second", "third"]);
    const xs = layout.bars.map((b) => b.x);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
  });

  it("keep their own colours and labels", () => {
    expect(layout.bars.map((b) => b.color)).toEqual(["#2563eb", "#059669", "#e11d48"]);
    expect(layout.bars.map((b) => b.label)).toEqual(["First", "Second", "Third"]);
    expect(layout.bars.map((b) => b.value)).toEqual([3, 9, 6]);
  });

  it("never overlap one another", () => {
    for (let i = 1; i < layout.bars.length; i += 1) {
      const prev = layout.bars[i - 1];
      expect(layout.bars[i].x).toBeGreaterThanOrEqual(prev.x + prev.width);
    }
  });
});
