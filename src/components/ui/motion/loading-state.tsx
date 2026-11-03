/**
 * "Loading …" with the spinner beside it (docs/motion.md). Use it where a section waits on
 * data and a skeleton would be guesswork about its shape. It is a polite live region, so a
 * screen reader hears it once.
 */

import { cn } from "@/lib/format";
import { Spinner } from "@/components/ui/motion/spinner";

export function LoadingState({
  label = "Loading…",
  variant = "inline",
  className,
}: {
  label?: string;
  /** `inline` sits in a row; `block` centres in a padded area, for a whole panel. */
  variant?: "inline" | "block";
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-center gap-2 text-[13px] text-[var(--text-3)]",
        variant === "block" && "justify-center py-10",
        className,
      )}
    >
      <Spinner size="sm" tone="muted" />
      <span>{label}</span>
    </div>
  );
}
