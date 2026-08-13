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
import { annotateTrust } from "@/server/pulse-checks/confidence";
import { detectRepoShape } from "@/server/pulse-checks/native-repo";
import { buildPlatformCoverageCheck } from "@/server/pulse-checks/platform-coverage";
import {
  buildUrlCollectorPlan,
  detectUrlTargetKind,
  effectivePlatformForRepoShape,
} from "@/server/pulse-checks/scan-execution-plan";
import { collectorCompletenessCheck, collectorOutcome, sourceCollectorsUnavailable, urlCollectorsUnavailable, type CollectorExecution } from "@/server/pulse-checks/collector-health";
import { applyCheckPolicy, customPolicyChecks, type CheckPolicy } from "@/server/check-config";
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
  /** Workspace policy loaded by the authenticated orchestration path. */
  checkPolicy?: CheckPolicy;
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
  /**
   * What ran, what failed and what was unavailable. Returned so the scan can
   * state its own coverage rather than leaving it inside one check row's
   * evidence JSON, where nothing but a reader of raw rows would ever find it.
   */
  collectorExecutions: CollectorExecution[];
}

export async function runLiteScan(input: LiteScanInput): Promise<LiteScanResult> {
  const includePageSpeed = input.includePageSpeed ?? true;

  // De-dup + stable ordering across every wave; first writer of a checkKey wins.
  const seen = new Map<string, PulseScanCheckInput>();
  const collected: PulseScanCheckInput[] = [];
  let order = 0;
  const pending: Promise<void>[] = [];
  const collectorExecutions: CollectorExecution[] = [];

  const collectorFailed = (name: string, error: unknown) => {
    collectorExecutions.push({
      name,
      outcome: "ERROR",
      detail: error instanceof Error ? error.message.slice(0, 160) : "collector failed",
    });
  };
  const collectorCompleted = (name: string) => collectorExecutions.push({ name, outcome: "COMPLETED" });

  const ingest = (batch: PulseScanCheckInput[]): Promise<void> => {
    const fresh: PulseScanCheckInput[] = [];
    for (const c of applyCheckPolicy(batch, input.checkPolicy)) {
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
  let urlTargetBlocked = false;
  let urlSurfaceIsProduction = true;
  let shouldResolveStandards = input.inputType === "GITHUB_REPO";
  let executionPlatform = input.platform;

  if (input.inputType === "URL") {
    const raw = (input.url ?? "").trim();
    if (!raw) throw new Error("A URL is required.");
    const safeUrl = (await assertScannableUrl(raw)).url;

    // Classify the actual document first. Starting deploy/PageSpeed in parallel
    // used quota and time on App Store pages, source-only platforms, prototypes,
    // and Vercel/Cloudflare checkpoints whose results were later discarded.
    const urlResult = await runUrlChecks(safeUrl, input.platform, onWave, input.targetMarkets);
    collectorCompleted("url-checks");
    techStack = urlResult.techStack;
    detectedMarkets = urlResult.detectedMarkets;
    urlSurfaceIsProduction = urlResult.surfaceKind === "DEPLOYED_PRODUCT";
    urlTargetBlocked = urlResult.checks.some(
      (check) => check.checkKey === "target_content_accessible" && check.status === "FAIL",
    );
    const targetKind = detectUrlTargetKind(safeUrl);
    if (targetKind === "app_store") executionPlatform = "IOS_APP";
    if (targetKind === "play_store") executionPlatform = "ANDROID_APP";
    const collectorPlan = buildUrlCollectorPlan(
      input.platform,
      urlResult.surfaceKind,
      targetKind,
    );
    shouldResolveStandards = collectorPlan.standards;
    // Reconcile: persist anything not already emitted (e.g. unreachable-site branch).
    pending.push(ingest(urlResult.checks));

    // Say so when the selected platform's deep checks need source we do not have.
    const coverage = buildPlatformCoverageCheck({
      selectedPlatform: input.platform ?? "",
      inputType: "URL",
      detectedShape: null,
    });
    if (coverage) pending.push(ingest([coverage]));

    const [deployOutcome, browserOutcome] = await Promise.all([
      collectorPlan.deploy
        ? Promise.allSettled([runDeployAgent(safeUrl)]).then(([result]) => result)
        : Promise.resolve(null),
      collectorPlan.browser && includePageSpeed
        ? Promise.allSettled([runBrowserAgent(safeUrl)]).then(([result]) => result)
        : Promise.resolve(null),
    ]);

    // `collectorOutcome` (not the bare settled status) decides COMPLETED vs ERROR —
    // both agents catch their own network failures and resolve with an empty result,
    // so a fulfilled promise is not proof either of them collected anything.
    // Whatever checks they did produce are still ingested; a partial result is
    // evidence, it just is not a complete one.
    if (deployOutcome) {
      collectorExecutions.push(collectorOutcome("deploy-agent", deployOutcome));
      if (deployOutcome.status === "fulfilled") {
        deployInsights = deployOutcome.value.insights;
        pending.push(ingest(deployOutcome.value.checks));
      }
    } else {
      collectorExecutions.push({ name: "deploy-agent", outcome: "NOT_APPLICABLE" });
    }

    if (browserOutcome) {
      collectorExecutions.push(collectorOutcome("browser-agent", browserOutcome));
      if (browserOutcome.status === "fulfilled") {
        browserInsights = browserOutcome.value.insights;
        pending.push(ingest(browserOutcome.value.checks));
      }
    } else {
      collectorExecutions.push({ name: "browser-agent", outcome: "NOT_APPLICABLE" });
    }

    // The source collectors are not merely absent from a URL scan — they are
    // UNAVAILABLE, and for a reason the customer can act on. Recording nothing
    // made the coverage check read "every collector completed" while half of
    // Pulse had not run.
    collectorExecutions.push(...sourceCollectorsUnavailable(
      "No repository was connected, so the source-analysis families did not run. Re-scan with a GitHub repo to include them.",
    ));
  } else {
    // GITHUB_REPO — detect the artefact, then run only its source families.
    const repo = (input.githubRepo ?? "").trim();
    if (!repo) throw new Error("A GitHub repo is required.");

    // Shares one memoized snapshot with both collectors — no repeated tree fetch.
    const repoShape = await detectRepoShape(repo)
      .then((shape) => { collectorCompleted("repo-shape"); return shape; })
      .catch((error) => { collectorFailed("repo-shape", error); return "none" as const; });
    executionPlatform = effectivePlatformForRepoShape(input.platform, repoShape);
    const [ghResult, codeResult] = await Promise.all([
      runGithubChecks(repo, input.platform, repoShape).then((r) => { collectorCompleted("github-checks"); pending.push(ingest(r.checks)); return r; }).catch((error) => { collectorFailed("github-checks", error); return { checks: [], techStack: [] as string[], nativePlatform: null }; }),
      runCodeAgent(repo, input.platform, repoShape).then((r) => { collectorCompleted("code-agent"); codeInsights = r.insights; pending.push(ingest(r.checks)); return r; }).catch((error) => { collectorFailed("code-agent", error); return null; }),
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

    // The mirror of the URL branch: a repo scan never reaches the live site, so
    // headers, TLS, rendered content and deployment signals are unmeasured. Left
    // unrecorded, coverage would report "3 of 3 collectors completed" and read as
    // a whole-product assessment — the same defect as the URL side, in the other
    // direction, and I fixed only one of them the first time.
    collectorExecutions.push(...urlCollectorsUnavailable(
      "No deployed URL was scanned, so the live-site families (headers, TLS, rendered content, deployment) did not run. Re-scan with a URL to include them.",
    ));

    // The optional GitHub homepage remains useful metadata for the report, but it
    // is not the selected artefact and is never scanned implicitly. Users can run
    // a separate URL scan when they want that surface assessed.
  }

  // First flush every live source/probe wave. The deep catalogue can then use
  // those deterministic observations as real evidence instead of showing every
  // item as a generic manual task.
  await Promise.all(pending);
  if (!urlTargetBlocked && urlSurfaceIsProduction && shouldResolveStandards) {
    await ingest(resolveEvidenceBackedControls(executionPlatform, collected));
    await ingest(customPolicyChecks(input.checkPolicy));
  }
  await ingest([collectorCompletenessCheck(collectorExecutions)]);

  return {
    checks: collected,
    techStack: [...new Set(techStack)],
    healthScore: calculateHealthScore(collected),
    browserInsights,
    deployInsights,
    codeInsights,
    homepageUrl,
    detectedMarkets,
    collectorExecutions,
  };
}
