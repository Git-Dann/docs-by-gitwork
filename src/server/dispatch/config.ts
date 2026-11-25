import { DISPATCH_DEFAULTS, type DispatchConfig } from "./types";

function numOr(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

/**
 * Merge a workspace's stored `dispatchConfig` JSON over the code defaults. Tolerant of missing /
 * malformed values — any bad field falls back to its default (mirrors resolveForemanConfig).
 *
 * A stored `allowExternalChannels` (the retired Slack Connect switch) is ignored: Dispatch never
 * answers in a channel the client is in.
 */
export function resolveDispatchConfig(raw: unknown): DispatchConfig {
  const c = raw && typeof raw === "object" ? (raw as Partial<DispatchConfig>) : {};
  return {
    enabled: typeof c.enabled === "boolean" ? c.enabled : DISPATCH_DEFAULTS.enabled,
    recentDays: numOr(c.recentDays, DISPATCH_DEFAULTS.recentDays, 1, 90),
    maxEvidenceItems: numOr(c.maxEvidenceItems, DISPATCH_DEFAULTS.maxEvidenceItems, 3, 40),
    perChannelPerHour: numOr(c.perChannelPerHour, DISPATCH_DEFAULTS.perChannelPerHour, 1, 200),
    assistantEnabled: c.assistantEnabled === true,
    budgetUsd:
      typeof c.budgetUsd === "number" && Number.isFinite(c.budgetUsd)
        ? Math.min(100_000, Math.max(1, c.budgetUsd))
        : DISPATCH_DEFAULTS.budgetUsd,
    budgetSince: typeof c.budgetSince === "string" && /^\d{4}-\d{2}-\d{2}$/.test(c.budgetSince) ? c.budgetSince : null,
  };
}
