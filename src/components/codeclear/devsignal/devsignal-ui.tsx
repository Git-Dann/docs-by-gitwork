"use client";

import { cn } from "@/lib/format";

/**
 * Foundry-native flourishes for the DevSignal admin — used INSIDE the widget-card
 * grammar (never replacing it). A colour-coded meter (DESIGN widget-progress-bar),
 * an editorial score ring (DM Serif figure), and the best-match tone map. Keeps
 * the brand signature (NN // headers, serif stats, mono labels) intact while
 * giving the review surface real hierarchy + colour.
 */

export type Tone = "success" | "brand" | "warning" | "danger" | "steel";

export const TONE_FILL: Record<Tone, string> = {
  success: "bg-emerald-500",
  brand: "bg-[var(--brand-600)]",
  warning: "bg-amber-500",
  danger: "bg-rose-500",
  steel: "bg-[var(--text-4)]",
};

export const TONE_TEXT: Record<Tone, string> = {
  success: "text-emerald-600",
  brand: "text-[var(--brand-700)]",
  warning: "text-amber-600",
  danger: "text-rose-600",
  steel: "text-[var(--text-4)]",
};

export const TONE_STROKE: Record<Tone, string> = {
  success: "#10b981",
  brand: "var(--brand-600)",
  warning: "#f59e0b",
  danger: "#f43f5e",
  steel: "#94a3b8",
};

/** Score 0–100 → tone. */
export function scoreTone(score: number): Tone {
  if (score >= 80) return "success";
  if (score >= 65) return "brand";
  if (score >= 45) return "warning";
  return "danger";
}

/** Best-match label → tone (keyword match, resilient to copy tweaks). */
export function matchTone(label: string | undefined | null): Tone {
  const l = (label ?? "").toLowerCase();
  if (l.includes("best")) return "success";
  if (l.includes("strong")) return "brand";
  if (l.includes("qualified")) return "brand";
  if (l.includes("review")) return "warning";
  if (l.includes("not recommended") || l.includes("decline")) return "danger";
  return "steel";
}

/** Thin colour-coded progress meter (DESIGN widget-progress-bar). */
export function Meter({ value, tone = "brand", className }: { value: number; tone?: Tone; className?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-[var(--border-2)]", className)}>
      <div className={cn("h-full rounded-full transition-[width] duration-500", TONE_FILL[tone])} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Editorial score ring — SVG arc + DM Serif figure in the centre. */
export function ScoreRing({ score, size = 88 }: { score: number; size?: number }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const tone = scoreTone(score);
  const offset = c - (Math.max(0, Math.min(100, score)) / 100) * c;
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" width={size} height={size} className="-rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--border-2)" strokeWidth="8" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke={TONE_STROKE[tone]}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      <div className="absolute text-center leading-none">
        <p className="font-serif text-2xl text-[var(--text-1)]">{score}</p>
        <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--text-4)]">/100</p>
      </div>
    </div>
  );
}
