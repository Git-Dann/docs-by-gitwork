import { CATEGORIES } from "../pulse-checks/categories";
import { githubGraphQL, githubRequest, hasGithubToken, parseGithubRepo } from "@/lib/github";
import { applyPrivateRepoPolicyAll, parseRepoVisibility, type RepoVisibility } from "@/server/pulse-checks/private-repo";
import type { PulseScanCheckInput, CodeAgentInsights } from "@/types/pulse";
import { collectorCompletenessCheck, collectorExecution } from "@/server/pulse-checks/collector-health";
import { scanRepoSecrets, type SecretFinding } from "./secret-scanner";
import {
  detectRepoShape,
  runNativeMobileChecks,
  runChromeExtensionChecks,
  runDesktopChecks,
  runCliChecks,
  runWebSourceChecks,
  runCleanlinessChecks,
  runCiWorkflowChecks,
  runContainerChecks,
  runServiceDepthChecks,
  runOperationalDepthChecks,
  type SnapshotShape,
} from "@/server/pulse-checks/native-repo";
import {
  buildRepoCollectorPlan,
  effectivePlatformForRepoShape,
  type RepoCollectorName,
} from "@/server/pulse-checks/scan-execution-plan";

const CODE_AGENT_QUERY = `
  query RepoIntelligence($owner: String!, $name: String!) {
    repository(owner: $owner, name: $name) {
      vulnerabilityAlerts(first: 20, states: [OPEN]) {
        totalCount
        nodes {
          securityVulnerability {
            severity
            package { name }
            advisory { description summary }
          }
        }
      }
      branchProtectionRules(first: 1) {
        nodes {
          requiresApprovingReviews
          requiresStatusChecks
          restrictsPushes
          isAdminEnforced
        }
      }
      viewerPermission
      rulesets(first: 25) {
        nodes {
          enforcement
          target
          conditions { refName { include } }
          rules(first: 30) { nodes { type } }
        }
      }
      pullRequests(last: 20, states: [MERGED]) {
        totalCount
        nodes {
          mergedAt
          reviews(first: 1) { totalCount }
        }
      }
      defaultBranchRef {
        name
        target {
          ... on Commit {
            history(first: 30) {
              totalCount
              nodes {
                committedDate
                author { name }
              }
            }
          }
        }
      }
      tags: refs(refPrefix: "refs/tags/", first: 1) { totalCount }
      releases(last: 10, orderBy: {field: CREATED_AT, direction: DESC}) {
        totalCount
        nodes { tagName createdAt isLatest }
      }
      codeOfConduct { name }
      hasIssuesEnabled
      issues(states: [OPEN], first: 1) { totalCount }
      closedIssues: issues(states: [CLOSED], first: 1) { totalCount }
      stargazerCount
      forkCount
      watchers(first: 1) { totalCount }
      licenseInfo { name spdxId }
      isArchived
      isEmpty
      isPrivate
      visibility
      diskUsage
      primaryLanguage { name }
      languages(first: 5) { nodes { name } }
      homepageUrl
    }
  }
`;

interface GQLResponse {
  // `repository` is null when the token cannot see the repo at all; every field
  // inside it is independently nullable because GraphQL nulls just the field the
  // token lacked permission for and reports it in `errors` beside good data.
  repository: {
    vulnerabilityAlerts: {
      totalCount: number;
      nodes: {
        securityVulnerability: {
          severity: string;
          package: { name: string };
          advisory: { description: string; summary: string };
        };
      }[];
    } | null;
    branchProtectionRules: {
      nodes: {
        requiresApprovingReviews: boolean;
        requiresStatusChecks: boolean;
        restrictsPushes: boolean;
        isAdminEnforced: boolean;
      }[];
    } | null;
    pullRequests: {
      totalCount: number;
      nodes: { mergedAt: string; reviews: { totalCount: number } }[];
    } | null;
    viewerPermission?: string | null;
    rulesets?: BranchRulesets | null;
    defaultBranchRef: {
      name?: string;
      target: {
        history: {
          totalCount: number;
          nodes: { committedDate: string; author: { name: string } }[];
        };
      };
    } | null;
    releases: {
      totalCount: number;
      nodes: { tagName: string; createdAt: string; isLatest: boolean }[];
    } | null;
    tags?: { totalCount: number } | null;
    codeOfConduct: { name: string } | null;
    hasIssuesEnabled: boolean;
    issues: { totalCount: number } | null;
    closedIssues: { totalCount: number } | null;
    stargazerCount: number;
    forkCount: number;
    watchers: { totalCount: number } | null;
    licenseInfo: { name: string; spdxId: string } | null;
    isArchived: boolean;
    isEmpty: boolean;
    // Basic repository fields, but still nullable under a partial response (§35.1).
    isPrivate?: boolean | null;
    visibility?: string | null;
    diskUsage: number | null;
    primaryLanguage: { name: string } | null;
    languages: { nodes: { name: string }[] } | null;
    homepageUrl: string | null;
  };
}

interface BranchRulesets {
  nodes: {
    enforcement: string;
    target: string | null;
    conditions: { refName: { include: string[] } | null } | null;
    rules: { nodes: { type: string }[] } | null;
  }[];
}

/**
 * Whether the default branch is protected, from BOTH mechanisms: classic branch
 * protection rules and repository rulesets (org rulesets included). "No protection" is
 * only reported when the viewer could have seen it: classic rules are listed to admins
 * only, so for anyone else an empty list establishes nothing.
 */
export function assessBranchProtection(repo: {
  branchProtectionRules: { nodes: { requiresApprovingReviews: boolean; requiresStatusChecks: boolean }[] } | null;
  rulesets?: BranchRulesets | null;
  viewerPermission?: string | null;
  defaultBranchRef?: { name?: string } | null;
}): PulseScanCheckInput {
  const base = { category: CATEGORIES.CODE_QUALITY, checkKey: "branch_protection", label: "Branch protection on default branch" } as const;
  const branch = repo.defaultBranchRef?.name ?? null;
  const applies = (include: string[]) =>
    include.some((ref) => ref === "~ALL" || ref === "~DEFAULT_BRANCH" || (branch !== null && ref === `refs/heads/${branch}`));
  const active = (repo.rulesets?.nodes ?? []).filter(
    (r) => r.enforcement === "ACTIVE" && r.target === "BRANCH" && applies(r.conditions?.refName?.include ?? []),
  );
  const ruleTypes = new Set(active.flatMap((r) => (r.rules?.nodes ?? []).map((n) => n.type)));
  const classic = repo.branchProtectionRules?.nodes?.[0] ?? null;
  const reviews = Boolean(classic?.requiresApprovingReviews) || ruleTypes.has("PULL_REQUEST");
  const checksRequired = Boolean(classic?.requiresStatusChecks) || ruleTypes.has("REQUIRED_STATUS_CHECKS");
  const protectedBranch = classic !== null || active.length > 0;

  if (protectedBranch) {
    return {
      ...base,
      status: reviews ? "PASS" : "WARN",
      detail: reviews
        ? `The default branch is protected${active.length > 0 ? ` (${active.length} active ruleset${active.length === 1 ? "" : "s"}${classic ? " and a branch protection rule" : ""})` : ""}: pull request reviews are required${checksRequired ? ", and so are status checks" : ""}.`
        : `The default branch is protected${active.length > 0 ? ` by ${active.length} active ruleset${active.length === 1 ? "" : "s"}` : ""}, but nothing requires a pull request review before merging.`,
    };
  }
  // Nothing seen. Classic rules are only visible to admins, so the absence is only
  // established for an admin viewer who could also read the rulesets.
  const canSeeAll = repo.viewerPermission === "ADMIN" && repo.branchProtectionRules !== null && repo.rulesets != null;
  if (!canSeeAll) {
    return {
      ...base,
      status: "INCONCLUSIVE",
      detail: repo.branchProtectionRules === null && repo.rulesets == null
        ? "Branch protection metadata is inaccessible with the configured GitHub permissions."
        : "No ruleset protects the default branch, and classic branch protection rules are only listed to repository " +
          "admins, which this scanner is not. Whether the branch is protected is not established.",
    };
  }
  return { ...base, status: "FAIL", detail: "No branch protection rule or ruleset covers the default branch, so anyone with write access can push to it directly." };
}

export async function runCodeAgent(
  repoInput: string,
  platform?: string,
  detectedShape?: SnapshotShape,
): Promise<{
  checks: PulseScanCheckInput[];
  insights: CodeAgentInsights;
}> {
  const parsed = parseGithubRepo(repoInput);
  if (!parsed) {
    return { checks: [], insights: emptyInsights() };
  }

  // ── REST-only families, selected by detected artefact and run FIRST ─────────
  // These need no GraphQL. They used to sit at the end of this function, after the
  // GraphQL early-return — so a token that could read the repo over REST but not
  // GraphQL's admin-scoped fields silently produced ZERO iOS/Flutter checks while
  // the scan still reported a plausible score. Measured on two real client apps:
  // 39 iOS and 21 Flutter checks, all missing, no error anywhere.
  const resolvedShape = detectedShape ?? await detectRepoShape(repoInput).catch(() => "none" as const);
  const effectivePlatform = effectivePlatformForRepoShape(platform, resolvedShape);
  const rest = await runRestOnlyFamilies(parsed, repoInput, effectivePlatform, resolvedShape);

  let data: GQLResponse | null = null;
  // Kept so the INCONCLUSIVE detail can tell "repo does not exist / not visible"
  // apart from "token lacks a permission" — different causes, different fixes.
  let graphQLError = "";
  try {
    data = await githubGraphQL<GQLResponse>(CODE_AGENT_QUERY, {
      owner: parsed.owner,
      name: parsed.repo,
    });
  } catch (err) {
    data = null;
    graphQLError = err instanceof Error ? err.message : String(err);
  }

  const repo = data?.repository ?? null;

  // Repo intelligence unavailable — say so instead of omitting eight checks in
  // silence. The distinction matters: "we could not look" is a different finding
  // from "this repo has no branch protection", and they need different fixes.
  if (!repo) {
    return {
      checks: ([
        ...rest.checks,
        {
          category: CATEGORIES.CODE_QUALITY,
          checkKey: "repo_intelligence",
          label: "GitHub repo intelligence",
          status: "INCONCLUSIVE" as const,
          detail: /Could not resolve to a Repository/i.test(graphQLError)
            ? `GitHub reports no repository ${parsed.owner}/${parsed.repo} visible to this scanner — it does not exist, ` +
              "was renamed, or is private and outside the configured GITHUB_TOKEN's access. Repo intelligence could not be read."
            : hasGithubToken()
            ? "Repo intelligence (branch protection, releases, commit velocity, dependency alerts) " +
              "could not be read. The configured GITHUB_TOKEN most likely lacks the permissions these " +
              "fields require — Dependabot alerts: read, and administration: read for branch protection."
            : "GITHUB_TOKEN is not configured on this server, so branch protection, releases, commit " +
              "velocity and dependency alerts could not be read.",
        },
      ]),
      insights: { ...emptyInsights(), exposedSecrets: rest.exposedSecrets },
    };
  }

  const checks: PulseScanCheckInput[] = [];

  // ── Vulnerability alerts ───────────────────────────────────────────────────
  const vulnAlerts = repo.vulnerabilityAlerts;
  const vulnCount = vulnAlerts?.totalCount ?? 0;
  const criticalVulns = vulnAlerts?.nodes.filter(
    (n) => n.securityVulnerability.severity === "CRITICAL",
  ).length ?? 0;
  const highVulns = vulnAlerts?.nodes.filter(
    (n) => n.securityVulnerability.severity === "HIGH",
  ).length ?? 0;

  checks.push({
    category: CATEGORIES.CODE_QUALITY,
    checkKey: "dependency_vulnerabilities",
    label: "Known dependency vulnerabilities",
    status: vulnAlerts === null
      ? "INCONCLUSIVE"
      : criticalVulns > 0
        ? "FAIL"
        : highVulns > 0
          ? "WARN"
          : vulnCount === 0
            ? "PASS"
            : "WARN",
    detail: vulnAlerts === null
      ? "Dependabot alerts not accessible — enable Dependabot for this repo."
      : vulnCount === 0
        ? "No known dependency vulnerabilities detected."
        : `${vulnCount} open vulnerability alert${vulnCount !== 1 ? "s" : ""} (${criticalVulns} critical, ${highVulns} high).`,
    evidence: vulnCount > 0
      ? vulnAlerts?.nodes.slice(0, 3).map((n) => n.securityVulnerability.package.name).join(", ")
      : undefined,
  });

  // ── Branch protection ──────────────────────────────────────────────────────
  // Classic rules are only listed to repository admins (a READ viewer gets an empty
  // list on a protected repo), and repository rulesets are a second mechanism. vercel/next.js
  // reads as "0 rules" to a READ token while 7 active rulesets protect its default branch.
  const branchCheck = assessBranchProtection(repo);
  checks.push(branchCheck);
  const branchProtected = branchCheck.status === "PASS" || branchCheck.status === "WARN";
  const requiresReviews = branchCheck.status === "PASS";

  // ── PR review culture ──────────────────────────────────────────────────────
  const prs = repo.pullRequests?.nodes ?? [];
  const reviewedPrs = prs.filter((pr) => pr.reviews.totalCount > 0).length;
  const prReviewRate = prs.length > 0 ? reviewedPrs / prs.length : null;

  if (repo.pullRequests === null) {
    checks.push({
      category: CATEGORIES.CODE_QUALITY,
      checkKey: "pr_review_culture",
      label: "Pull request review culture",
      status: "INCONCLUSIVE",
      detail: "Pull request metadata could not be read with the configured GitHub permissions.",
    });
  } else if (prs.length > 0) {
    checks.push({
      category: CATEGORIES.CODE_QUALITY,
      checkKey: "pr_review_culture",
      label: "Pull request review culture",
      status: prReviewRate === null
        ? "SKIPPED"
        : prReviewRate >= 0.7
          ? "PASS"
          : prReviewRate >= 0.3
            ? "WARN"
            : "FAIL",
      detail: prReviewRate === null
        ? "No merged pull requests found."
        : `${Math.round(prReviewRate * 100)}% of last ${prs.length} merged PRs had at least one review.`,
    });
  }

  // ── Commit velocity ────────────────────────────────────────────────────────
  const commits = repo.defaultBranchRef?.target?.history?.nodes ?? [];
  let commitVelocity: number | null = null;
  let uniqueContributors: number | null = null;

  if (commits.length > 0) {
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
    const recentCommits = commits.filter(
      (c) => new Date(c.committedDate).getTime() > thirtyDaysAgo,
    );
    commitVelocity = Math.round((recentCommits.length / 30) * 7 * 10) / 10;

    const names = new Set(commits.map((c) => c.author.name));
    uniqueContributors = names.size;
    // The detail says "over last 30 days", so contributors must come from the same
    // window: counting all 30 fetched commits credited archived flutter/gallery
    // (last commit 2024) with "9 contributors" alongside 0 commits/week.
    const recentContributors = new Set(recentCommits.map((c) => c.author.name)).size;
    // history(first: 30) caps the sample. When every fetched commit is inside the
    // window the true rate is a lower bound (cli/cli showed exactly 7/week = 30/30*7).
    const velocitySampleCapped =
      recentCommits.length === commits.length &&
      (repo.defaultBranchRef?.target?.history?.totalCount ?? 0) > commits.length;

    checks.push({
      category: CATEGORIES.CODE_QUALITY,
      checkKey: "commit_velocity",
      label: "Active development velocity",
      status: commitVelocity >= 3 ? "PASS" : commitVelocity >= 1 ? "WARN" : "FAIL",
      detail: `${velocitySampleCapped ? "At least " : ""}${commitVelocity} commits/week over last 30 days, ${recentContributors}${velocitySampleCapped ? "+" : ""} contributor${recentContributors !== 1 ? "s" : ""}.`,
    });
  } else if (!repo.isEmpty && repo.defaultBranchRef === null) {
    checks.push({
      category: CATEGORIES.CODE_QUALITY,
      checkKey: "commit_velocity",
      label: "Active development velocity",
      status: "INCONCLUSIVE",
      detail: "Default-branch history could not be read.",
    });
  }

  // ── Releases / versioning ─────────────────────────────────────────────────
  // A version tag is as pinnable as a GitHub Release (android/nowinandroid: 3 tags,
  // 2 Releases), so count whichever is larger, as the label promises.
  const releaseCount = Math.max(repo.releases?.totalCount ?? 0, repo.tags?.totalCount ?? 0);
  // The tags field arrives null when GitHub could not resolve it (a partial GraphQL
  // error). With no releases either, "no version tags" would be a claim about refs we
  // never read, so that case is unestablished rather than a FAIL.
  const tagsUnread = repo.tags == null;
  checks.push({
    category: CATEGORIES.CODE_QUALITY,
    checkKey: "has_releases",
    label: "GitHub releases / version tags",
    status:
      repo.releases === null || (releaseCount === 0 && tagsUnread)
        ? "INCONCLUSIVE"
        : releaseCount >= 3 ? "PASS" : releaseCount >= 1 ? "WARN" : "FAIL",
    detail: repo.releases === null
      ? "Release metadata could not be read."
      : releaseCount === 0 && tagsUnread
      ? "No GitHub releases are published, and the repository's tags could not be read, so whether it has version tags is unknown."
      : releaseCount > 0
      ? `${releaseCount} published release${releaseCount !== 1 ? "s" : ""}/version tag${releaseCount !== 1 ? "s" : ""} — versioning history documented.`
      : "No releases or version tags — users and integrators cannot pin to a stable version.",
  });

  // ── Issue health ───────────────────────────────────────────────────────────
  const openIssues = repo.issues?.totalCount ?? 0;
  const closedIssues = repo.closedIssues?.totalCount ?? 0;
  const totalIssues = openIssues + closedIssues;
  const issueCloseRate = totalIssues > 0 ? closedIssues / totalIssues : null;
  checks.push({
    category: CATEGORIES.CODE_QUALITY,
    checkKey: "issue_close_rate",
    label: "Issue closure rate",
    status: repo.issues === null || repo.closedIssues === null ? "INCONCLUSIVE"
      : issueCloseRate === null ? "WARN"
      : issueCloseRate >= 0.7 ? "PASS"
      : issueCloseRate >= 0.4 ? "WARN"
      : "FAIL",
    detail: repo.issues === null || repo.closedIssues === null
      ? "Issue metadata could not be read."
      : issueCloseRate !== null
      ? `${Math.round(issueCloseRate * 100)}% of issues closed (${closedIssues}/${totalIssues}).`
      : "No issues found — either no bug tracker activity or issues are disabled.",
  });

  // ── Repo vitals ────────────────────────────────────────────────────────────
  // Stars are a public repository's social proof, nothing more: a low count is a
  // reading, not a defect, and a private repository cannot be starred by the public.
  const stars = typeof repo.stargazerCount === "number" ? repo.stargazerCount : null;
  checks.push({
    category: CATEGORIES.TRUST_BRAND,
    checkKey: "github_stars",
    label: "GitHub stars (social proof)",
    status: repo.isPrivate === true ? "NOT_APPLICABLE" : stars === null ? "INCONCLUSIVE" : stars >= 100 ? "PASS" : "WARN",
    detail: repo.isPrivate === true
      ? "Private repository: it cannot be starred by the public, so stars are not a measure here."
      : stars === null
        ? "The star count could not be read."
        : `${stars.toLocaleString()} GitHub star${stars === 1 ? "" : "s"}.${stars < 100 ? " A low count is normal for a new or niche public project; it only matters if the repository is meant to attract outside users or contributors." : ""}`,
  });

  // ── Archived check ─────────────────────────────────────────────────────────
  checks.push({
    category: CATEGORIES.CODE_QUALITY,
    checkKey: "repo_not_archived",
    label: "Repository is not archived",
    status: repo.isArchived ? "FAIL" : "PASS",
    detail: repo.isArchived
      ? "This repository is archived — no new contributions or maintenance are expected."
      : "Repository is active (not archived).",
  });

  // ── Primary language ───────────────────────────────────────────────────────
  const primaryLang = repo.primaryLanguage?.name ?? null;
  const languages = repo.languages?.nodes?.map((l) => l.name) ?? [];
  if (primaryLang) {
    checks.push({
      category: CATEGORIES.CODE_QUALITY,
      checkKey: "primary_language",
      label: "Primary language detected",
      status: "PASS",
      detail: `Primary language: ${primaryLang}${languages.length > 1 ? ` (also: ${languages.filter((l) => l !== primaryLang).join(", ")})` : ""}.`,
    });
  }

  // ── License (via GraphQL) ──────────────────────────────────────────────────
  const license = repo.licenseInfo;
  checks.push({
    category: CATEGORIES.CODE_QUALITY,
    checkKey: "has_license_graphql",
    label: "License (via GitHub)",
    status: license ? "PASS" : "WARN",
    detail: license
      ? `Licensed under ${license.name} (${license.spdxId}).`
      : "No license file detected by GitHub — unless a licence is granted elsewhere (e.g. stated in the README), the code is all-rights-reserved by default, even in public repos.",
  });

  const vulnerabilities = (vulnAlerts?.nodes ?? []).map((n) => ({
    severity: n.securityVulnerability.severity,
    packageName: n.securityVulnerability.package.name,
    description: n.securityVulnerability.advisory.summary,
  }));

  // The REST-only families (secret scan + native mobile) ran before GraphQL — see
  // the top of this function. Appended here so display order is unchanged.
  checks.push(...rest.checks);

  return {
    // The relevance gate in run-lite-scan decides per check; see runGithubChecks.
    // run-lite-scan applies the private-repo policy to every check it ingests, from a
    // visibility it fetched up front. Applying it here too, from GraphQL's own answer,
    // covers the case where that up-front read failed but this query did not. The
    // policy is idempotent, so applying it twice is harmless.
    checks: applyPrivateRepoPolicyAll(checks, parseRepoVisibility(repo)),
    insights: {
      vulnerabilities,
      branchProtected,
      requiresReviews,
      prReviewRate,
      commitVelocity,
      uniqueContributors,
      homepageUrl: repo.homepageUrl ?? null,
      exposedSecrets: rest.exposedSecrets,
    },
  };
}

/**
 * Everything the code agent can learn over plain REST, with no GraphQL involved.
 *
 * Kept separate because these are the checks that actually read the app's source.
 * Only the detected artefact family is invoked. GraphQL only supplies repo
 * metadata — losing it should cost repo intelligence, never source coverage.
 *
 * Each family is independently best-effort: neither may break the code agent, and a
 * failure in one must not take out the other.
 */
async function runRestOnlyFamilies(
  parsed: { owner: string; repo: string },
  repoInput: string,
  platform: string | undefined,
  detectedShape: SnapshotShape,
): Promise<{ checks: PulseScanCheckInput[]; exposedSecrets: SecretFinding[] }> {
  const checks: PulseScanCheckInput[] = [];
  let exposedSecrets: SecretFinding[] = [];

  // Every planned family is settled independently and shares ONE memoized tree
  // fetch. A throw in one must not delete the other relevant findings.
  const collectors: Record<RepoCollectorName, () => Promise<{ checks: PulseScanCheckInput[]; secrets?: SecretFinding[] }>> = {
    "secret-scan": () => scanRepoSecrets(parsed.owner, parsed.repo),
    "native-mobile": () => runNativeMobileChecks(repoInput),
    "chrome-extension": () => runChromeExtensionChecks(repoInput),
    desktop: () => runDesktopChecks(repoInput),
    cli: () => runCliChecks(repoInput),
    "web-source": () => runWebSourceChecks(repoInput),
    cleanliness: () => runCleanlinessChecks(repoInput),
    "ci-workflows": () => runCiWorkflowChecks(repoInput),
    containers: () => runContainerChecks(repoInput),
    "service-depth": () => runServiceDepthChecks(repoInput),
    "operational-depth": () => runOperationalDepthChecks(repoInput),
  };
  const plannedCollectors = buildRepoCollectorPlan(platform, detectedShape);
  const settled = await Promise.allSettled(plannedCollectors.map((name) => collectors[name]()));

  for (const result of settled) {
    if (result.status !== "fulfilled") continue;
    checks.push(...result.value.checks);
    if (result.value.secrets) exposedSecrets = result.value.secrets;
  }

  const familyResults = plannedCollectors.map((name, index) => [name, settled[index]] as const);
  checks.push(collectorCompletenessCheck(
    familyResults.map(([name, result]) => collectorExecution(name, result)),
    "repo_collector_completeness",
  ));

  return { checks, exposedSecrets };
}

function emptyInsights(): CodeAgentInsights {
  return {
    vulnerabilities: [],
    branchProtected: false,
    requiresReviews: false,
    prReviewRate: null,
    commitVelocity: null,
    uniqueContributors: null,
    homepageUrl: null,
    exposedSecrets: [],
  };
}

const VISIBILITY_QUERY = `
  query RepoVisibility($owner: String!, $name: String!) {
    repository(owner: $owner, name: $name) { isPrivate visibility }
  }
`;

/**
 * Whether GitHub says the repo is private. REST first — `/repos/{owner}/{repo}` carries
 * `private` and `visibility`, needs no token for a public repo and costs one call — then
 * GraphQL as a fallback. Anything that cannot be established is `null`, and a null never
 * changes a check: an unreadable answer is not evidence the repo is private (§35).
 */
export async function fetchRepoVisibility(repoInput: string): Promise<RepoVisibility> {
  const parsed = parseGithubRepo(repoInput);
  if (!parsed) return null;
  try {
    const meta = await githubRequest<unknown>(`/repos/${parsed.owner}/${parsed.repo}`);
    const fromRest = parseRepoVisibility(meta);
    if (fromRest !== null) return fromRest;
  } catch {
    // Fall through to GraphQL.
  }
  if (!hasGithubToken()) return null;
  try {
    const data = await githubGraphQL<{ repository: { isPrivate?: boolean | null; visibility?: string | null } | null }>(
      VISIBILITY_QUERY,
      { owner: parsed.owner, name: parsed.repo },
    );
    return parseRepoVisibility(data?.repository ?? null);
  } catch {
    return null;
  }
}
