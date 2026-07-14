"use client";

/**
 * Editorial ornaments for the Monday Brief — the "craft" layer.
 *
 * Borrows the blueprint/drafting language (à la oryzo.ai / Lusion) but on Foundry's
 * terms: Gitwork-Blue corner ticks, a compact Foundry mark, and a hand-lettered-feel
 * "GITWORK" seal with a staggered wave on hover (Dia's BCNY circles, reimagined).
 * All theme-token based, so it reads on cream and navy.
 */

import { cn } from "@/lib/format";

/** Four L-shaped drafting ticks pinned to a card's corners (needs a `relative` parent). */
export function CornerTicks({ className }: { className?: string }) {
  const base = "pointer-events-none absolute h-2.5 w-2.5 border-[var(--brand-500)] opacity-50";
  return (
    <span aria-hidden className={className}>
      <span className={cn(base, "left-2 top-2 border-l border-t")} />
      <span className={cn(base, "right-2 top-2 border-r border-t")} />
      <span className={cn(base, "bottom-2 left-2 border-b border-l")} />
      <span className={cn(base, "bottom-2 right-2 border-b border-r")} />
    </span>
  );
}

/** Compact Foundry mark — a blue instrument tile. */
export function FoundryMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className ?? "h-[18px] w-[18px]"} aria-hidden focusable="false">
      <rect x="2.5" y="2.5" width="19" height="19" rx="5" fill="var(--brand-600)" />
      <path d="M8 7.75h8M8 12h6M8 16.25h4" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/** "GITWORK" as circle-letter badges that wave on hover (reduced-motion safe). */
export function GitworkSeal() {
  const letters = "GITWORK".split("");
  return (
    <span className="gw-seal inline-flex items-center gap-1">
      <style>{`
        @keyframes gwWave {
          0% { transform: translateY(0); }
          38% { transform: translateY(-6px); }
          58% { transform: translateY(1px); }
          78% { transform: translateY(-2px); }
          100% { transform: translateY(0); }
        }
        .gw-seal:hover .gw-c {
          animation-name: gwWave;
          animation-duration: 0.8s;
          animation-timing-function: cubic-bezier(0.34, 1.45, 0.56, 1);
          animation-fill-mode: backwards;
        }
        @media (prefers-reduced-motion: reduce) {
          .gw-seal:hover .gw-c { animation: none; }
        }
      `}</style>
      {letters.map((l, i) => (
        <span
          key={i}
          className="gw-c inline-flex h-[19px] w-[19px] items-center justify-center rounded-full border border-[var(--text-4)] text-[10px] text-[var(--text-3)]"
          style={{ fontFamily: "var(--font-mono)", animationDelay: `${i * 0.06}s` }}
        >
          {l}
        </span>
      ))}
    </span>
  );
}
