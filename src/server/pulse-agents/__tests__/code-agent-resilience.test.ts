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

vi.mock("@/server/pulse-checks/native-repo", () => ({
  runNativeMobileChecks: (...args: unknown[]) => nativeChecks(...args),
  // The browser-extension family runs alongside the mobile one in
  // runRestOnlyFamilies. Mocked to a no-op here so these tests stay about GraphQL
  // resilience; its own behaviour is covered in chrome-extension.test.ts.
  runChromeExtensionChecks: async () => ({ isExtension: false, checks: [] }),
}));

const { runCodeAgent } = await import("../code-agent");

const IOS_CHECK = {
  category: "Security" as const,
  checkKey: "ios_credential_logging",
  label: "Credentials in Release logs",
  status: "FAIL" as const,
  detail: "Passwords and auth tokens are written to the device console in Release builds.",
};

beforeEach(() => {
  vi.clearAllMocks();
  secretScan.mockResolvedValue({ checks: [], secrets: [] });
  nativeChecks.mockResolvedValue({ checks: [IOS_CHECK] });
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
    expect(result.checks.find((c) => c.checkKey === "repo_intelligence")?.status).toBe("SKIPPED");
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
