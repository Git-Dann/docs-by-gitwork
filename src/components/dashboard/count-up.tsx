"use client";

import { useCountUp } from "@/components/ui/motion/use-count-up";

/** A whole number that counts up when it arrives (docs/motion.md). Reduced motion shows it at once. */
export function CountUp({ value }: { value: number | null | undefined }) {
  const shown = useCountUp(value ?? null);
  return <>{value == null ? "—" : shown}</>;
}
