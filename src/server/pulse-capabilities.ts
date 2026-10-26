/**
 * The live numbers behind `src/lib/pulse-capabilities.ts`: how many checks Pulse runs and
 * how many in each area, counted from `LIVE_CHECKS` (checks a report can show: no withheld or standards-catalogue rows) on every call. Server-only, so the
 * registry never reaches the browser (CLAUDE.md §44.1).
 */
import { LIVE_CHECKS } from "@/server/checks-registry";
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
  for (const c of LIVE_CHECKS) byCategory.set(c.category, [...(byCategory.get(c.category) ?? []), c.label]);
  const areas = (Object.keys(AREAS) as CheckCategory[])
    .map((category) => {
      const labels = byCategory.get(category) ?? [];
      return { category, ...AREAS[category], checks: labels.length, labels };
    })
    // An area with no checks has nothing to describe.
    .filter((a) => a.checks > 0);
  return { checks: LIVE_CHECKS.length, areas };
}
