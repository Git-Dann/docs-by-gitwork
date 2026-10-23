/**
 * The live numbers behind `src/lib/pulse-capabilities.ts`: how many checks Pulse runs and
 * how many in each area, counted from `CHECKS_REGISTRY` on every call. Server-only, so the
 * registry never reaches the browser (CLAUDE.md §44.1).
 */
import { CHECKS_REGISTRY } from "@/server/checks-registry";
import type { CheckCategory } from "@/server/pulse-checks/categories";
import { AREAS } from "@/lib/pulse-capabilities";

export interface PulseAreaCount {
  category: CheckCategory;
  name: string;
  covers: string;
  checks: number;
}

export interface PulseCapabilityCounts {
  checks: number;
  areas: PulseAreaCount[];
}

export function pulseCapabilityCounts(): PulseCapabilityCounts {
  const byCategory = new Map<string, number>();
  for (const c of CHECKS_REGISTRY) byCategory.set(c.category, (byCategory.get(c.category) ?? 0) + 1);
  const areas = (Object.keys(AREAS) as CheckCategory[])
    .map((category) => ({ category, ...AREAS[category], checks: byCategory.get(category) ?? 0 }))
    // An area with no checks has nothing to describe.
    .filter((a) => a.checks > 0);
  return { checks: CHECKS_REGISTRY.length, areas };
}
