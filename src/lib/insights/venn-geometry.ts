/**
 * Venn geometry — fixed, not area-proportional, and that is a decision rather than a
 * shortcut.
 *
 * ⚠️ **Do not "improve" this into an area-proportional venn.** Sizing circles so every
 * region's area matches its count is a constrained optimisation with no exact solution
 * for most inputs: for a great many three-set boards the "correct" diagram cannot be
 * drawn with circles at all, so an area-proportional renderer necessarily draws something
 * close-but-wrong and presents it as measurement. Fixed circles with honest counts printed
 * in them make no claim they cannot keep.
 *
 * Every anchor below is a hand-tuned constant. `venn-geometry.test.ts` verifies each one
 * by testing which circles actually contain it — a mistyped number is the only realistic
 * failure mode here, and it is caught immediately.
 */

export const VENN_REGIONS_2 = ["A", "B", "AB"] as const;
export const VENN_REGIONS_3 = ["A", "B", "C", "AB", "AC", "BC", "ABC"] as const;
export type VennRegion = (typeof VENN_REGIONS_3)[number];

export interface VennCircle {
  key: "A" | "B" | "C";
  cx: number;
  cy: number;
  r: number;
  /** Where the set's own name sits — outside the circles, not above them. */
  labelX: number;
  labelY: number;
  labelAnchor: "start" | "middle" | "end";
}

export interface VennGeometry {
  viewBox: string;
  width: number;
  height: number;
  circles: VennCircle[];
  /** Where a region's count is printed. */
  anchors: Record<string, { x: number; y: number }>;
  regions: readonly string[];
}

const TWO: VennGeometry = {
  viewBox: "0 0 560 360",
  width: 560,
  height: 360,
  circles: [
    { key: "A", cx: 214, cy: 180, r: 118, labelX: 96, labelY: 46, labelAnchor: "start" },
    { key: "B", cx: 346, cy: 180, r: 118, labelX: 464, labelY: 46, labelAnchor: "end" },
  ],
  anchors: {
    A: { x: 161, y: 180 },
    B: { x: 399, y: 180 },
    AB: { x: 280, y: 180 },
  },
  regions: VENN_REGIONS_2,
};

/** Classic equilateral arrangement: centres on a circle of radius 74 about (280, 250). */
const THREE: VennGeometry = {
  viewBox: "0 0 560 520",
  width: 560,
  height: 520,
  circles: [
    { key: "A", cx: 280, cy: 176, r: 128, labelX: 280, labelY: 30, labelAnchor: "middle" },
    { key: "B", cx: 344, cy: 287, r: 128, labelX: 536, labelY: 430, labelAnchor: "end" },
    { key: "C", cx: 216, cy: 287, r: 128, labelX: 24, labelY: 430, labelAnchor: "start" },
  ],
  anchors: {
    A: { x: 280, y: 128 },
    B: { x: 390, y: 322 },
    C: { x: 170, y: 322 },
    AB: { x: 348, y: 208 },
    AC: { x: 212, y: 208 },
    BC: { x: 280, y: 330 },
    ABC: { x: 280, y: 252 },
  },
  regions: VENN_REGIONS_3,
};

export function vennGeometry(setCount: 2 | 3): VennGeometry {
  return setCount === 3 ? THREE : TWO;
}

export function regionsFor(setCount: 2 | 3): readonly string[] {
  return setCount === 3 ? VENN_REGIONS_3 : VENN_REGIONS_2;
}

/**
 * A region's name in plain English, using the sets' own labels.
 *
 * ⚠️ Never set notation. This page is read by clients, and `A ∩ B` communicates nothing
 * to someone who has not been told what A and B are — while "Both — Tows and Stores on
 * site" says it outright.
 */
export function regionLabel(region: string, setLabels: Record<string, string>): string {
  const names = region.split("").map((k) => setLabels[k] ?? k);
  if (names.length === 1) return `Only — ${names[0]}`;
  if (region.length === 3) return `All three`;
  return `Both — ${names.join(" + ")}`;
}

/** Which circles contain a point — the test's way of checking a hand-typed anchor. */
export function regionAt(point: { x: number; y: number }, geo: VennGeometry): string {
  return geo.circles
    .filter((c) => (point.x - c.cx) ** 2 + (point.y - c.cy) ** 2 <= c.r ** 2)
    .map((c) => c.key)
    .join("");
}
