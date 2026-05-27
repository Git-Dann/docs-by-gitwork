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

export type { ExtendedCheckContext };

export async function runExtendedChecks(ctx: ExtendedCheckContext): Promise<PulseScanCheckInput[]> {
  const results = await Promise.allSettled([
    runSecurityExtended(ctx),
    runLegalExtended(ctx),
    runPerformanceExtended(ctx),
    runWcagChecks(ctx),
    runAuthExtended(ctx),
    runRolesPermissionsChecks(ctx),
    runEmailDeliverabilityChecks(ctx),
    runObservabilityExtended(ctx),
    runInfrastructureExtended(ctx),
    runSaasExtended(ctx),
    runPaymentsExtended(ctx),
    runSeoExtended(ctx),
    runTrustBrandExtended(ctx),
    runMissingPagesExtended(ctx),
    runGlobalDistributionExtended(ctx),
    runCodeQualityExtended(ctx),
    runMobileExtended(ctx),
    runBusinessOperationsChecks(ctx),
    runApiQualityChecks(ctx),
  ]);

  return results.flatMap((r) => r.status === "fulfilled" ? r.value : []);
}
