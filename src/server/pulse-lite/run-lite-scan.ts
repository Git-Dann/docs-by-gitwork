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
import { detectRepoShape, getRepoSnapshot } from "@/server/pulse-checks/native-repo";
import {
  decideRelevance,
  emptyRelevanceSummary,
  recordDecision,
  relevanceRuleFor,
  WEB_PLATFORMS,
  type RelevanceSummary,
  type RepoShape,
  type ScanContext,
} from "@/server/pulse-checks/check-relevance";
import { featuresFromPage, featuresFromRepo } from "@/server/pulse-checks/product-features";
import { classifyGenericRepo } from "@/server/pulse-checks/repo-kind";
import { normalizePulsePlatform } from "@/server/pulse-checks/platform-applicability";
import { buildPlatformCoverageCheck } from "@/server/pulse-checks/platform-coverage";
import { detectStoreTarget, STORE_NAME, STORE_PLATFORM_LABEL, storePlatformForTarget, withArticle } from "@/lib/pulse-store-url";
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
  /**
   * Render a client-rendered page in headless Chromium before reading its content, so the
   * content and SEO checks measure the page a visitor sees rather than an empty shell.
   *
   * Defaults to the same switch as PageSpeed, and for the same reason: the public embed path
   * turns both off. A browser launch per anonymous scan is a cost and an abuse surface, and
   * the public scan already declares what it could not assess.
   */
  renderJs?: boolean;
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
  /**
   * The platform the scan actually ran as. For an App Store / Google Play link this is
   * IOS_APP / ANDROID_APP whatever was selected — the link decides, not the picker.
   */
  executionPlatform: string | undefined;
  /** The app's name as its store lists it. Null for anything that is not a store link. */
  appName: string | null;
  /**
   * What the relevance gate showed and what it held back, and why — the scan's one-line
   * "not assessed" note. Hidden checks are not in `checks` at all.
   */
  relevance: RelevanceSummary;
}

export async function runLiteScan(input: LiteScanInput): Promise<LiteScanResult> {
  const includePageSpeed = input.includePageSpeed ?? true;
  const renderJs = input.renderJs ?? includePageSpeed;

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

  // ── The relevance gate (check-relevance.ts) ──────────────────────────────────
  // Every check from every collector passes through ingest below, so this is the one
  // place a check can be held back — no collector can route around it. The context is
  // filled in as the scan learns what it is looking at, and always BEFORE the checks it
  // governs are ingested.
  const relevanceCtx: ScanContext = {
    platform: normalizePulsePlatform(input.platform),
    target: input.inputType === "URL" ? { kind: "website" } : { kind: "repo", shape: "none" },
    features: new Set(),
  };
  const relevance = emptyRelevanceSummary();
  const heldBack = new Set<string>();

  const ingest = (batch: PulseScanCheckInput[]): Promise<void> => {
    const fresh: PulseScanCheckInput[] = [];
    for (const c of applyCheckPolicy(batch, input.checkPolicy)) {
      if (seen.has(c.checkKey) || heldBack.has(c.checkKey)) continue;
      const decision = decideRelevance(c, relevanceRuleFor(c.checkKey), relevanceCtx);
      recordDecision(relevance, decision);
      if (!decision.show) {
        heldBack.add(c.checkKey);
        continue;
      }
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
  let appName: string | null = null;

  if (input.inputType === "URL") {
    const raw = (input.url ?? "").trim();
    if (!raw) throw new Error("A URL is required.");
    const safeUrl = (await assertScannableUrl(raw)).url;

    // Classify the actual document first. Starting deploy/PageSpeed in parallel
    // used quota and time on App Store pages, source-only platforms, prototypes,
    // and Vercel/Cloudflare checkpoints whose results were later discarded.
    const store = detectStoreTarget(safeUrl);
    if (store) {
      relevanceCtx.target = { kind: "store" };
      relevanceCtx.platform = storePlatformForTarget(store);
    }
    // A WEBSITE of a non-web product (an iOS app's site, a CLI's docs site) is that
    // product's public presence. The URL engine used to skip it entirely for these
    // platforms — a website scanned as an iOS app returned one check — so it now scans
    // the site as what it is, a marketing site, and the gate applies the product's
    // real platform to decide which presence checks to show.
    const SOURCE_ONLY = new Set(["IOS_APP", "ANDROID_APP", "CROSS_PLATFORM_MOBILE", "DESKTOP_APP", "CHROME_EXTENSION", "CLI_TOOL"]);
    const urlEnginePlatform = !store && SOURCE_ONLY.has(normalizePulsePlatform(input.platform)) ? "MARKETING_SITE" : input.platform;
    const urlResult = await runUrlChecks(safeUrl, urlEnginePlatform, onWave, input.targetMarkets, {
      renderJs,
      onPageContext: (page) => {
        const features = featuresFromPage(page.html);
        if (page.paymentsFromOtherEvidence) features.add("payments");
        // The website of an iOS / Android product has that app by definition.
        if (["IOS_APP", "ANDROID_APP", "CROSS_PLATFORM_MOBILE"].includes(relevanceCtx.platform)) features.add("mobile_app");
        relevanceCtx.features = features;
        // A URL that answers with JSON is an API, whatever the dropdown said — and is
        // judged as one: an API scanned as "iOS app" is not asked for an About page.
        if (/json/i.test(page.contentType ?? "")) {
          relevanceCtx.target = { kind: "api" };
          relevanceCtx.platform = "API_BACKEND";
        }
      },
    });
    const urlTargetKind = detectUrlTargetKind(safeUrl);
    // ⚠️ A store link is an APP, and is scanned and reported as one.
    //
    // runUrlChecks takes an early return for App Store / Google Play links: it reads the
    // listing and runs none of the website families (headers, TLS, legal pages, SEO,
    // accessibility, DNS). Two earlier versions of this block got that wrong in opposite
    // directions. The first recorded url-checks COMPLETED, so the website launch policy
    // passed a scan that had run none of its checks ("98/100 · READY"). The second
    // recorded it NOT_APPLICABLE with "scan the product's own URL" — framing an iOS scan
    // as a website scan that had failed, and telling the user to scan something else.
    //
    // Now the collector that actually ran is recorded — store-listing — and the scan is
    // judged by the iOS / Android listing policy (release-decision.ts), which requires it.
    // The website and source collectors are recorded as not part of this scan, each with
    // a reason written about the APP, so coverage never reads as a whole-product answer.
    const storeTarget = urlResult.store?.target ?? null;
    if (storeTarget) {
      const platformLabel = STORE_PLATFORM_LABEL[storeTarget];
      const storeName = STORE_NAME[storeTarget];
      if (urlResult.store?.listing) {
        collectorCompleted("store-listing");
      } else {
        const liveCheck = urlResult.checks.find((check) => check.checkKey === "store_page_live");
        collectorExecutions.push({
          name: "store-listing",
          outcome: "ERROR",
          detail: liveCheck && liveCheck.status !== "PASS"
            ? (liveCheck.detail ?? `The ${storeName} listing could not be read.`).slice(0, 160)
            : `The ${storeName} page did not include its listing data, so the listing could not be read.`,
        });
      }
      collectorExecutions.push({
        name: "url-checks",
        outcome: "NOT_APPLICABLE",
        reason: `Not part of this scan: this is ${withArticle(platformLabel)}, assessed from its ${storeName} listing. The website checks (security headers, TLS, SEO, DNS) describe a website, not ${withArticle(platformLabel)}.`,
      });
    } else {
      collectorCompleted("url-checks");
    }
    techStack = urlResult.techStack;
    detectedMarkets = urlResult.detectedMarkets;
    urlSurfaceIsProduction = urlResult.surfaceKind === "DEPLOYED_PRODUCT";
    urlTargetBlocked = urlResult.checks.some(
      (check) => check.checkKey === "target_content_accessible" && check.status === "FAIL",
    );
    const targetKind = urlTargetKind;
    if (targetKind !== "web") executionPlatform = storePlatformForTarget(targetKind);
    appName = urlResult.store?.appName ?? null;
    const collectorPlan = buildUrlCollectorPlan(
      urlEnginePlatform,
      urlResult.surfaceKind,
      targetKind,
    );
    shouldResolveStandards = collectorPlan.standards;
    // Reconcile: persist anything not already emitted (e.g. unreachable-site branch).
    pending.push(ingest(urlResult.checks));

    // Say so when the selected platform's deep checks need source we do not have.
    // The platform the scan RUNS as — for a store link that is iOS / Android whatever
    // the picker said, so the report names the source family the listing cannot reach.
    const coverage = buildPlatformCoverageCheck({
      selectedPlatform: executionPlatform ?? "",
      inputType: "URL",
      detectedShape: null,
      storeTarget: storeTarget ?? undefined,
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
      storeTarget
        ? `The ${STORE_PLATFORM_LABEL[storeTarget]}'s source was not connected, so the checks that read its code did not run. Scan the app's GitHub repository to include them.`
        : "No repository was connected, so the source-analysis families did not run. Re-scan with a GitHub repo to include them.",
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
    // A repo with no specific shape is still a web app, a backend, or neither — and
    // detection decides, not the dropdown (a Next.js repo picked as "iOS app" used to run
    // as iOS and lose every web-source check).
    const snapshot = await getRepoSnapshot(repo).catch(() => null);
    let relevanceShape: RepoShape = repoShape as RepoShape;
    if (repoShape === "none" && snapshot?.accessible) {
      const kind = classifyGenericRepo(snapshot.paths, snapshot.files);
      relevanceShape = kind;
      const selected = normalizePulsePlatform(input.platform);
      if (kind === "web" && !WEB_PLATFORMS.has(selected)) executionPlatform = "WEB_APP";
      else if (kind === "backend" && selected !== "API_BACKEND" && !WEB_PLATFORMS.has(selected)) executionPlatform = "API_BACKEND";
      else if (kind === "none" && !WEB_PLATFORMS.has(selected) && selected !== "API_BACKEND") executionPlatform = "OTHER";
    }
    relevanceCtx.target = { kind: "repo", shape: relevanceShape };
    relevanceCtx.platform = normalizePulsePlatform(executionPlatform);
    relevanceCtx.features = snapshot?.accessible ? featuresFromRepo(snapshot.paths, snapshot.files) : new Set();
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
    executionPlatform,
    appName,
    relevance,
  };
}
