"use client";

/**
 * A figure that counts up to itself, for numbers already formatted as text ("85%", "£1,240",
 * "12 days", "3.5"). The number inside is animated with `useCountUp`; whatever is around it is
 * kept exactly, and a value with no number in it ("—", "Live") is shown as it is.
 *
 * The finished text is always exactly `value`: the animation only ever runs towards it, and
 * reduced motion shows it at once (useCountUp).
 */
import { useCountUp } from "./use-count-up";

export interface ParsedFigure {
  prefix: string;
  number: number;
  decimals: number;
  grouped: boolean;
  suffix: string;
}

/** Split "£1,240.50k" into prefix "£", 1240.5 (2 decimals, grouped) and suffix "k". */
export function parseFigure(value: string): ParsedFigure | null {
  const m = /^(\D*?)(-?\d{1,3}(?:,\d{3})+|-?\d+)(?:\.(\d+))?([\s\S]*)$/.exec(value);
  if (!m) return null;
  const [, prefix, whole, frac = "", suffix] = m;
  const number = Number(`${whole.replace(/,/g, "")}${frac ? `.${frac}` : ""}`);
  if (!Number.isFinite(number)) return null;
  return { prefix, number, decimals: frac.length, grouped: whole.includes(","), suffix };
}

/** Write a number back in the same shape it was read in. */
export function formatFigure(f: ParsedFigure, n: number): string {
  const body = f.grouped
    ? n.toLocaleString("en-GB", { minimumFractionDigits: f.decimals, maximumFractionDigits: f.decimals })
    : n.toFixed(f.decimals);
  return `${f.prefix}${body}${f.suffix}`;
}

export function CountUpText({ value, duration }: { value: string; duration?: number }) {
  const parsed = parseFigure(value);
  // Count in hundredths so a decimal figure animates smoothly; useCountUp rounds to integers.
  const scale = parsed ? Math.pow(10, Math.min(parsed.decimals, 2)) : 1;
  const shown = useCountUp(parsed ? Math.round(parsed.number * scale) : null, { duration });
  if (!parsed) return <>{value}</>;
  return <span className="tabular-nums">{formatFigure(parsed, shown / scale)}</span>;
}
