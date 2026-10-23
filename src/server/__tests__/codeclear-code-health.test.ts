import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/code-health", () => ({ runCodeHealth: vi.fn() }));
vi.mock("@/server/codeclear", () => ({ clampScore: (n: number) => Math.max(0, Math.min(100, n)) }));

import { buildChecksFromAnalysis, codeHealthCheck } from "../codeclear-analysis";
import type { GitHubAnalysisMetrics, GitHubRepoSnapshot, RepoCodeHealth } from "@/types/codeclear";

const repo = (fullName: string, codeHealth?: Partial<RepoCodeHealth> | null): GitHubRepoSnapshot => ({
  name: fullName.split("/")[1], fullName, htmlUrl: "", description: null, language: "TypeScript", stars: 0, forks: 0, size: 10,
  recentCommitCount: 0, recentActivity: true, treeReadable: true, hasReadme: true, hasDocs: true, hasTests: true, hasCi: true,
  hasLint: true, hasManifest: true, topics: [], languages: [], pushedAt: "", updatedAt: "", healthScore: 70,
  codeHealth: codeHealth === undefined ? undefined : codeHealth === null ? null : {
    score: 80, band: "good", loc: 4200, complexLocShare: 0.02, commit: "abc", languages: ["typescript"], topDebt: [], unavailable: null, ...codeHealth,
  },
});

describe("measured code health as candidate evidence", () => {
  it("is absent when no repo was measured (older runs, or nothing readable)", () => {
    expect(codeHealthCheck([repo("a/b")])).toBeNull();
  });

  it("never fails a person: low code health is something to ask about, not a verdict", () => {
    const c = codeHealthCheck([repo("a/b", { score: 31, band: "poor" })])!;
    expect(c.status).toBe("WARN");
  });

  it("passes at 75+ and names each repo with its figures", () => {
    const c = codeHealthCheck([repo("a/b", { score: 90 }), repo("a/c", { score: 70, topDebt: [{ kind: "complex_function", severity: "high", path: "src/x.ts", line: 9, symbol: "run" }] })])!;
    expect(c.status).toBe("PASS");
    expect(c.detail).toContain("a/b: 90/100");
    expect(c.detail).toContain("run (src/x.ts:9)");
  });

  it("says nothing either way when the repos could not be measured", () => {
    const c = codeHealthCheck([repo("a/b", { score: null, band: null, unavailable: "the repository took too long to download." })])!;
    expect(c.status).toBe("SKIPPED");
    expect(c.detail).toContain("says nothing either way");
  });

  it("says plainly that it does not change the recommended scores", () => {
    expect(codeHealthCheck([repo("a/b", { score: 80 })])!.detail).toContain("does not change the recommended scores");
  });

  it("rides along with the other checks", () => {
    const metrics = { selectedRepoCount: 3, publicRepoCount: 3, recentRepoRatio: 50, averageRecentCommitCount: 5, languageCount: 2, docsCoverage: 100, testsCoverage: 100, ciCoverage: 100, lintCoverage: 100, manifestCoverage: 100, averageHealthScore: 70 } as GitHubAnalysisMetrics;
    const keys = buildChecksFromAnalysis({ metrics, redFlags: [], repos: [repo("a/b", { score: 80 })] }).map((c) => c.checkKey);
    expect(keys).toContain("measured_code_health");
    expect(buildChecksFromAnalysis({ metrics, redFlags: [] }).map((c) => c.checkKey)).not.toContain("measured_code_health");
  });
});
