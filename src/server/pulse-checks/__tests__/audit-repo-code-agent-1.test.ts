import { describe, it, expect, vi, beforeEach } from "vitest";

// Audit packet repo-code-agent-1: truthfulness of the GraphQL-backed repo checks.

const graphQL = vi.fn();

vi.mock("@/lib/github", () => ({
  githubGraphQL: (...args: unknown[]) => graphQL(...args),
  hasGithubToken: () => true,
  parseGithubRepo: (input: string) => {
    const segments = input
      .replace(/^https?:\/\/github\.com\//, "")
      .replace(/\.git$/, "")
      .split("/")
      .filter(Boolean);
    return segments.length >= 2 ? { owner: segments[0], repo: segments[1] } : null;
  },
}));

vi.mock("@/server/pulse-agents/secret-scanner", () => ({
  scanRepoSecrets: async () => ({ checks: [], secrets: [] }),
}));

vi.mock("@/server/pulse-checks/native-repo", () => ({
  detectRepoShape: async () => "none",
  runNativeMobileChecks: async () => ({ checks: [] }),
  runChromeExtensionChecks: async () => ({ isExtension: false, checks: [] }),
  runDesktopChecks: async () => ({ shape: null, checks: [] }),
  runCliChecks: async () => ({ isCli: false, checks: [] }),
  runWebSourceChecks: async () => ({ isWebRepo: false, checks: [] }),
  runCleanlinessChecks: async () => ({ checks: [] }),
  runCiWorkflowChecks: async () => ({ checks: [] }),
  runContainerChecks: async () => ({ checks: [] }),
  runServiceDepthChecks: async () => ({ checks: [] }),
  runOperationalDepthChecks: async () => ({ checks: [] }),
}));

const { runCodeAgent } = await import("@/server/pulse-agents/code-agent");

const DAY = 86_400_000;

function history(daysAgo: number[], authors: string[], totalCount: number) {
  return {
    target: {
      history: {
        totalCount,
        nodes: daysAgo.map((d, i) => ({
          committedDate: new Date(Date.now() - d * DAY).toISOString(),
          author: { name: authors[i % authors.length] },
        })),
      },
    },
  };
}

function repo(overrides: Record<string, unknown> = {}) {
  return {
    repository: {
      vulnerabilityAlerts: { totalCount: 0, nodes: [] },
      branchProtectionRules: { nodes: [] },
      pullRequests: { totalCount: 0, nodes: [] },
      defaultBranchRef: history([1], ["a"], 1),
      releases: { totalCount: 0, nodes: [] },
      tags: { totalCount: 0 },
      codeOfConduct: null,
      hasIssuesEnabled: true,
      issues: { totalCount: 0 },
      closedIssues: { totalCount: 0 },
      stargazerCount: 100,
      forkCount: 0,
      watchers: { totalCount: 0 },
      licenseInfo: null,
      isArchived: false,
      isEmpty: false,
      diskUsage: 1,
      primaryLanguage: null,
      languages: { nodes: [] },
      homepageUrl: null,
      ...overrides,
    },
  };
}

async function check(key: string, data: unknown) {
  graphQL.mockResolvedValue(data);
  const { checks } = await runCodeAgent("owner/repo");
  const c = checks.find((x) => x.checkKey === key);
  expect(c, `missing ${key}`).toBeDefined();
  return c!;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("commit_velocity", () => {
  it("does not credit a dormant repo with contributors from years ago (flutter/gallery)", async () => {
    const authors = ["a", "b", "c", "d", "e", "f", "g", "h", "i"];
    const days = Array.from({ length: 30 }, (_, i) => 400 + i * 5);
    const c = await check("commit_velocity", repo({ defaultBranchRef: history(days, authors, 1500) }));
    expect(c.status).toBe("FAIL");
    expect(c.detail).toBe("0 commits/week over last 30 days, 0 contributors.");
  });

  it("marks the 30-commit cap as a lower bound on a very active repo (cli/cli)", async () => {
    const days = Array.from({ length: 30 }, (_, i) => i * 0.1);
    const c = await check("commit_velocity", repo({ defaultBranchRef: history(days, ["a", "b", "c", "d", "e"], 9000) }));
    expect(c.status).toBe("PASS");
    expect(c.detail).toMatch(/^At least 7 commits\/week over last 30 days, 5\+ contributors\.$/);
  });

  it("leaves an uncapped, partly-recent sample unchanged (expressjs/express)", async () => {
    const recent = Array.from({ length: 12 }, (_, i) => 1 + i * 2);
    const old = Array.from({ length: 18 }, (_, i) => 40 + i * 3);
    const authors = ["wesleytodd", "bjohansebas", "UlisesGascon"];
    const c = await check("commit_velocity", repo({ defaultBranchRef: history([...recent, ...old], authors, 6000) }));
    expect(c.status).toBe("WARN");
    expect(c.detail).toBe("2.8 commits/week over last 30 days, 3 contributors.");
  });
});

describe("has_releases", () => {
  it("counts version tags the label promises (android/nowinandroid: 2 releases, 3 tags)", async () => {
    const c = await check("has_releases", repo({ releases: { totalCount: 2, nodes: [] }, tags: { totalCount: 3 } }));
    expect(c.status).toBe("PASS");
    expect(c.detail).toContain("3 published releases/version tags");
  });

  it("still FAILs a repo with neither releases nor tags (gothinkster realworld)", async () => {
    const c = await check("has_releases", repo({ releases: { totalCount: 0, nodes: [] }, tags: { totalCount: 0 } }));
    expect(c.status).toBe("FAIL");
    expect(c.detail).toBe("No releases or version tags — users and integrators cannot pin to a stable version.");
  });

  it("does not claim 'no version tags' when the tags field could not be read", async () => {
    const c = await check("has_releases", repo({ releases: { totalCount: 0, nodes: [] }, tags: null }));
    expect(c.status).toBe("INCONCLUSIVE");
    expect(c.detail).not.toContain("No releases or version tags");
  });

  it("still grades releases normally when tags are unread but releases exist", async () => {
    const c = await check("has_releases", repo({ releases: { totalCount: 4, nodes: [] }, tags: null }));
    expect(c.status).toBe("PASS");
  });

  it("still WARNs a repo with only two versions of either kind", async () => {
    const c = await check("has_releases", repo({ releases: { totalCount: 2, nodes: [] }, tags: { totalCount: 2 } }));
    expect(c.status).toBe("WARN");
  });
});

describe("has_license_graphql", () => {
  it("does not assert all-rights-reserved as certain when only the licence FILE is missing", async () => {
    const c = await check("has_license_graphql", repo({ licenseInfo: null }));
    expect(c.status).toBe("WARN");
    expect(c.detail).toContain("No license file detected by GitHub");
    expect(c.detail).toContain("unless a licence is granted elsewhere");
  });

  it("keeps PASS wording for a detected licence (kickstarter/ios-oss)", async () => {
    const c = await check("has_license_graphql", repo({ licenseInfo: { name: "Apache License 2.0", spdxId: "Apache-2.0" } }));
    expect(c.status).toBe("PASS");
    expect(c.detail).toBe("Licensed under Apache License 2.0 (Apache-2.0).");
  });
});

describe("repo_intelligence", () => {
  it("says the repo was not found instead of blaming token permissions", async () => {
    graphQL.mockRejectedValue(
      new Error("Could not resolve to a Repository with the name 'gitwork-audit/definitely-not-a-repo'."),
    );
    const { checks } = await runCodeAgent("gitwork-audit/definitely-not-a-repo");
    const c = checks.find((x) => x.checkKey === "repo_intelligence")!;
    expect(c.status).toBe("INCONCLUSIVE");
    expect(c.detail).toContain("does not exist");
    expect(c.detail).not.toContain("lacks the permissions");
  });

  it("keeps the permissions explanation for a genuine permission error", async () => {
    graphQL.mockRejectedValue(new Error("Resource not accessible by personal access token"));
    const { checks } = await runCodeAgent("owner/repo");
    const c = checks.find((x) => x.checkKey === "repo_intelligence")!;
    expect(c.status).toBe("INCONCLUSIVE");
    expect(c.detail).toContain("lacks the permissions");
  });
});
