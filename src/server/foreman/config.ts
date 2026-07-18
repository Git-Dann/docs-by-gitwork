import { FOREMAN_DEFAULTS, type ForemanConfig } from "./types";

function numOr(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

/**
 * Merge a workspace's stored `foremanConfig` JSON over the code defaults. Tolerant of missing /
 * malformed values — any bad field falls back to its default (mirrors resolveCuratorConfig).
 */
export function resolveForemanConfig(raw: unknown): ForemanConfig {
  const c = raw && typeof raw === "object" ? (raw as Partial<ForemanConfig>) : {};
  return {
    enabled: typeof c.enabled === "boolean" ? c.enabled : FOREMAN_DEFAULTS.enabled,
    dueSoonDays: numOr(c.dueSoonDays, FOREMAN_DEFAULTS.dueSoonDays, 1, 30),
    criticalOverdue: numOr(c.criticalOverdue, FOREMAN_DEFAULTS.criticalOverdue, 1, 100),
    staleDoingDays: numOr(c.staleDoingDays, FOREMAN_DEFAULTS.staleDoingDays, 1, 90),
    consolidate: typeof c.consolidate === "boolean" ? c.consolidate : FOREMAN_DEFAULTS.consolidate,
  };
}
