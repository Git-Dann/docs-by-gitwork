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
  };
}
