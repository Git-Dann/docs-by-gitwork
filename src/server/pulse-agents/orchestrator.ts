import { runUrlChecks, runGithubChecks, skipAllChecks } from "@/server/pulse-scan";
import { runCodeAgent } from "./code-agent";
import { runDeployAgent } from "./deploy-agent";
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

    const allChecks = deduplicateChecks([
      ...infraResult.checks,
      ...deployResult.checks,
    ]);

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

    if (homepageUrl) {
      const [urlResult, deployResult] = await Promise.all([
        runUrlChecks(homepageUrl, input.platform),
        runDeployAgent(homepageUrl),
      ]);
      urlChecks = urlResult.checks;
      urlTechStack = urlResult.techStack;
      deployInsights = deployResult.insights;
    }

    const allChecks = deduplicateChecks([
      ...infraResult.checks,
      ...codeResult.checks,
      ...urlChecks,
    ]);

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
