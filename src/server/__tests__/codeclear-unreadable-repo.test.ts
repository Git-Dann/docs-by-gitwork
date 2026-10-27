// @vitest-environment node
/**
 * "We could not look" must never become "it isn't there" (CLAUDE.md §35, §61).
 *
 * CodeClear read each sampled repo's file tree to decide whether it has tests, CI, a
 * linter and docs. When the tree could not be read — no GITHUB_TOKEN, a token without
 * access, a rate limit, a 404 — the profile-level coverage divided by 1 and reported 0%,
 * which became FAIL checks, "Limited visible test coverage" red flags (−3 calibre each)
 * and a lower recommended code-quality score. About a repository nobody had opened.
 *
 * Two-sided: an unreadable repo yields UNKNOWN and no penalty; a readable repo that
 * genuinely has no tests or CI still yields false and is still flagged.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/code-health", () => ({ runCodeHealth: vi.fn() }));
vi.mock("@/server/codeclear", () => ({
  clampScore: (n: number) => Math.max(0, Math.min(100, Math.round(n))),
}));

import {
  analyzeGitHubProfile,
  buildChecksFromAnalysis,
  weightedScoreForTest,
} from "../codeclear-analysis";
import { __resetGithubRateLimit } from "@/lib/github";

const RECENT = new Date().toISOString();

type TreeReply = { status: number; body?: unknown; headers?: Record<string, string> };

/** Stub GitHub: one user with two repos, whose tree endpoint answers `tree`. */
function stubGithub(tree: TreeReply) {
  const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
    new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers });

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.endsWith("/users/dev")) {
        return json(200, {
          login: "dev", name: "Dev", bio: null, avatar_url: null, html_url: "https://github.com/dev",
          company: null, location: null, followers: 0, following: 0, public_repos: 2,
          created_at: RECENT, updated_at: RECENT,
        });
      }
      if (url.includes("/users/dev/repos")) {
        return json(200, ["one", "two"].map((name) => ({
          name, full_name: `dev/${name}`, html_url: "", description: null, language: "Python",
          // size 0 keeps measureRepos from cloning anything.
          stargazers_count: 0, forks_count: 0, size: 0, pushed_at: RECENT, updated_at: RECENT, fork: false,
        })));
      }
      if (url.includes("/git/trees/")) return json(tree.status, tree.body ?? "", tree.headers);
      if (url.includes("/languages")) return json(200, { Python: 100 });
      if (url.includes("/commits")) return json(200, [{ sha: "a" }, { sha: "b" }]);
      return json(404, "{}");
    }),
  );
}

const readableNoSignals: TreeReply = {
  status: 200,
  // Readable, and genuinely without tests, CI, linter, docs or a manifest.
  body: { tree: [{ path: "main.py", type: "blob" }], truncated: false },
};

beforeEach(() => {
  __resetGithubRateLimit();
  process.env.GITHUB_TOKEN = "t";
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("an unreadable repository is unknown, not deficient", () => {
  it("reports unknown signals and coverage, not false / 0%", async () => {
    stubGithub({ status: 404, body: '{"message":"Not Found"}' });
    const a = await analyzeGitHubProfile("dev");

    expect(a.repoSnapshot.every((r) => r.treeReadable === false)).toBe(true);
    expect(a.repoSnapshot.map((r) => r.hasTests)).toEqual([null, null]);
    expect(a.repoSnapshot.map((r) => r.treeUnreadableReason)).toEqual(["NOT_FOUND", "NOT_FOUND"]);
    expect(a.metrics.testsCoverage).toBeNull();
    expect(a.metrics.ciCoverage).toBeNull();
    expect(a.metrics.unreadableRepoCount).toBe(2);
  });

  it("raises no coverage red flags, and no red flag for our own lack of access", async () => {
    stubGithub({ status: 404, body: '{"message":"Not Found"}' });
    const a = await analyzeGitHubProfile("dev");

    expect(a.redFlags.join(" ")).not.toMatch(/coverage|could not be read|couldn't read/i);
  });

  it("scores code quality above a readable repo that really has no tests or CI", async () => {
    stubGithub({ status: 404, body: '{"message":"Not Found"}' });
    const unreadable = await analyzeGitHubProfile("dev");
    stubGithub(readableNoSignals);
    const deficient = await analyzeGitHubProfile("dev");

    expect(unreadable.recommendedCodeQuality).toBeGreaterThan(deficient.recommendedCodeQuality);
    expect(unreadable.recommendedDeliveryReadiness).toBeGreaterThan(deficient.recommendedDeliveryReadiness);
  });

  it("shows SKIPPED checks that say why, instead of FAIL at 0%", async () => {
    stubGithub({ status: 404, body: '{"message":"Not Found"}' });
    const a = await analyzeGitHubProfile("dev");
    const checks = buildChecksFromAnalysis({ metrics: a.metrics, redFlags: a.redFlags, repos: a.repoSnapshot });
    const byKey = Object.fromEntries(checks.map((c) => [c.checkKey, c]));

    for (const key of ["docs_coverage", "tests_coverage", "ci_coverage", "lint_coverage", "manifest_coverage"]) {
      expect(byKey[key].status).toBe("SKIPPED");
      expect(byKey[key].detail).toMatch(/^Couldn't read 2 of 2 sampled repositories: /);
    }
    expect(byKey.repo_readability?.status).toBe("SKIPPED");
    expect(a.llmSummary).toMatch(/Couldn't read 2 of 2/);
  });
});

describe("the reason is named, and right", () => {
  it("no token + 404 blames the missing GITHUB_TOKEN, not the repo", async () => {
    delete process.env.GITHUB_TOKEN;
    stubGithub({ status: 404, body: '{"message":"Not Found"}' });
    const a = await analyzeGitHubProfile("dev");
    expect(a.metrics.unreadableReasons).toEqual(["NO_TOKEN"]);
    const checks = buildChecksFromAnalysis({ metrics: a.metrics, redFlags: a.redFlags });
    expect(checks.find((c) => c.checkKey === "repo_readability")?.detail).toMatch(/GITHUB_TOKEN is not configured/);
  });

  it("a 403 is a rate limit only when GitHub says so", async () => {
    stubGithub({
      status: 403,
      body: '{"message":"API rate limit exceeded"}',
      headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(Math.floor(Date.now() / 1000) + 600) },
    });
    // The profile calls share the stub, so only the tree 403s; the rate-limit flag is global.
    const limited = await analyzeGitHubProfile("dev");
    expect(limited.metrics.unreadableReasons).toEqual(["RATE_LIMITED"]);

    __resetGithubRateLimit();
    stubGithub({ status: 403, body: '{"message":"Resource not accessible by personal access token"}' });
    const forbidden = await analyzeGitHubProfile("dev");
    expect(forbidden.metrics.unreadableReasons).toEqual(["NO_ACCESS"]);
  });

  it("an empty repository (409) is READABLE and genuinely has nothing", async () => {
    stubGithub({ status: 409, body: '{"message":"Git Repository is empty."}' });
    const a = await analyzeGitHubProfile("dev");
    expect(a.repoSnapshot.every((r) => r.treeReadable)).toBe(true);
    expect(a.repoSnapshot[0].hasTests).toBe(false);
    expect(a.metrics.unreadableRepoCount).toBe(0);
  });
});

describe("a readable repo with no tests or CI is still reported as such", () => {
  it("yields false signals, 0% coverage, FAIL checks and the red flags", async () => {
    stubGithub(readableNoSignals);
    const a = await analyzeGitHubProfile("dev");

    expect(a.repoSnapshot.map((r) => r.hasTests)).toEqual([false, false]);
    expect(a.repoSnapshot.map((r) => r.hasCi)).toEqual([false, false]);
    expect(a.metrics.testsCoverage).toBe(0);
    expect(a.metrics.ciCoverage).toBe(0);
    expect(a.metrics.unreadableRepoCount).toBe(0);
    expect(a.redFlags).toContain("Limited visible test coverage.");
    expect(a.redFlags).toContain("Limited visible CI coverage.");

    const checks = buildChecksFromAnalysis({ metrics: a.metrics, redFlags: a.redFlags });
    expect(checks.find((c) => c.checkKey === "tests_coverage")?.status).toBe("FAIL");
    expect(checks.find((c) => c.checkKey === "repo_readability")).toBeUndefined();
  });
});

describe("weighted score excludes unknowns from both sides", () => {
  it("matches the all-known score when every term is known", () => {
    expect(weightedScoreForTest(28, [{ weight: 0.2, value: 50 }, { weight: 0.3, value: 100 }])).toBe(28 + 10 + 30);
  });

  it("does not count an unknown term as zero", () => {
    const withZero = weightedScoreForTest(28, [{ weight: 0.2, value: 0 }, { weight: 0.3, value: 60 }]);
    const withUnknown = weightedScoreForTest(28, [{ weight: 0.2, value: null }, { weight: 0.3, value: 60 }]);
    expect(withUnknown).toBe(28 + 0.5 * 60);
    expect(withUnknown).toBeGreaterThan(withZero);
  });
});
