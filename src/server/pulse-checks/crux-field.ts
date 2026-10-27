// ─────────────────────────────────────────────────────────────────────────────
// REAL-USER CORE WEB VITALS — from the Chrome UX Report, via PageSpeed Insights.
//
// The PSI response already carries CrUX field data next to the Lighthouse lab run:
// the 75th-percentile value real Chrome users saw over the last 28 days, per metric.
// Lab numbers (psi_lcp etc.) are one simulated mobile load; these are what visitors
// actually got, and INP only exists as field data — no lab run can measure it.
//
// Thresholds are Google's published Core Web Vitals boundaries (web.dev/vitals),
// judged at p75, which is how Google itself assesses a page.
//
// Honesty rules:
//   - no field data (too little Chrome traffic) → no row at all, as crux_overall
//     already does: a small site is not "slow", it is unmeasured by CrUX;
//   - URL-level data is preferred; origin-level is used when the URL has none and
//     the detail says it is the whole site's figure, not this page's.
// ─────────────────────────────────────────────────────────────────────────────

import { CATEGORIES } from "./categories";
import type { PulseScanCheckInput } from "@/types/pulse";

export interface CruxMetric {
  percentile?: number;
  category?: string;
}
export interface CruxExperience {
  overall_category?: string;
  origin_fallback?: boolean;
  metrics?: Record<string, CruxMetric | undefined>;
}

interface MetricSpec {
  key: string;
  label: string;
  /** PSI's metric name; the first present wins (TTFB was renamed out of "experimental"). */
  names: string[];
  good: number;
  poor: number;
  /** PSI reports CLS ×100 as an integer percentile. */
  scale: number;
  format: (v: number) => string;
  why: string;
}

const ms = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)} s` : `${Math.round(v)} ms`);

export const CRUX_METRICS: MetricSpec[] = [
  { key: "crux_lcp", label: "Real-user Largest Contentful Paint (p75)", names: ["LARGEST_CONTENTFUL_PAINT_MS"], good: 2500, poor: 4000, scale: 1, format: ms, why: "how long the main content takes to appear" },
  { key: "crux_inp", label: "Real-user Interaction to Next Paint (p75)", names: ["INTERACTION_TO_NEXT_PAINT"], good: 200, poor: 500, scale: 1, format: ms, why: "how quickly the page responds to taps, clicks and key presses" },
  { key: "crux_cls", label: "Real-user Cumulative Layout Shift (p75)", names: ["CUMULATIVE_LAYOUT_SHIFT_SCORE"], good: 0.1, poor: 0.25, scale: 100, format: (v) => v.toFixed(2), why: "how much the layout jumps while loading" },
  { key: "crux_fcp", label: "Real-user First Contentful Paint (p75)", names: ["FIRST_CONTENTFUL_PAINT_MS"], good: 1800, poor: 3000, scale: 1, format: ms, why: "how long before anything appears" },
  { key: "crux_ttfb", label: "Real-user Time to First Byte (p75)", names: ["EXPERIMENTAL_TIME_TO_FIRST_BYTE", "TIME_TO_FIRST_BYTE"], good: 800, poor: 1800, scale: 1, format: ms, why: "how long the server takes to start answering" },
];

export const CRUX_FIELD_KEYS = CRUX_METRICS.map((m) => m.key);

/** Real-user metric checks from a PSI response's loadingExperience / originLoadingExperience. Pure. */
export function evaluateCruxField(url: CruxExperience | undefined, origin: CruxExperience | undefined): PulseScanCheckInput[] {
  const out: PulseScanCheckInput[] = [];
  for (const spec of CRUX_METRICS) {
    const pick = (exp: CruxExperience | undefined) => {
      for (const name of spec.names) {
        const m = exp?.metrics?.[name];
        if (m && typeof m.percentile === "number" && Number.isFinite(m.percentile)) return m.percentile / spec.scale;
      }
      return null;
    };
    // PSI fills loadingExperience with origin data and sets origin_fallback when the URL has none.
    const urlValue = url?.origin_fallback ? null : pick(url);
    const originValue = pick(origin) ?? (url?.origin_fallback ? pick(url) : null);
    const value = urlValue ?? originValue;
    if (value === null) continue;
    const scope = urlValue !== null ? "this page" : "the whole site (this page has too few visits of its own)";
    const status = value <= spec.good ? "PASS" : value <= spec.poor ? "WARN" : "FAIL";
    const verdict = status === "PASS" ? "good" : status === "WARN" ? "needs improvement" : "poor";
    out.push({
      category: CATEGORIES.PERFORMANCE,
      checkKey: spec.key,
      label: spec.label,
      status,
      detail:
        `Real Chrome users on ${scope} saw ${spec.format(value)} at the 75th percentile over the last 28 days, which is ${verdict} ` +
        `(good ≤ ${spec.format(spec.good)}, poor > ${spec.format(spec.poor)}). This measures ${spec.why}.`,
      confidence: urlValue !== null ? "HIGH" : "MEDIUM",
      confidenceReason: urlValue !== null ? "Field data for this URL from the Chrome UX Report." : "Origin-level field data; this page may differ.",
      evidenceStrength: "VERIFIED",
      evidence: JSON.stringify({ p75: value, scope: urlValue !== null ? "url" : "origin" }),
    });
  }
  return out;
}
