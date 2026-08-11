/**
 * Extended Pulse checks coordinator.
 * Imports each category module and runs them in parallel via Promise.all().
 * Called at the end of runUrlChecks() inside the if(pageResult) block.
 */

import type { PulseScanCheckInput } from "@/types/pulse";
import type { ExtendedCheckContext } from "./pulse-checks/_types";

import { runSecurityExtended } from "./pulse-checks/security-extended";
import { runLegalExtended } from "./pulse-checks/legal-extended";
import { runPerformanceExtended } from "./pulse-checks/performance-extended";
import { runWcagChecks } from "./pulse-checks/wcag";
import { runAuthExtended } from "./pulse-checks/auth-extended";
import { runRolesPermissionsChecks } from "./pulse-checks/roles-permissions";
import { runEmailDeliverabilityChecks } from "./pulse-checks/email-deliverability";
import { runObservabilityExtended } from "./pulse-checks/observability-extended";
import { runInfrastructureExtended } from "./pulse-checks/infrastructure-extended";
import { runSaasExtended } from "./pulse-checks/saas-extended";
import { runPaymentsExtended } from "./pulse-checks/payments-extended";
import { runSeoExtended } from "./pulse-checks/seo-extended";
import { runTrustBrandExtended } from "./pulse-checks/trust-brand-extended";
import { runMissingPagesExtended } from "./pulse-checks/missing-pages-extended";
import { runGlobalDistributionExtended } from "./pulse-checks/global-distribution-extended";
import { runCodeQualityExtended } from "./pulse-checks/code-quality-extended";
import { runMobileExtended } from "./pulse-checks/mobile-extended";
import { runBusinessOperationsChecks } from "./pulse-checks/business-operations";
import { runApiQualityChecks } from "./pulse-checks/api-quality";
import { runApiHealthChecks } from "./pulse-checks/api-health";
import { runApiBehaviourChecks } from "./pulse-checks/api-behaviour";
import { runAiReadinessChecks } from "./pulse-checks/ai-readiness";
import { runAiAeoChecks } from "./pulse-checks/ai-aeo";
import { runVibeCodeHygieneChecks } from "./pulse-checks/vibe-code-hygiene";
import { runUsPrivacyExtended } from "./pulse-checks/us-privacy-extended";
import { runVibeSecurityChecks } from "./pulse-checks/vibe-security";
import { runAiAppSafetyChecks } from "./pulse-checks/ai-app-safety";
import { collectorCompletenessCheck, collectorExecution } from "./pulse-checks/collector-health";

export type { ExtendedCheckContext };

/**
 * Runs all extended category modules in parallel.
 *
 * `onWave` (optional) is fired with each module's checks as soon as that module
 * resolves — this powers incremental persistence + live streaming in the scan
 * pipeline. The full flattened array is still returned for callers that just
 * want the end result.
 */
export async function runExtendedChecks(
  ctx: ExtendedCheckContext,
  onWave?: (checks: PulseScanCheckInput[]) => void,
): Promise<PulseScanCheckInput[]> {
  const runners: Array<[
    string,
    (context: ExtendedCheckContext) => PulseScanCheckInput[] | Promise<PulseScanCheckInput[]>,
  ]> = [
    ["security", runSecurityExtended],
    ["legal", runLegalExtended],
    ["performance", runPerformanceExtended],
    ["wcag", runWcagChecks],
    ["authentication", runAuthExtended],
    ["roles-permissions", runRolesPermissionsChecks],
    ["email-deliverability", runEmailDeliverabilityChecks],
    ["observability", runObservabilityExtended],
    ["infrastructure", runInfrastructureExtended],
    ["saas", runSaasExtended],
    ["payments", runPaymentsExtended],
    ["seo", runSeoExtended],
    ["trust-brand", runTrustBrandExtended],
    ["missing-pages", runMissingPagesExtended],
    ["global-distribution", runGlobalDistributionExtended],
    ["code-quality", runCodeQualityExtended],
    ["mobile", runMobileExtended],
    ["business-operations", runBusinessOperationsChecks],
    ["api-quality", runApiQualityChecks],
    ["api-health", runApiHealthChecks],
    ["api-behaviour", runApiBehaviourChecks],
    ["ai-readiness", runAiReadinessChecks],
    ["ai-aeo", runAiAeoChecks],
    ["vibe-hygiene", runVibeCodeHygieneChecks],
    ["us-privacy", runUsPrivacyExtended],
    ["vibe-security", runVibeSecurityChecks],
    ["ai-app-safety", runAiAppSafetyChecks],
  ];

  const results = await Promise.allSettled(
    runners.map(([, run]) =>
      Promise.resolve(run(ctx)).then((value) => {
        if (onWave && value.length) onWave(value);
        return value;
      }),
    ),
  );

  const checks = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  checks.push(collectorCompletenessCheck(
    results.map((result, index) => collectorExecution(runners[index][0], result)),
    "scan_extended_collector_completeness",
  ));
  return checks;
}
