import { CATEGORIES } from "./categories";
import type { PulseScanCheckInput } from "@/types/pulse";

export interface CollectorExecution {
  name: string;
  outcome: "COMPLETED" | "ERROR" | "NOT_APPLICABLE";
  /** Technical cause, for an ERROR. */
  detail?: string;
  /**
   * Why a NOT_APPLICABLE collector did not run, in words a customer can act on.
   *
   * "Not applicable" and "you have not given us what it needs" are different
   * facts, and only one of them is something they can change.
   */
  reason?: string;
}

/**
 * The collectors that only ever run against source, and the reason a URL-only
 * scan cannot run them.
 *
 * A URL scan used to record NOTHING for these — they were not pushed as skipped,
 * they simply never appeared — so the coverage check counted "6 of 6 collectors
 * completed" while the entire source half of Pulse had not run. Absent read as
 * complete, which is the failure this control exists to prevent, in the one place
 * it was least visible.
 */
export const SOURCE_ONLY_COLLECTORS = ["repo-shape", "github-checks", "code-agent"] as const;

export function sourceCollectorsUnavailable(reason: string): CollectorExecution[] {
  return SOURCE_ONLY_COLLECTORS.map((name) => ({ name, outcome: "NOT_APPLICABLE" as const, reason }));
}

export interface CollectorCoverage {
  completed: number;
  failed: number;
  notApplicable: number;
  /** Named, so "what did you not check" has an answer rather than a count. */
  failedNames: string[];
  unavailable: { name: string; reason: string }[];
}

/** Scan-level coverage, so this stops living only inside one check row's evidence blob. */
export function collectorCoverage(executions: CollectorExecution[]): CollectorCoverage {
  const failed = executions.filter((execution) => execution.outcome === "ERROR");
  const skipped = executions.filter((execution) => execution.outcome === "NOT_APPLICABLE");
  return {
    completed: executions.filter((execution) => execution.outcome === "COMPLETED").length,
    failed: failed.length,
    notApplicable: skipped.length,
    failedNames: failed.map((execution) => execution.name),
    unavailable: skipped
      .filter((execution) => execution.reason)
      .map((execution) => ({ name: execution.name, reason: execution.reason! })),
  };
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
