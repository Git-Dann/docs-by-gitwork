import type { PulseCheckStatus } from "@/types/pulse";

/**
 * Why a stored check's verdict differs from what the detector returned.
 *
 * Lives here, not in `check-config.ts`, because that module imports Prisma and
 * this is read by the report UI — a client component. Pure, so both sides can
 * share one rule rather than each deciding for itself what a rewritten status
 * means.
 */
export type PolicyDisposition = "DETECTOR" | "DISABLED" | "REGRADED";

/**
 * Derived, never stored. A third column would be a denormalised copy of what the
 * `status` / `detectorStatus` pair already states, and the two could disagree —
 * which is the exact failure recording the detector's verdict exists to remove.
 */
export function policyDisposition(check: {
  status: PulseCheckStatus | string;
  detectorStatus?: PulseCheckStatus | string | null;
}): PolicyDisposition {
  if (!check.detectorStatus || check.detectorStatus === check.status) return "DETECTOR";
  // A disable is the only path that lands on NOT_TESTED; every other rewrite is a
  // re-grade between WARN and FAIL.
  return check.status === "NOT_TESTED" ? "DISABLED" : "REGRADED";
}
