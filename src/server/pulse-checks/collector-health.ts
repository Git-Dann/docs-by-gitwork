import { CATEGORIES } from "./categories";
import type { PulseScanCheckInput } from "@/types/pulse";

export interface CollectorExecution {
  name: string;
  outcome: "COMPLETED" | "ERROR" | "NOT_APPLICABLE";
  detail?: string;
}

function safeDetail(error: unknown): string {
  if (!(error instanceof Error)) return "collector failed";
  return error.name === "Error" ? error.message.slice(0, 160) : `${error.name}: ${error.message}`.slice(0, 160);
}

export function collectorExecution(name: string, result: PromiseSettledResult<unknown>): CollectorExecution {
  return result.status === "fulfilled"
    ? { name, outcome: "COMPLETED" }
    : { name, outcome: "ERROR", detail: safeDetail(result.reason) };
}

/** A collector that reports its own failure rather than throwing it. */
export interface SelfReportingCollector {
  collectorError?: string;
}

/**
 * A settled promise is not proof a collector worked.
 *
 * The scan's agents catch their own network failures and resolve with an empty
 * result, so `status === "fulfilled"` was true for a PageSpeed run that timed out,
 * a quota rejection, and a HEAD probe that never connected. Recording those as
 * COMPLETED made the completeness check assert that a failed collector had
 * succeeded — the one thing it exists to prevent. A collector that sets
 * `collectorError` is an ERROR however cleanly its promise resolved.
 */
export function collectorOutcome(
  name: string,
  result: PromiseSettledResult<SelfReportingCollector>,
): CollectorExecution {
  if (result.status !== "fulfilled") {
    return { name, outcome: "ERROR", detail: safeDetail(result.reason) };
  }
  const reported = result.value?.collectorError;
  return reported
    ? { name, outcome: "ERROR", detail: reported.slice(0, 160) }
    : { name, outcome: "COMPLETED" };
}

/** A diagnostic control: it changes completeness, never the product health score. */
export function collectorCompletenessCheck(
  executions: CollectorExecution[],
  checkKey = "scan_collector_completeness",
): PulseScanCheckInput {
  const failed = executions.filter((execution) => execution.outcome === "ERROR");
  const completed = executions.filter((execution) => execution.outcome === "COMPLETED").length;
  const notApplicable = executions.filter((execution) => execution.outcome === "NOT_APPLICABLE").length;
  return {
    category: CATEGORIES.INFRASTRUCTURE,
    checkKey,
    label: "Collector coverage and failure isolation",
    status: failed.length > 0 ? "ERROR" : "PASS",
    detail: failed.length > 0
      ? `${failed.length} of ${executions.length} collectors failed: ${failed.map((item) => `${item.name}${item.detail ? ` (${item.detail})` : ""}`).join(", ")}. Results from those families are unknown, not passing.`
      : `${completed} collectors completed${notApplicable ? `; ${notApplicable} were not applicable` : ""}.`,
    evidence: JSON.stringify({ completed, failed: failed.map((item) => item.name), notApplicable }),
    scoreEligible: false,
    completenessEligible: true,
    severity: "HIGH",
    evidenceStrength: "VERIFIED",
    confidence: "HIGH",
    confidenceReason: "Derived from recorded collector execution outcomes.",
  };
}
