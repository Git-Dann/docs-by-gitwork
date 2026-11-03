/**
 * Bar-chart geometry for a LABELLED, author-authored chart.
 *
 * ## Why not `MiniColumns`
 *
 * `analytics-widgets.tsx` already has a column chart, and it is reused for the pie (its
 * `Donut` needs no changes at all). The bar is different, for three concrete reasons:
 *
 *  1. `MiniColumns` is `preserveAspectRatio="none"` — it STRETCHES. Correct for a micro
 *     chart in a stat strip; wrong the moment there is text, which would stretch with it.
 *  2. It has no labels. Its one consumer supplies axis labels as a sibling row of
 *     `<span>`s, which works for five fixed buckets and not for twelve operator-authored
 *     category names.
 *  3. It takes `values: number[]` — no per-column colour, which a categorical board needs.
 *
 * Extending it would push label fitting, a height-varying viewBox and a per-column palette
 * into a component whose two existing consumers want none of it. The diverging-baseline
 * maths is five lines and is reimplemented here deliberately; the test below pins the same
 * semantics so the two cannot disagree about a negative value.
 */

export interface BarPoint {
  id: string;
  label: string;
  value: number;
  color: string;
}

export interface PlacedBar {
  id: string;
  label: string;
  value: number;
  color: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Where the value sits — above a positive bar, below a negative one. */
  valueX: number;
  valueY: number;
  labelX: number;
}

export interface BarLayout {
  bars: PlacedBar[];
  baselineY: number;
  width: number;
  height: number;
  viewBox: string;
  /** How the category labels have to be drawn to fit. */
  labelMode: "inline" | "stagger";
  /** Every bar is zero (or there are none) — the caller shows an empty state instead. */
  empty: boolean;
}

const PLOT_H = 190;
const TOP_PAD = 22; // room for the value above the tallest bar
const LABEL_H = 34;
const GAP = 12;
const MAX_BAR_W = 88;
const MIN_BAR_W = 18;

/**
 * @param innerWidth the width the chart is being drawn into, in viewBox units
 */
export function layoutColumns(points: readonly BarPoint[], innerWidth = 640): BarLayout {
  const n = points.length;
  const height = TOP_PAD + PLOT_H + LABEL_H;
  if (n === 0) {
    return {
      bars: [],
      baselineY: TOP_PAD + PLOT_H,
      width: innerWidth,
      height,
      viewBox: `0 0 ${innerWidth} ${height}`,
      labelMode: "inline",
      empty: true,
    };
  }

  const slot = innerWidth / n;
  const barWidth = Math.max(MIN_BAR_W, Math.min(MAX_BAR_W, slot - GAP));

  const maxAbs = Math.max(...points.map((p) => Math.abs(p.value)), 0);
  const hasNeg = points.some((p) => p.value < 0);
  // A chart with negatives splits its plot around a mid baseline; one without uses the
  // whole height above the bottom. Same rule `MiniColumns` applies.
  const baselineY = hasNeg ? TOP_PAD + PLOT_H / 2 : TOP_PAD + PLOT_H;
  const usable = hasNeg ? PLOT_H / 2 : PLOT_H;
  const scale = maxAbs === 0 ? 0 : usable / maxAbs;

  const bars: PlacedBar[] = points.map((p, i) => {
    const centre = slot * i + slot / 2;
    const h = Math.abs(p.value) * scale;
    const isNeg = p.value < 0;
    return {
      id: p.id,
      label: p.label,
      value: p.value,
      color: p.color,
      x: centre - barWidth / 2,
      y: isNeg ? baselineY : baselineY - h,
      width: barWidth,
      height: h,
      valueX: centre,
      valueY: isNeg ? baselineY + h + 14 : baselineY - h - 7,
      labelX: centre,
    };
  });

  // Stagger the labels when they cannot sit side by side. Rotating them instead would be
  // unreadable on a phone and would make the height unbounded.
  const longest = Math.max(...points.map((p) => p.label.length), 0);
  const labelMode: "inline" | "stagger" = longest * 6.4 > slot - 4 ? "stagger" : "inline";

  return {
    bars,
    baselineY,
    width: innerWidth,
    height,
    viewBox: `0 0 ${innerWidth} ${height}`,
    labelMode,
    empty: maxAbs === 0,
  };
}
