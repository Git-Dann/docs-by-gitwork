/**
 * Shared, AI-FREE deterministic scan core.
 *
 * This is the single engine behind BOTH the internal full scan (which adds AI
 * synthesis on top) and the public embeddable "lite" scanner. It wraps the
 * existing deterministic functions — none of which import any AI — and adds:
 *   - one interface for URL + GitHub inputs,
 *   - bounded top-level parallelism (page checks ∥ deploy ∥ PageSpeed),
 *   - an `onChecks` callback fired incrementally as each wave of checks lands,
 *     so callers can persist + stream results in real time,
 *   - a single de-duplicated, stably-ordered result set + health score.
 *
 * No AI imports belong in this file — keep it that way.
 */

import {
  runUrlChecks,
  runGithubChecks,
  calculateHealthScore,
} from "@/server/pulse-scan";
import { runDeployAgent } from "@/server/pulse-agents/deploy-agent";
import { resolveEvidenceBackedControls } from "@/server/pulse-checks/standards-verification";
import { runCodeAgent } from "@/server/pulse-agents/code-agent";
import { runBrowserAgent } from "@/server/pulse-agents/browser-agent";
import { assertScannableUrl } from "./url-guard";
import { CATEGORIES } from "@/server/pulse-checks/categories";
import { annotateTrust } from "@/server/pulse-checks/confidence";
import { detectRepoShape } from "@/server/pulse-checks/native-repo";
import { buildPlatformCoverageCheck } from "@/server/pulse-checks/platform-coverage";
import type { JurisdictionCode } from "@/server/pulse-checks/jurisdictions";
import type {
  PulseScanCheckInput,
  BrowserAgentInsights,
  DeployAgentInsights,
  CodeAgentInsights,
} from "@/types/pulse";

export interface LiteScanInput {
  inputType: "URL" | "GITHUB_REPO";
  url?: string;
  githubRepo?: string;
  platform?: string;
  /** Include the Google PageSpeed (Lighthouse) wave. Default true. Off for the
   *  public path to stay fast and avoid PSI quota pressure. */
  includePageSpeed?: boolean;
  /** Skip the SSRF guard (internal callers that have already validated, or that
   *  intentionally scan platform subdomains). Public callers must leave this off. */
  skipUrlGuard?: boolean;
  /** Jurisdiction codes the product serves — drives compliance filtering + scorecard. */
  targetMarkets?: JurisdictionCode[];
  /** Fired with each fresh, de-duplicated, ordered batch of checks as it lands. */
  onChecks?: (batch: PulseScanCheckInput[]) => void | Promise<void>;
}

export interface LiteScanResult {
  checks: PulseScanCheckInput[];
  techStack: string[];
  healthScore: number;
  browserInsights: BrowserAgentInsights | null;
  deployInsights: DeployAgentInsights | null;
  codeInsights: CodeAgentInsights | null;
  homepageUrl: string | null;
  /** Jurisdiction codes auto-detected from the page (audit + legacy fallback). */
  detectedMarkets: JurisdictionCode[];
}

export async function runLiteScan(input: LiteScanInput): Promise<LiteScanResult> {
  const includePageSpeed = input.includePageSpeed ?? true;

  // De-dup + stable ordering across every wave; first writer of a checkKey wins.
  const seen = new Map<string, PulseScanCheckInput>();
  const collected: PulseScanCheckInput[] = [];
  let order = 0;
  const pending: Promise<void>[] = [];

  const ingest = (batch: PulseScanCheckInput[]): Promise<void> => {
    const fresh: PulseScanCheckInput[] = [];
    for (const c of batch) {
      if (seen.has(c.checkKey)) continue;
      // Trust layer — stamp confidence + bucket centrally (covers every probe).
      const withOrder = { ...annotateTrust(c), sortOrder: order++ };
      seen.set(c.checkKey, withOrder);
      collected.push(withOrder);
      fresh.push(withOrder);
    }
    if (fresh.length === 0) return Promise.resolve();
    return Promise.resolve(input.onChecks?.(fresh)).then(() => undefined);
  };

  // onWave is called synchronously by runUrlChecks (not awaited) — capture the
  // resulting ingest promise so we can flush all persistence before returning.
  const onWave = (batch: PulseScanCheckInput[]) => {
    pending.push(ingest(batch));
  };

  let techStack: string[] = [];
  let browserInsights: BrowserAgentInsights | null = null;
  let deployInsights: DeployAgentInsights | null = null;
  let codeInsights: CodeAgentInsights | null = null;
  let homepageUrl: string | null = null;
  let detectedMarkets: JurisdictionCode[] = [];

  if (input.inputType === "URL") {
    const raw = (input.url ?? "").trim();
    if (!raw) throw new Error("A URL is required.");
    const safeUrl = input.skipUrlGuard ? raw : (await assertScannableUrl(raw)).url;

    // Top-level parallelism: page checks ∥ deploy probes ∥ PageSpeed.
    const deployP = runDeployAgent(safeUrl)
      .then((r) => { deployInsights = r.insights; pending.push(ingest(r.checks)); })
      .catch(() => {});
    const browserP = includePageSpeed
      ? runBrowserAgent(safeUrl)
          .then((r) => { browserInsights = r.insights; pending.push(ingest(r.checks)); })
          .catch(() => {})
      : Promise.resolve();

    const urlResult = await runUrlChecks(safeUrl, input.platform, onWave, input.targetMarkets);
    techStack = urlResult.techStack;
    detectedMarkets = urlResult.detectedMarkets;
    // Reconcile: persist anything not already emitted (e.g. unreachable-site branch).
    pending.push(ingest(urlResult.checks));

    // Say so when the selected platform's deep checks need source we do not have.
    const coverage = buildPlatformCoverageCheck({
      selectedPlatform: input.platform ?? "",
      inputType: "URL",
      detectedShape: null,
    });
    if (coverage) pending.push(ingest([coverage]));

    await Promise.all([deployP, browserP]);
  } else {
    // GITHUB_REPO — repo + code checks in parallel, then the homepage (if any).
    const repo = (input.githubRepo ?? "").trim();
    if (!repo) throw new Error("A GitHub repo is required.");

    const [ghResult, codeResult, repoShape] = await Promise.all([
      runGithubChecks(repo).then((r) => { pending.push(ingest(r.checks)); return r; }).catch(() => ({ checks: [], techStack: [] as string[], nativePlatform: null })),
      runCodeAgent(repo).then((r) => { codeInsights = r.insights; pending.push(ingest(r.checks)); return r; }).catch(() => null),
      // Shares the memoized snapshot the families already fetched — no extra call.
      detectRepoShape(repo).catch(() => "none" as const),
    ]);
    techStack = ghResult.techStack;
    homepageUrl = codeResult?.insights.homepageUrl ?? null;

    // Reconcile the dropdown against what the repo actually is. A mismatch is a
    // WARN rather than a failure: detection wins, so the findings are still
    // correct — but the user asked for a family that did not run, and silence
    // there is indistinguishable from "we ran them and found nothing".
    const coverage = buildPlatformCoverageCheck({
      selectedPlatform: input.platform ?? "",
      inputType: "GITHUB_REPO",
      detectedShape: repoShape,
    });
    if (coverage) pending.push(ingest([coverage]));

    // A MOBILE repo is not graded on its GitHub "Website" link.
    //
    // homepageUrl was always null until July 2026 because runCodeAgent bailed on any
    // GraphQL failure, so this branch never ran. Once that was fixed (#463) a native
    // iOS repo whose Website field points at a marketing page had the full ~400-check
    // web suite run against it and failed nearly all of it — 0/100 off 439 checks.
    // The repo's own source is the subject of the scan; the link is not.
    //
    // ⚠️ The same guard exists in pulse-agents/orchestrator.ts, which is DEAD CODE —
    // runOrchestratedScan has no callers. THIS is the live path. Check for callers
    // before assuming a change to that file affects a scan.
    const isMobileRepo = ghResult.nativePlatform != null;

    if (homepageUrl && isMobileRepo) {
      pending.push(ingest([{
        category: CATEGORIES.CODE_QUALITY,
        checkKey: "mobile_repo_web_suite_skipped",
        label: "Web checks skipped (mobile repo)",
        status: "SKIPPED",
        detail:
          `Detected a ${ghResult.nativePlatform} project, so the website suite was not run against the repository's ` +
          `linked homepage (${homepageUrl}). A mobile app is graded on its source and store readiness, not on the ` +
          `marketing page it links to. Scan that URL separately if you want it graded.`,
      }]));
    } else if (homepageUrl) {
      const safeHome = input.skipUrlGuard ? homepageUrl : (await assertScannableUrl(homepageUrl).then((r) => r.url).catch(() => null));
      if (safeHome) {
        const deployP = runDeployAgent(safeHome)
          .then((r) => { deployInsights = r.insights; pending.push(ingest(r.checks)); })
          .catch(() => {});
        const browserP = includePageSpeed
          ? runBrowserAgent(safeHome)
              .then((r) => { browserInsights = r.insights; pending.push(ingest(r.checks)); })
              .catch(() => {})
          : Promise.resolve();
        const urlResult = await runUrlChecks(safeHome, input.platform, onWave, input.targetMarkets, { githubTechStack: techStack });
        if (urlResult.techStack.length > 0) techStack = urlResult.techStack;
        detectedMarkets = urlResult.detectedMarkets;
        pending.push(ingest(urlResult.checks));
        await Promise.all([deployP, browserP]);
      }
    }
  }

  // First flush every live source/probe wave. The deep catalogue can then use
  // those deterministic observations as real evidence instead of showing every
  // item as a generic manual task.
  await Promise.all(pending);
  await ingest(resolveEvidenceBackedControls(input.platform, collected));

  return {
    checks: collected,
    techStack: [...new Set(techStack)],
    healthScore: calculateHealthScore(collected),
    browserInsights,
    deployInsights,
    codeInsights,
    homepageUrl,
    detectedMarkets,
  };
}
