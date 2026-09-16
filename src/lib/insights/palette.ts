/**
 * The one categorical palette a chart may use.
 *
 * These are the six `MARK_COLOR` hexes from `src/components/tasks/gantt-chart.tsx` — the
 * repo's only sanctioned categorical set — repeated here rather than imported because
 * that module is `"use client"` and drags a React tree into any node test that touches it.
 * `palette.test.ts` reads the gantt source and asserts the two lists still agree, which is
 * the same source-text discipline the wiki wiring tests use.
 *
 * ⚠️ A board stores a palette KEY, never a hex. A stored hex outlives the palette it came
 * from: change the scale and every old board keeps a colour nothing else on the page uses,
 * with no way to find them. A key is re-resolved on every render.
 */

export const INSIGHT_COLOR_KEYS = [
  "blue",
  "violet",
  "emerald",
  "amber",
  "rose",
  "slate",
] as const;

export type InsightColorKey = (typeof INSIGHT_COLOR_KEYS)[number];

export const INSIGHT_MARK_COLOR: Record<InsightColorKey, string> = {
  blue: "#2563eb",
  violet: "#7c3aed",
  emerald: "#059669",
  amber: "#d97706",
  rose: "#e11d48",
  slate: "#475569",
};

export function isInsightColorKey(value: unknown): value is InsightColorKey {
  return typeof value === "string" && (INSIGHT_COLOR_KEYS as readonly string[]).includes(value);
}

/**
 * Resolve a point's colour: its own key if it has a valid one, else the next colour in
 * the cycle by position.
 *
 * Falling back by INDEX rather than to a single default matters — a pie whose author
 * coloured nothing would otherwise draw six identical slices, which is not a pie.
 */
export function insightColor(key: string | null | undefined, index: number): string {
  if (isInsightColorKey(key)) return INSIGHT_MARK_COLOR[key];
  return INSIGHT_MARK_COLOR[INSIGHT_COLOR_KEYS[index % INSIGHT_COLOR_KEYS.length]];
}

/** The key rather than the hex, for anywhere that needs to round-trip a default. */
export function insightColorKey(key: string | null | undefined, index: number): InsightColorKey {
  if (isInsightColorKey(key)) return key;
  return INSIGHT_COLOR_KEYS[index % INSIGHT_COLOR_KEYS.length];
}
