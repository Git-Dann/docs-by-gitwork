import { CATEGORIES } from "../pulse-checks/categories";
import { githubGraphQL, hasGithubToken, parseGithubRepo } from "@/lib/github";
import type { PulseScanCheckInput, CodeAgentInsights } from "@/types/pulse";
import { scanRepoSecrets, type SecretFinding } from "./secret-scanner";
import { runNativeMobileChecks, runChromeExtensionChecks, runDesktopChecks, runCliChecks, runWebSourceChecks, runCleanlinessChecks } from "@/server/pulse-checks/native-repo";

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
      pullRequests(last: 20, states: [MERGED]) {
        totalCount
        nodes {
          mergedAt
          reviews(first: 1) { totalCount }
        }
      }
      defaultBranchRef {
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
    defaultBranchRef: {
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
    diskUsage: number | null;
    primaryLanguage: { name: string } | null;
    languages: { nodes: { name: string }[] } | null;
    homepageUrl: string | null;
  };
}

export async function runCodeAgent(repoInput: string): Promise<{
  checks: PulseScanCheckInput[];
  insights: CodeAgentInsights;
}> {
  const parsed = parseGithubRepo(repoInput);
  if (!parsed) {
    return { checks: [], insights: emptyInsights() };
  }

  // ── REST-only families, run FIRST and unconditionally ───────────────────────
  // These need no GraphQL. They used to sit at the end of this function, after the
  // GraphQL early-return — so a token that could read the repo over REST but not
  // GraphQL's admin-scoped fields silently produced ZERO iOS/Flutter checks while
  // the scan still reported a plausible score. Measured on two real client apps:
  // 39 iOS and 21 Flutter checks, all missing, no error anywhere.
  const rest = await runRestOnlyFamilies(parsed, repoInput);

  let data: GQLResponse | null = null;
  try {
    data = await githubGraphQL<GQLResponse>(CODE_AGENT_QUERY, {
      owner: parsed.owner,
      name: parsed.repo,
    });
  } catch {
    data = null;
  }

  const repo = data?.repository ?? null;

  // Repo intelligence unavailable — say so instead of omitting eight checks in
  // silence. The distinction matters: "we could not look" is a different finding
  // from "this repo has no branch protection", and they need different fixes.
  if (!repo) {
    return {
      checks: [
        ...rest.checks,
        {
          category: CATEGORIES.CODE_QUALITY,
          checkKey: "repo_intelligence",
          label: "GitHub repo intelligence",
          status: "SKIPPED" as const,
          detail: hasGithubToken()
            ? "Repo intelligence (branch protection, releases, commit velocity, dependency alerts) " +
              "could not be read. The configured GITHUB_TOKEN most likely lacks the permissions these " +
              "fields require — Dependabot alerts: read, and administration: read for branch protection."
            : "GITHUB_TOKEN is not configured on this server, so branch protection, releases, commit " +
              "velocity and dependency alerts could not be read.",
        },
      ],
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
      ? "SKIPPED"
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
  // `?.` throughout: now that partial GraphQL responses are honoured, any single
  // field can arrive null because the token lacked the permission for just that one
  // (branchProtectionRules needs administration:read). Nulling one field must not
  // throw and lose the other seven checks.
  const branchRule = repo.branchProtectionRules?.nodes?.[0];
  const branchProtected = Boolean(branchRule);
  const requiresReviews = branchRule?.requiresApprovingReviews ?? false;
  const requiresChecks = branchRule?.requiresStatusChecks ?? false;

  checks.push({
    category: CATEGORIES.CODE_QUALITY,
    checkKey: "branch_protection",
    label: "Branch protection on default branch",
    status: !branchProtected ? "FAIL" : !requiresReviews ? "WARN" : "PASS",
    detail: !branchProtected
      ? "No branch protection rules — anyone can push directly to the default branch."
      : !requiresReviews
        ? "Branch protection enabled but does not require PR reviews before merging."
        : `Branch protection active: requires reviews${requiresChecks ? " and status checks" : ""}.`,
  });

  // ── PR review culture ──────────────────────────────────────────────────────
  const prs = repo.pullRequests?.nodes ?? [];
  const reviewedPrs = prs.filter((pr) => pr.reviews.totalCount > 0).length;
  const prReviewRate = prs.length > 0 ? reviewedPrs / prs.length : null;

  if (prs.length > 0) {
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

    checks.push({
      category: CATEGORIES.CODE_QUALITY,
      checkKey: "commit_velocity",
      label: "Active development velocity",
      status: commitVelocity >= 3 ? "PASS" : commitVelocity >= 1 ? "WARN" : "FAIL",
      detail: `${commitVelocity} commits/week over last 30 days, ${uniqueContributors} contributor${uniqueContributors !== 1 ? "s" : ""}.`,
    });
  }

  // ── Releases / versioning ─────────────────────────────────────────────────
  const releaseCount = repo.releases?.totalCount ?? 0;
  checks.push({
    category: CATEGORIES.CODE_QUALITY,
    checkKey: "has_releases",
    label: "GitHub releases / version tags",
    status: releaseCount >= 3 ? "PASS" : releaseCount >= 1 ? "WARN" : "FAIL",
    detail: releaseCount > 0
      ? `${releaseCount} release${releaseCount !== 1 ? "s" : ""} published — versioning history documented.`
      : "No releases — users and integrators cannot pin to a stable version.",
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
    status: issueCloseRate === null ? "WARN"
      : issueCloseRate >= 0.7 ? "PASS"
      : issueCloseRate >= 0.4 ? "WARN"
      : "FAIL",
    detail: issueCloseRate !== null
      ? `${Math.round(issueCloseRate * 100)}% of issues closed (${closedIssues}/${totalIssues}).`
      : "No issues found — either no bug tracker activity or issues are disabled.",
  });

  // ── Repo vitals ────────────────────────────────────────────────────────────
  const stars = repo.stargazerCount ?? 0;
  checks.push({
    category: CATEGORIES.TRUST_BRAND,
    checkKey: "github_stars",
    label: "GitHub stars (social proof)",
    status: stars >= 100 ? "PASS" : stars >= 10 ? "WARN" : "FAIL",
    detail: `${stars.toLocaleString()} GitHub stars.${stars < 10 ? " Low stars suggest limited community adoption or a private/new project." : ""}`,
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
      : "No license detected — code is legally all-rights-reserved by default, even in public repos.",
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
    checks,
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
 * Everything the code agent can learn over plain REST, with no GraphQL involved:
 * the secret scan and the native-mobile (iOS / Flutter) families.
 *
 * Kept separate and run unconditionally because these are the checks that actually
 * read the app's source. GraphQL only supplies repo *metadata* — losing it should
 * cost you branch-protection and star count, never the 39 iOS checks.
 *
 * Each family is independently best-effort: neither may break the code agent, and a
 * failure in one must not take out the other.
 */
async function runRestOnlyFamilies(
  parsed: { owner: string; repo: string },
  repoInput: string,
): Promise<{ checks: PulseScanCheckInput[]; exposedSecrets: SecretFinding[] }> {
  const checks: PulseScanCheckInput[] = [];
  let exposedSecrets: SecretFinding[] = [];

  // Every family is settled independently and on ONE shared memoized tree fetch
  // (pulse-checks/native-repo.ts). Independence is the point: a throw in any one of
  // them must not delete the others' findings, which is the §35.1 failure mode.
  // Each returns [] for a repo of the wrong shape, so this is a no-op for a plain
  // web service beyond the secret scan.
  const [secretResult, nativeResult, extensionResult, desktopResult, cliResult, webResult, cleanResult] = await Promise.allSettled([
    scanRepoSecrets(parsed.owner, parsed.repo),
    runNativeMobileChecks(repoInput),
    runChromeExtensionChecks(repoInput),
    runDesktopChecks(repoInput),
    runCliChecks(repoInput),
    runWebSourceChecks(repoInput),
    runCleanlinessChecks(repoInput),
  ]);

  if (secretResult.status === "fulfilled") {
    checks.push(...secretResult.value.checks);
    exposedSecrets = secretResult.value.secrets;
  }

  for (const result of [nativeResult, extensionResult, desktopResult, cliResult, webResult, cleanResult]) {
    if (result.status === "fulfilled") checks.push(...result.value.checks);
  }

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
