"use client";

/**
 * Count a number up to its value (docs/motion.md), for a score or a total that has just
 * arrived. Reduced motion shows the final value at once.
 */

import { useEffect, useRef, useState } from "react";

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/** Ease-out cubic: quick at first, settling into the value. */
export function easeOutCubic(t: number): number {
  const c = Math.min(Math.max(t, 0), 1);
  return 1 - Math.pow(1 - c, 3);
}

/**
 * The value to show at time `elapsed` of a `duration`-ms count from `from` to `to`. Pure, so
 * the curve is testable without a clock. Integers in, integers out.
 */
export function countUpValue(from: number, to: number, elapsed: number, duration: number): number {
  if (duration <= 0 || elapsed >= duration) return to;
  return Math.round(from + (to - from) * easeOutCubic(elapsed / duration));
}

/**
 * Counts from the previous target to the new one. The first value counts up from 0;
 * `null` holds at 0 until there is something to show.
 */
export function useCountUp(target: number | null, { duration = 900 }: { duration?: number } = {}): number {
  const [value, setValue] = useState(0);
  const from = useRef(0);

  useEffect(() => {
    if (target == null) return;
    if (prefersReducedMotion()) {
      from.current = target;
      setValue(target);
      return;
    }
    const start = performance.now();
    const origin = from.current;
    let frame = 0;
    const tick = (now: number) => {
      const next = countUpValue(origin, target, now - start, duration);
      setValue(next);
      if (next !== target) frame = requestAnimationFrame(tick);
      else from.current = target;
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      // Interrupted: carry on from wherever it got to.
      from.current = target;
    };
  }, [target, duration]);

  return target == null ? 0 : value;
}
