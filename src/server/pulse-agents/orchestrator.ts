import { runUrlChecks, runGithubChecks, skipAllChecks } from "@/server/pulse-scan";
import { runCodeAgent } from "./code-agent";
import { runDeployAgent } from "./deploy-agent";
import { runBrowserAgent } from "./browser-agent";
import type { PulseScanCheckInput, PulseScanInputType, CodeAgentInsights, DeployAgentInsights, BrowserAgentInsights } from "@/types/pulse";

export interface OrchestratorResult {
  checks: PulseScanCheckInput[];
  techStack: string[];
  codeInsights: CodeAgentInsights | null;
  deployInsights: DeployAgentInsights | null;
  browserInsights: BrowserAgentInsights | null;
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
      browserInsights: null,
    };
  }

  if (input.inputType === "URL" && input.inputUrl) {
    // Run infra, deploy, and browser agents in parallel
    const [infraResult, deployResult, browserResult] = await Promise.all([
      runUrlChecks(input.inputUrl),
      runDeployAgent(input.inputUrl),
      runBrowserAgent(input.inputUrl),
    ]);

    const allChecks = deduplicateChecks([
      ...infraResult.checks,
      ...deployResult.checks,
      ...browserResult.checks,
    ]);

    return {
      checks: allChecks,
      techStack: infraResult.techStack,
      codeInsights: null,
      deployInsights: deployResult.insights,
      browserInsights: browserResult.insights,
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
      browserInsights: null,
    };
  }

  return {
    checks: skipAllChecks(input.inputType),
    techStack: [],
    codeInsights: null,
    deployInsights: null,
    browserInsights: null,
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
