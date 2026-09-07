/**
 * Extended Pulse checks coordinator.
 * Imports each category module and runs them in parallel via Promise.all().
 * Called at the end of runUrlChecks() inside the if(pageResult) block.
 */

import type { PulseScanCheckInput } from "@/types/pulse";
import type { ExtendedCheckContext } from "./pulse-checks/_types";
import { CATEGORIES, type CheckCategory } from "./pulse-checks/categories";
import { getInapplicableCategories } from "./pulse-checks/platform-applicability";

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
    CheckCategory,
    (context: ExtendedCheckContext) => PulseScanCheckInput[] | Promise<PulseScanCheckInput[]>,
  ]> = [
    ["security", CATEGORIES.SECURITY, runSecurityExtended],
    ["legal", CATEGORIES.LEGAL, runLegalExtended],
    ["performance", CATEGORIES.PERFORMANCE, runPerformanceExtended],
    ["wcag", CATEGORIES.ACCESSIBILITY, runWcagChecks],
    ["authentication", CATEGORIES.AUTHENTICATION, runAuthExtended],
    ["roles-permissions", CATEGORIES.ROLES, runRolesPermissionsChecks],
    ["email-deliverability", CATEGORIES.EMAIL, runEmailDeliverabilityChecks],
    ["observability", CATEGORIES.OBSERVABILITY, runObservabilityExtended],
    ["infrastructure", CATEGORIES.INFRASTRUCTURE, runInfrastructureExtended],
    ["saas", CATEGORIES.SAAS, runSaasExtended],
    ["payments", CATEGORIES.PAYMENTS, runPaymentsExtended],
    ["seo", CATEGORIES.SEO, runSeoExtended],
    ["trust-brand", CATEGORIES.TRUST_BRAND, runTrustBrandExtended],
    ["missing-pages", CATEGORIES.MISSING_PAGES, runMissingPagesExtended],
    ["global-distribution", CATEGORIES.GLOBAL_DISTRIBUTION, runGlobalDistributionExtended],
    ["code-quality", CATEGORIES.CODE_QUALITY, runCodeQualityExtended],
    ["mobile", CATEGORIES.MOBILE, runMobileExtended],
    ["business-operations", CATEGORIES.BUSINESS_OPS, runBusinessOperationsChecks],
    ["api-quality", CATEGORIES.API_QUALITY, runApiQualityChecks],
    ["api-health", CATEGORIES.API_QUALITY, runApiHealthChecks],
    ["api-behaviour", CATEGORIES.API_QUALITY, runApiBehaviourChecks],
    ["ai-readiness", CATEGORIES.AI_READINESS, runAiReadinessChecks],
    ["ai-aeo", CATEGORIES.AEO, runAiAeoChecks],
    ["vibe-hygiene", CATEGORIES.VIBE_HYGIENE, runVibeCodeHygieneChecks],
    ["us-privacy", CATEGORIES.LEGAL, runUsPrivacyExtended],
    ["vibe-security", CATEGORIES.SECURITY, runVibeSecurityChecks],
    ["ai-app-safety", CATEGORIES.AI_SAFETY, runAiAppSafetyChecks],
  ];

  const excludedCategories = new Set(getInapplicableCategories(ctx.platform, ctx.surfaceKind));
  const relevantRunners = runners.filter(([, category]) => !excludedCategories.has(category));

  const results = await Promise.allSettled(
    relevantRunners.map(([, , run]) =>
      Promise.resolve(run(ctx)).then((value) => {
        if (onWave && value.length) onWave(value);
        return value;
      }),
    ),
  );

  const checks = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  checks.push(collectorCompletenessCheck(
    results.map((result, index) => collectorExecution(relevantRunners[index][0], result)),
    "scan_extended_collector_completeness",
  ));
  return checks;
}
