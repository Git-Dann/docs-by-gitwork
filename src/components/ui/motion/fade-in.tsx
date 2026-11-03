"use client";

/**
 * Fade in and rise a few pixels on mount (docs/motion.md). Key it on what changes (a wizard
 * step, a tab) to replay it. The motion is a CSS transition, so reduced motion is handled by
 * the global rule in layout.tsx.
 */

import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/format";

export function FadeIn({ children, className, delayMs = 0 }: { children: ReactNode; className?: string; delayMs?: number }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    let frame = 0;
    const timer = window.setTimeout(() => {
      frame = requestAnimationFrame(() => setShown(true));
    }, delayMs);
    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(frame);
    };
  }, [delayMs]);
  return (
    <div className={cn("transition-all duration-300 ease-out", shown ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0", className)}>
      {children}
    </div>
  );
}
