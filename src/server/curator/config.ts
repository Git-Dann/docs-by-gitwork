import { CURATOR_DEFAULTS, type CuratorConfig } from "./types";

function numOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

/**
 * Merge a workspace's stored `curatorConfig` JSON over the code defaults. Tolerant of missing /
 * malformed values — any bad field falls back to its default.
 */
export function resolveCuratorConfig(raw: unknown): CuratorConfig {
  const c = raw && typeof raw === "object" ? (raw as Partial<CuratorConfig>) : {};
  return {
    enabled: typeof c.enabled === "boolean" ? c.enabled : CURATOR_DEFAULTS.enabled,
    staleAfterDays: numOr(c.staleAfterDays, CURATOR_DEFAULTS.staleAfterDays),
    archiveAfterDays: numOr(c.archiveAfterDays, CURATOR_DEFAULTS.archiveAfterDays),
    consolidate: typeof c.consolidate === "boolean" ? c.consolidate : CURATOR_DEFAULTS.consolidate,
    intervalDays: numOr(c.intervalDays, CURATOR_DEFAULTS.intervalDays),
  };
}
