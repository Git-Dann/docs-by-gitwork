/**
 * The one loading spinner (docs/motion.md): a ring with one edge missing. `<Button loading>`
 * draws this too, so every spinner in Foundry turns at the same speed and weight.
 *
 * Decorative unless you give it a `label`, in which case it announces itself as a status.
 * Reduced motion is handled globally (layout.tsx stops every CSS animation), so a still ring
 * shows instead.
 */

import { cn } from "@/lib/format";

export type SpinnerSize = "xs" | "sm" | "md" | "lg";
export type SpinnerTone = "current" | "brand" | "muted" | "inverse";

const SIZE: Record<SpinnerSize, string> = {
  xs: "h-2.5 w-2.5 border-[1.5px]",
  sm: "h-3.5 w-3.5 border-2",
  md: "h-4 w-4 border-2",
  lg: "h-5 w-5 border-2",
};

const TONE: Record<SpinnerTone, string> = {
  current: "border-current",
  brand: "border-[var(--brand-700)]",
  muted: "border-[var(--text-4)]",
  inverse: "border-white",
};

export function Spinner({
  size = "sm",
  tone = "current",
  label,
  className,
}: {
  size?: SpinnerSize;
  tone?: SpinnerTone;
  /** Announce it ("Saving"). Omit when the words beside it already say what is happening. */
  label?: string;
  className?: string;
}) {
  return (
    <span
      role={label ? "status" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("inline-block shrink-0 animate-spin rounded-full border-r-transparent", SIZE[size], TONE[tone], className)}
    />
  );
}
