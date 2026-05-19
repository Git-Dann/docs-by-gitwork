import { githubGraphQL, parseGithubRepo } from "@/lib/github";
import type { PulseScanCheckInput, CodeAgentInsights } from "@/types/pulse";

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
    };
    pullRequests: {
      totalCount: number;
      nodes: { mergedAt: string; reviews: { totalCount: number } }[];
    };
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

  let data: GQLResponse;
  try {
    data = await githubGraphQL<GQLResponse>(CODE_AGENT_QUERY, {
      owner: parsed.owner,
      name: parsed.repo,
    });
  } catch {
    return { checks: [], insights: emptyInsights() };
  }

  const repo = data.repository;
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
    category: "Code Quality",
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
  const branchRule = repo.branchProtectionRules.nodes[0];
  const branchProtected = Boolean(branchRule);
  const requiresReviews = branchRule?.requiresApprovingReviews ?? false;
  const requiresChecks = branchRule?.requiresStatusChecks ?? false;

  checks.push({
    category: "Code Quality",
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
  const prs = repo.pullRequests.nodes;
  const reviewedPrs = prs.filter((pr) => pr.reviews.totalCount > 0).length;
  const prReviewRate = prs.length > 0 ? reviewedPrs / prs.length : null;

  if (prs.length > 0) {
    checks.push({
      category: "Code Quality",
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
      category: "Code Quality",
      checkKey: "commit_velocity",
      label: "Active development velocity",
      status: commitVelocity >= 3 ? "PASS" : commitVelocity >= 1 ? "WARN" : "FAIL",
      detail: `${commitVelocity} commits/week over last 30 days, ${uniqueContributors} contributor${uniqueContributors !== 1 ? "s" : ""}.`,
    });
  }

  // ── Releases / versioning ─────────────────────────────────────────────────
  const releaseCount = repo.releases?.totalCount ?? 0;
  checks.push({
    category: "Code Quality",
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
    category: "Code Quality",
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
    category: "Trust & Brand",
    checkKey: "github_stars",
    label: "GitHub stars (social proof)",
    status: stars >= 100 ? "PASS" : stars >= 10 ? "WARN" : "FAIL",
    detail: `${stars.toLocaleString()} GitHub stars.${stars < 10 ? " Low stars suggest limited community adoption or a private/new project." : ""}`,
  });

  // ── Archived check ─────────────────────────────────────────────────────────
  checks.push({
    category: "Code Quality",
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
      category: "Code Quality",
      checkKey: "primary_language",
      label: "Primary language detected",
      status: "PASS",
      detail: `Primary language: ${primaryLang}${languages.length > 1 ? ` (also: ${languages.filter((l) => l !== primaryLang).join(", ")})` : ""}.`,
    });
  }

  // ── License (via GraphQL) ──────────────────────────────────────────────────
  const license = repo.licenseInfo;
  checks.push({
    category: "Code Quality",
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
    },
  };
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
  };
}
