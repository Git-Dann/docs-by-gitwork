/**
 * Skeletons (docs/motion.md): grey shapes that hold a section's place while it loads, so the
 * page doesn't jump when the data lands. Pick the preset closest to what will replace it;
 * reach for the bare `Skeleton` only for a shape none of them fit.
 *
 * Every piece is `aria-hidden`. Pair a skeleton with a status line (or a `LoadingState`) when a
 * screen reader needs telling that something is on its way.
 */

import { cn } from "@/lib/format";

/**
 * The base shape. Give it a size; it brings the pulse, the radius and the surface. A radius in
 * `className` replaces the default rather than fighting it (`cn` doesn't merge Tailwind classes,
 * and in the compiled CSS `rounded-[6px]` would beat a plain `rounded`).
 */
export function Skeleton({ className }: { className?: string }) {
  const ownRadius = /(^|\s)rounded(-|\s|$)/.test(className ?? "");
  return <div aria-hidden className={cn("animate-pulse bg-[var(--surface-1)]", !ownRadius && "rounded-[6px]", className)} />;
}

/** Fills a dashboard widget's body. */
export function SkeletonWidget({ className }: { className?: string }) {
  return <Skeleton className={cn("h-full", className)} />;
}

/** A page-sized block, for a whole view that hasn't arrived. */
export function SkeletonBlock({ className }: { className?: string }) {
  return <Skeleton className={cn("h-64 rounded-[10px]", className)} />;
}

/** A grid of card placeholders. Pass the grid classes the real cards use. */
export function SkeletonCards({ count = 6, className, cardClassName }: { count?: number; className?: string; cardClassName?: string }) {
  return (
    <div aria-hidden className={cn("grid gap-3 sm:grid-cols-2 lg:grid-cols-3", className)}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={cn("rounded-[10px] border border-[var(--border-2)] p-4", cardClassName)}>
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="mt-3 h-3 w-full" />
          <Skeleton className="mt-2 h-3 w-4/5" />
        </div>
      ))}
    </div>
  );
}

/** List rows: an optional avatar, a title line and a shorter line under it. */
export function SkeletonRows({ count = 3, avatar = false, className }: { count?: number; avatar?: boolean; className?: string }) {
  return (
    <div aria-hidden className={cn("space-y-3", className)}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          {avatar ? <Skeleton className="h-8 w-8 shrink-0 rounded-full" /> : null}
          <div className="min-w-0 flex-1">
            <Skeleton className="h-3.5 w-1/2" />
            <Skeleton className="mt-2 h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}
