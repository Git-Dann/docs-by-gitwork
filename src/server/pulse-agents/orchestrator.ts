import { runUrlChecks, runGithubChecks, skipAllChecks } from "@/server/pulse-scan";
import { runCodeAgent } from "./code-agent";
import { runDeployAgent } from "./deploy-agent";
import type { PulseScanCheckInput, PulseScanInputType, CodeAgentInsights, DeployAgentInsights } from "@/types/pulse";

export interface OrchestratorResult {
  checks: PulseScanCheckInput[];
  techStack: string[];
  codeInsights: CodeAgentInsights | null;
  deployInsights: DeployAgentInsights | null;
}

export async function runOrchestratedScan(input: {
  inputType: PulseScanInputType;
  inputUrl?: string;
  inputGithubRepo?: string;
  inputDescription?: string;
}): Promise<OrchestratorResult> {
  if (input.inputType === "FREE_TEXT") {
    return {
      checks: skipAllChecks("FREE_TEXT"),
      techStack: [],
      codeInsights: null,
      deployInsights: null,
    };
  }

  if (input.inputType === "URL" && input.inputUrl) {
    // Run infra + deploy agents in parallel (fast — 8-10s)
    // Browser agent (PageSpeed) runs separately in Phase 2 alongside AI synthesis
    const [infraResult, deployResult] = await Promise.all([
      runUrlChecks(input.inputUrl),
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
    };
  }

  if (input.inputType === "GITHUB_REPO" && input.inputGithubRepo) {
    // Run infra (GitHub file checks) + code intelligence agent in parallel
    const [infraResult, codeResult] = await Promise.all([
      runGithubChecks(input.inputGithubRepo),
      runCodeAgent(input.inputGithubRepo),
    ]);

    const allChecks = deduplicateChecks([
      ...infraResult.checks,
      ...codeResult.checks,
    ]);

    return {
      checks: allChecks,
      techStack: infraResult.techStack,
      codeInsights: codeResult.insights,
      deployInsights: null,
    };
  }

  return {
    checks: skipAllChecks(input.inputType),
    techStack: [],
    codeInsights: null,
    deployInsights: null,
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
