import { cn } from "@/lib/format";

/**
 * The settings tab bar: a segmented control (DESIGN.md's pick-one grammar) that
 * hugs its tabs and wraps rather than scrolls on a phone. Declared once so the
 * consolidated settings pages and People & access cannot drift apart.
 */
export const segmentedTabsClass =
  "inline-flex max-w-full flex-wrap gap-1 rounded-[8px] border border-[var(--border-1)] bg-[var(--surface-1)] p-1";

export const segmentedTabClass = (active: boolean) =>
  cn(
    "rounded-[6px] px-3 py-1.5 text-[13px] font-medium transition",
    active
      ? "bg-[var(--surface-0)] text-[var(--brand-700)] shadow-[var(--shadow-xs)]"
      : "text-[var(--text-3)] hover:text-[var(--text-1)]",
  );
