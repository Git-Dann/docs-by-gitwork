// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ DEAD CODE — runOrchestratedScan has NO CALLERS.
//
// The live scan path is src/server/pulse-lite/run-lite-scan.ts, which pulse.ts's
// runAnalysis calls directly. This file is kept because it is the older, simpler
// expression of the same flow and is useful to read — but a change made HERE does
// not affect a single scan.
//
// This is not hypothetical: in July 2026 the mobile-repo web-suite guard was
// written here, reviewed, CI'd and merged to production as a fix for a real 0/100
// scan. It never executed. Grep for callers before editing, and put the change in
// run-lite-scan.ts. src/server/pulse-lite/__tests__/live-path-guards.test.ts
// enforces that this banner stays until something actually calls it.
// ─────────────────────────────────────────────────────────────────────────────

import { runUrlChecks, runGithubChecks, skipAllChecks } from "@/server/pulse-scan";
import { runCodeAgent } from "./code-agent";
import { runDeployAgent } from "./deploy-agent";
import { getDisabledCheckKeys, getCheckOverrides } from "@/server/check-config";
import { CATEGORIES } from "@/server/pulse-checks/categories";
import type { PulseScanCheckInput, PulseScanInputType, CodeAgentInsights, DeployAgentInsights } from "@/types/pulse";

export interface OrchestratorResult {
  checks: PulseScanCheckInput[];
  techStack: string[];
  codeInsights: CodeAgentInsights | null;
  deployInsights: DeployAgentInsights | null;
  homepageUrl: string | null;
}

export async function runOrchestratedScan(input: {
  inputType: PulseScanInputType;
  inputUrl?: string;
  inputGithubRepo?: string;
  inputDescription?: string;
  platform?: string;
}): Promise<OrchestratorResult> {
  if (input.inputType === "FREE_TEXT") {
    return {
      checks: skipAllChecks("FREE_TEXT"),
      techStack: [],
      codeInsights: null,
      deployInsights: null,
      homepageUrl: null,
    };
  }

  if (input.inputType === "URL" && input.inputUrl) {
    // Run infra + deploy agents in parallel (fast — 8-10s)
    // Browser agent (PageSpeed) runs separately in Phase 2 alongside AI synthesis
    const [infraResult, deployResult] = await Promise.all([
      runUrlChecks(input.inputUrl, input.platform),
      runDeployAgent(input.inputUrl),
    ]);

    const allChecks = await applyCheckConfigs(deduplicateChecks([
      ...infraResult.checks,
      ...deployResult.checks,
    ]));

    return {
      checks: allChecks,
      techStack: infraResult.techStack,
      codeInsights: null,
      deployInsights: deployResult.insights,
      homepageUrl: null,
    };
  }

  if (input.inputType === "GITHUB_REPO" && input.inputGithubRepo) {
    const [infraResult, codeResult] = await Promise.all([
      runGithubChecks(input.inputGithubRepo),
      runCodeAgent(input.inputGithubRepo),
    ]);

    let deployInsights: DeployAgentInsights | null = null;
    let urlChecks: PulseScanCheckInput[] = [];
    let urlTechStack: string[] = [];
    const homepageUrl = codeResult.insights.homepageUrl ?? null;

    // A MOBILE repo is not graded on its GitHub "Website" link.
    //
    // homepageUrl was always null until July 2026, because runCodeAgent bailed on any
    // GraphQL failure — so this branch never ran. The moment that was fixed, a native
    // iOS repo whose Website field points at a marketing page (or anything that does
    // not answer) had the full ~400-check web suite run against it and failed nearly
    // all of them: a real client app scored 0/100 off 439 checks. The repo's own
    // source is the subject of the scan; the link is not.
    const isMobileRepo = infraResult.nativePlatform !== null;

    if (homepageUrl && isMobileRepo) {
      urlChecks = [
        {
          category: CATEGORIES.CODE_QUALITY,
          checkKey: "mobile_repo_web_suite_skipped",
          label: "Web checks skipped (mobile repo)",
          status: "SKIPPED",
          detail:
            `Detected a ${infraResult.nativePlatform} project, so the website suite was not run against ` +
            `the repository's linked homepage (${homepageUrl}). A mobile app is graded on its source and ` +
            `store readiness, not on the marketing page it links to. Scan that URL separately if you want it graded.`,
        },
      ];
    } else if (homepageUrl) {
      const [urlResult, deployResult] = await Promise.all([
        runUrlChecks(homepageUrl, input.platform, undefined, undefined, { githubTechStack: infraResult.techStack }),
        runDeployAgent(homepageUrl),
      ]);
      urlChecks = urlResult.checks;
      urlTechStack = urlResult.techStack;
      deployInsights = deployResult.insights;
    }

    const allChecks = await applyCheckConfigs(deduplicateChecks([
      ...infraResult.checks,
      ...codeResult.checks,
      ...urlChecks,
    ]));

    return {
      checks: allChecks,
      techStack: urlTechStack.length > 0 ? urlTechStack : infraResult.techStack,
      codeInsights: codeResult.insights,
      deployInsights,
      homepageUrl,
    };
  }

  return {
    checks: skipAllChecks(input.inputType),
    techStack: [],
    codeInsights: null,
    deployInsights: null,
    homepageUrl: null,
  };
}

function deduplicateChecks(checks: PulseScanCheckInput[]): PulseScanCheckInput[] {
  const seen = new Map<string, PulseScanCheckInput>();
  for (const check of checks) {
    if (!seen.has(check.checkKey)) {
      seen.set(check.checkKey, check);
    }
  }
  return Array.from(seen.values());
}

/**
 * Applies workspace check configs to a list of checks:
 * - Disabled checks → status SKIPPED
 * - Label overrides → replaces label
 * - Severity overrides → clamps status to WARN/FAIL when appropriate
 */
async function applyCheckConfigs(checks: PulseScanCheckInput[]): Promise<PulseScanCheckInput[]> {
  try {
    const [disabled, overrides] = await Promise.all([
      getDisabledCheckKeys(),
      getCheckOverrides(),
    ]);

    if (disabled.size === 0 && overrides.size === 0) return checks;

    return checks.map((check) => {
      let result = { ...check };

      // Disabled → mark as skipped
      if (disabled.has(check.checkKey)) {
        result = {
          ...result,
          status: "SKIPPED",
          detail: "Check disabled in workspace settings.",
        };
      }

      const override = overrides.get(check.checkKey);
      if (override) {
        // Label override
        if (override.labelOverride) {
          result = { ...result, label: override.labelOverride };
        }
        // Severity override — only applies when check has an issue (WARN/FAIL)
        if (override.severityOverride && result.status !== "PASS" && result.status !== "SKIPPED") {
          result = { ...result, status: override.severityOverride as "WARN" | "FAIL" };
        }
      }

      return result;
    });
  } catch {
    // Never let config errors break a scan
    return checks;
  }
}
