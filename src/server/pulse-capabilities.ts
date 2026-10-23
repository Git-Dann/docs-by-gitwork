/**
 * The live numbers behind `src/lib/pulse-capabilities.ts`: how many checks Pulse runs and
 * how many in each area, counted from `CHECKS_REGISTRY` on every call. Server-only, so the
 * registry never reaches the browser (CLAUDE.md §44.1).
 */
import { CHECKS_REGISTRY } from "@/server/checks-registry";
import type { CheckCategory } from "@/server/pulse-checks/categories";
import { AREAS, type AreaGroupId } from "@/lib/pulse-capabilities";

export interface PulseAreaCount {
  category: CheckCategory;
  group: AreaGroupId;
  name: string;
  covers: string;
  checks: number;
  /** Every check's plain label, in registry order. The page lets you open an area to read them. */
  labels: string[];
}

export interface PulseCapabilityCounts {
  checks: number;
  areas: PulseAreaCount[];
}

export function pulseCapabilityCounts(): PulseCapabilityCounts {
  const byCategory = new Map<string, string[]>();
  for (const c of CHECKS_REGISTRY) byCategory.set(c.category, [...(byCategory.get(c.category) ?? []), c.label]);
  const areas = (Object.keys(AREAS) as CheckCategory[])
    .map((category) => {
      const labels = byCategory.get(category) ?? [];
      return { category, ...AREAS[category], checks: labels.length, labels };
    })
    // An area with no checks has nothing to describe.
    .filter((a) => a.checks > 0);
  return { checks: CHECKS_REGISTRY.length, areas };
}
