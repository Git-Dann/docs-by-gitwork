import { describe, it, expect, vi, beforeEach } from "vitest";

// WHY THIS FILE EXISTS.
//
// The iOS and Flutter check families run INSIDE runCodeAgent. They used to sit
// after an early `return { checks: [] }` on GraphQL failure, so losing GraphQL —
// which supplies only repo metadata — silently took out every check that actually
// reads the app's source. Two real client scans came back with 39 iOS / 21 Flutter
// checks missing and no error surfaced anywhere.
//
// The invariant: repo metadata and source analysis fail INDEPENDENTLY.

const graphQL = vi.fn();
const secretScan = vi.fn();
const nativeChecks = vi.fn();
const operationalChecks = vi.fn();

vi.mock("@/lib/github", () => ({
  githubGraphQL: (...args: unknown[]) => graphQL(...args),
  hasGithubToken: () => true,
  // Real behaviour is wanted here — the parser is unit-tested elsewhere.
  parseGithubRepo: (input: string) => {
    const segments = input.replace(/^https?:\/\/github\.com\//, "").split("/").filter(Boolean);
    return segments.length >= 2 ? { owner: segments[0], repo: segments[1] } : null;
  },
}));

vi.mock("../secret-scanner", () => ({
  scanRepoSecrets: (...args: unknown[]) => secretScan(...args),
}));

// Every repo-source family runs alongside the mobile one in runRestOnlyFamilies.
// All but the mobile one are mocked to no-ops here so these tests stay about
// GraphQL resilience; each family's own behaviour is covered by its own file.
//
// ⚠️ Adding a family to runRestOnlyFamilies WITHOUT adding it here fails loudly
// ("No export is defined on the mock") rather than silently — which is the right
// way round, so leave this list exhaustive.
vi.mock("@/server/pulse-checks/native-repo", () => ({
  detectRepoShape: async () => "ios",
  runNativeMobileChecks: (...args: unknown[]) => nativeChecks(...args),
  runChromeExtensionChecks: async () => ({ isExtension: false, checks: [] }),
  runDesktopChecks: async () => ({ shape: null, checks: [] }),
  runCliChecks: async () => ({ isCli: false, checks: [] }),
  runWebSourceChecks: async () => ({ isWebRepo: false, checks: [] }),
  runCleanlinessChecks: async () => ({ checks: [] }),
  runCiWorkflowChecks: async () => ({ checks: [] }),
  runContainerChecks: async () => ({ checks: [] }),
  runServiceDepthChecks: async () => ({ checks: [] }),
  runOperationalDepthChecks: (...args: unknown[]) => operationalChecks(...args),
}));

const { runCodeAgent } = await import("../code-agent");

const IOS_CHECK = {
  category: "Security" as const,
  checkKey: "ios_credential_logging",
  label: "Credentials in Release logs",
  status: "FAIL" as const,
  detail: "Passwords and auth tokens are written to the device console in Release builds.",
};

const OPERATIONAL_CHECK = {
  category: "API Quality" as const,
  checkKey: "api_depth_request_deadline",
  label: "Inbound requests have a bounded execution deadline",
  status: "PASS" as const,
  detail: "Request deadline evidence found.",
};

beforeEach(() => {
  vi.clearAllMocks();
  secretScan.mockResolvedValue({ checks: [], secrets: [] });
  nativeChecks.mockResolvedValue({ checks: [IOS_CHECK] });
  operationalChecks.mockResolvedValue({ checks: [OPERATIONAL_CHECK] });
});

describe("runCodeAgent — source analysis survives a metadata failure", () => {
  it("still emits the native family when GraphQL throws outright", async () => {
    graphQL.mockRejectedValue(new Error("Resource not accessible by personal access token"));

    const result = await runCodeAgent("Git-Dann/FellasRebuild");
    const keys = result.checks.map((c) => c.checkKey);

    // The regression: this used to be [].
    expect(keys).toContain("ios_credential_logging");
    // And the loss of metadata is reported rather than hidden.
    expect(keys).toContain("repo_intelligence");
    expect(result.checks.find((c) => c.checkKey === "repo_intelligence")?.status).toBe("INCONCLUSIVE");
  });

  it("still emits operational-depth controls when repository metadata fails", async () => {
    graphQL.mockRejectedValue(new Error("GraphQL unavailable"));

    const result = await runCodeAgent("Git-Dann/FellasRebuild", "API_BACKEND", "none");
    expect(result.checks.map((check) => check.checkKey)).toContain("api_depth_request_deadline");
    expect(operationalChecks).toHaveBeenCalledWith("Git-Dann/FellasRebuild");
  });

  it("still emits the native family when the repo itself resolves to null", async () => {
    graphQL.mockResolvedValue({ repository: null });

    const keys = (await runCodeAgent("Git-Dann/FellasRebuild")).checks.map((c) => c.checkKey);
    expect(keys).toContain("ios_credential_logging");
    expect(keys).toContain("repo_intelligence");
  });

  it("emits both metadata and native checks when GraphQL only partly resolves", async () => {
    // A token without Dependabot/admin read: those two fields null, rest fine.
    graphQL.mockResolvedValue({
      repository: {
        vulnerabilityAlerts: null,
        branchProtectionRules: null,
        pullRequests: null,
        defaultBranchRef: null,
        releases: { totalCount: 4, nodes: [] },
        codeOfConduct: null,
        hasIssuesEnabled: true,
        issues: { totalCount: 2 },
        closedIssues: { totalCount: 8 },
        stargazerCount: 3,
        forkCount: 0,
        watchers: { totalCount: 1 },
        licenseInfo: null,
        isArchived: false,
        isEmpty: false,
        diskUsage: 100,
        primaryLanguage: { name: "Swift" },
        languages: { nodes: [{ name: "Swift" }] },
        homepageUrl: null,
      },
    });

    const result = await runCodeAgent("Git-Dann/FellasRebuild");
    const keys = result.checks.map((c) => c.checkKey);

    // Nulled fields must not throw and lose everything after them.
    expect(keys).toContain("has_releases");
    expect(keys).toContain("primary_language");
    expect(keys).toContain("repo_not_archived");
    // Source analysis still present.
    expect(keys).toContain("ios_credential_logging");
    // A nulled branchProtectionRules degrades to "not protected", not a crash.
    expect(keys).toContain("branch_protection");
    expect(result.insights.branchProtected).toBe(false);
  });

  it("a failing secret scan does not take out the native family, or vice versa", async () => {
    graphQL.mockRejectedValue(new Error("no graphql"));
    secretScan.mockRejectedValue(new Error("tree walk failed"));

    const keys = (await runCodeAgent("Git-Dann/FellasRebuild")).checks.map((c) => c.checkKey);
    expect(keys).toContain("ios_credential_logging");

    nativeChecks.mockRejectedValue(new Error("snapshot failed"));
    secretScan.mockResolvedValue({
      checks: [
        {
          category: "Security" as const,
          checkKey: "exposed_secrets",
          label: "Exposed secrets",
          status: "PASS" as const,
          detail: "None found.",
        },
      ],
      secrets: [],
    });

    const second = (await runCodeAgent("Git-Dann/FellasRebuild")).checks.map((c) => c.checkKey);
    expect(second).toContain("exposed_secrets");
  });

  it("returns nothing for an unparseable repo reference", async () => {
    const result = await runCodeAgent("not-a-repo");
    expect(result.checks).toEqual([]);
    expect(graphQL).not.toHaveBeenCalled();
    expect(nativeChecks).not.toHaveBeenCalled();
  });
});
