/**
 * A status dot (docs/motion.md). `pulse` says "working on it" (a scan running, a study
 * generating); `ping` says "look at this" (a monitor alerting) and should stay rare, because
 * a page of pings is a page where nothing stands out.
 */

import { cn } from "@/lib/format";

export type StatusDotTone = "neutral" | "brand" | "success" | "warning" | "danger" | "info";

const TONE: Record<StatusDotTone, { dot: string; ring: string }> = {
  neutral: { dot: "bg-[var(--text-4)]", ring: "bg-[var(--text-4)]" },
  brand: { dot: "bg-[var(--brand-500)]", ring: "bg-[var(--brand-400)]" },
  success: { dot: "bg-emerald-500", ring: "bg-emerald-400" },
  warning: { dot: "bg-amber-500", ring: "bg-amber-400" },
  danger: { dot: "bg-red-500", ring: "bg-red-400" },
  info: { dot: "bg-blue-500", ring: "bg-blue-400" },
};

export function StatusDot({
  tone = "neutral",
  motion = "none",
  size = "sm",
  label,
  className,
}: {
  tone?: StatusDotTone;
  motion?: "none" | "pulse" | "ping";
  size?: "xs" | "sm";
  /** Shown as a tooltip and read out. Omit when the text beside the dot says it. */
  label?: string;
  className?: string;
}) {
  const box = size === "xs" ? "h-1.5 w-1.5" : "h-2 w-2";
  const t = TONE[tone];
  const a11y = label ? { role: "img" as const, "aria-label": label, title: label } : { "aria-hidden": true as const };
  if (motion === "ping") {
    return (
      <span {...a11y} className={cn("relative inline-flex shrink-0", box, className)}>
        <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-75", t.ring)} />
        <span className={cn("relative inline-flex rounded-full", box, t.dot)} />
      </span>
    );
  }
  return <span {...a11y} className={cn("inline-flex shrink-0 rounded-full", box, t.dot, motion === "pulse" && "animate-pulse", className)} />;
}
