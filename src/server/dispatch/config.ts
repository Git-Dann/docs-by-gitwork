import { DISPATCH_DEFAULTS, type DispatchConfig } from "./types";

function numOr(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

/**
 * Merge a workspace's stored `dispatchConfig` JSON over the code defaults. Tolerant of missing /
 * malformed values — any bad field falls back to its default (mirrors resolveForemanConfig).
 *
 * `allowExternalChannels` only ever becomes true on an explicit boolean `true`: a truthy string
 * or a stray `1` left in the JSON must not be what opens internal delivery state to a client-
 * facing Slack Connect channel.
 */
export function resolveDispatchConfig(raw: unknown): DispatchConfig {
  const c = raw && typeof raw === "object" ? (raw as Partial<DispatchConfig>) : {};
  return {
    enabled: typeof c.enabled === "boolean" ? c.enabled : DISPATCH_DEFAULTS.enabled,
    recentDays: numOr(c.recentDays, DISPATCH_DEFAULTS.recentDays, 1, 90),
    maxEvidenceItems: numOr(c.maxEvidenceItems, DISPATCH_DEFAULTS.maxEvidenceItems, 3, 40),
    perChannelPerHour: numOr(c.perChannelPerHour, DISPATCH_DEFAULTS.perChannelPerHour, 1, 200),
    allowExternalChannels: c.allowExternalChannels === true,
  };
}
