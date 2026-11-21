"use client";

/**
 * The small pieces an HQ-style tile is built from.
 *
 * Lifted out of `hq-today-band.tsx` when Care home needed the same bar and the same big figure.
 * They were module-private there, so the choice was one copy or two — and two copies of a
 * proportional bar is exactly how Care ended up with two of everything else (§42: two UIs, two
 * vocabularies, two Replied counts).
 */

import { CountUp } from "@/components/dashboard/count-up";

export const MONO = { fontFamily: "var(--font-mono)" } as const;

/** The one figure a tile is about: a DM Serif numeral that counts up, and what it counts. */
export function BigFigure({ value, unit }: { value: number | null; unit: string }) {
  return (
    <p className="mt-1 flex items-baseline gap-1.5">
      <span
        className="text-[32px] leading-none tabular-nums text-[var(--text-1)]"
        style={{ fontFamily: "var(--font-display)" }}
      >
        <CountUp value={value} />
      </span>
      <span className="text-xs text-[var(--text-3)]">{unit}</span>
    </p>
  );
}

/**
 * A proportional bar of a few parts, with a key under it.
 *
 * Proportion is what a second row of numerals cannot show: three figures side by side make you
 * do the division yourself. Colour comes from the caller so it stays semantic — a part is tinted
 * because of what it MEANS, never to tell two parts apart.
 */
export function SplitBar({ parts }: { parts: Array<{ label: string; n: number; colour: string }> }) {
  const total = parts.reduce((n, p) => n + p.n, 0);
  const key = parts.map((p) => `${p.n} ${p.label}`).join(" · ");
  return (
    <div className="mt-2">
      <div className="flex h-1.5 w-full gap-[2px] overflow-hidden rounded-[2px] bg-[var(--surface-2)]" aria-hidden>
        {total > 0
          ? parts.map((p) =>
              p.n > 0 ? (
                <span
                  key={p.label}
                  className="h-full transition-[width] duration-500"
                  style={{ width: `${(p.n / total) * 100}%`, background: p.colour }}
                />
              ) : null,
            )
          : null}
      </div>
      <p className="mt-1 truncate text-[10px] text-[var(--text-4)]" style={MONO} title={key}>
        {key}
      </p>
    </div>
  );
}
