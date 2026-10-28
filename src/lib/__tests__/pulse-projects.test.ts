import { describe, expect, it } from "vitest";
import { applyFindingCounts, buildProjects, decodeTargetKey, sortProjects, encodeTargetKey, projectAverage, targetKey } from "@/lib/pulse-projects";
import type { PulseScanListItem } from "@/types/pulse";

const NOW = Date.parse("2026-10-26T12:00:00Z");
const day = (n: number) => new Date(NOW - n * 86_400_000).toISOString();
let seq = 0;
const scan = (o: Partial<PulseScanListItem>): PulseScanListItem => ({
  id: `s${++seq}`, workspaceId: "w", clientId: null, clientName: null, projectName: "site", inputType: "URL",
  inputUrl: "https://example.com", inputGithubRepo: null, status: "COMPLETED", healthScore: 80, generatedProposalId: null,
  isShared: false, shareToken: null, createdAt: day(1), updatedAt: day(1), ...o,
});

describe("targetKey: one rule for 'the same project'", () => {
  it("treats case, www, a trailing slash and the protocol as the same site", () => {
    const keys = ["https://Example.com/", "http://www.example.com", "example.com", "https://example.com"].map((u) => targetKey({ inputUrl: u, inputGithubRepo: null, projectName: "x" }));
    expect(new Set(keys).size).toBe(1);
  });
  it("keeps different paths apart (store listings share one host)", () => {
    const a = targetKey({ inputUrl: "https://apps.apple.com/gb/app/one/id1", inputGithubRepo: null, projectName: "x" });
    const b = targetKey({ inputUrl: "https://apps.apple.com/gb/app/two/id2", inputGithubRepo: null, projectName: "x" });
    expect(a).not.toBe(b);
  });
  it("normalises repos, and round-trips through a URL slug", () => {
    const k = targetKey({ inputUrl: null, inputGithubRepo: "https://github.com/Git-Dann/Fellas.git", projectName: "x" });
    expect(k).toBe("repo:git-dann/fellas");
    expect(decodeTargetKey(encodeTargetKey(k))).toBe(k);
    expect(decodeTargetKey("garbage")).toBeNull();
  });
});

describe("buildProjects", () => {
  it("groups re-scans into one project with a dated history", () => {
    const p = buildProjects([scan({ healthScore: 70, createdAt: day(30) }), scan({ healthScore: 82, createdAt: day(2), inputUrl: "https://example.com/" })], NOW);
    expect(p).toHaveLength(1);
    expect(p[0].history.map((h) => h.score)).toEqual([70, 82]);
    expect(p[0].change?.by).toBe(12);
    expect(p[0].attention).toEqual([]);
  });

  it("flags a fall since the last scan even at a good score (the old alert only fired below 50)", () => {
    const [p] = buildProjects([scan({ healthScore: 95, createdAt: day(20) }), scan({ healthScore: 82, createdAt: day(1) })], NOW);
    expect(p.attention[0]).toMatch(/^Fell 13 points since/);
    expect(p.rank).toBe(0);
  });

  it("flags low scores, failed scans and stale projects, and puts the urgent first", () => {
    const projects = buildProjects([
      scan({ inputUrl: "https://ok.com", healthScore: 90, createdAt: day(3) }),
      scan({ inputUrl: "https://low.com", healthScore: 40, createdAt: day(3) }),
      scan({ inputUrl: "https://old.com", healthScore: 88, createdAt: day(90) }),
    ], NOW);
    expect(projects[0].target).toBe("https://low.com");
    expect(projects.find((p) => p.target === "https://old.com")!.attention[0]).toMatch(/^Not checked since/);
    expect(projects[projects.length - 1].target).toBe("https://ok.com");
  });

  it("averages each project once, not once per scan", () => {
    const projects = buildProjects([
      scan({ inputUrl: "https://a.com", healthScore: 40, createdAt: day(9) }),
      scan({ inputUrl: "https://a.com", healthScore: 40, createdAt: day(8) }),
      scan({ inputUrl: "https://a.com", healthScore: 40, createdAt: day(7) }),
      scan({ inputUrl: "https://b.com", healthScore: 100, createdAt: day(1) }),
    ], NOW);
    expect(projectAverage(projects)).toBe(70);
  });
});

describe("urgent findings decide whether a project needs a look", () => {
  it("a project with urgent findings is never 'on track', and sorts above quiet ones", () => {
    const [quiet, loud] = buildProjects([scan({ inputUrl: "https://a.com", healthScore: 60 }), scan({ inputUrl: "https://b.com", healthScore: 90 })], NOW)
      .sort((x, y) => x.target.localeCompare(y.target));
    const out = sortProjects([applyFindingCounts(quiet, { open: 40, urgent: 0 }), applyFindingCounts(loud, { open: 3, urgent: 2 })]);
    expect(out[0].target).toBe("https://b.com");
    expect(out[0].attention).toEqual(["2 urgent findings"]);
    expect(out[0].urgentFindings).toBe(2);
    expect(out[1].attention).toEqual([]);
  });
  it("leaves both counts unknown when the scan could not be counted", () => {
    const [p] = buildProjects([scan({})], NOW);
    expect(applyFindingCounts(p, null)).toMatchObject({ openFindings: null, urgentFindings: null, attention: [] });
  });
});
