import { describe, expect, it } from "vitest";
import { DEFAULT_PROJECT_FILTERS, DEFAULT_PROJECT_SORT, applyFindingCounts, buildProjects, decodeTargetKey, filterProjects, projectKind, sortProjects, sortProjectsBy, encodeTargetKey, projectAverage, targetKey } from "@/lib/pulse-projects";
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

describe("the Projects list: newest first, filters and sorting", () => {
  const all = buildProjects([
    scan({ inputUrl: "https://old.com", healthScore: 40, createdAt: day(30), clientId: "c1", clientName: "Acme" }),
    scan({ inputUrl: "https://new.com", healthScore: 90, createdAt: day(1) }),
    scan({ inputUrl: null, inputType: "GITHUB_REPO", inputGithubRepo: "acme/api", healthScore: 70, createdAt: day(5), clientId: "c1", clientName: "Acme" }),
    scan({ inputUrl: "https://apps.apple.com/gb/app/thing/id123", healthScore: null, status: "FAILED", createdAt: day(3) }),
  ], NOW);
  const targets = (ps: typeof all) => ps.map((p) => p.target);

  it("opens newest first, whatever the urgency order the server sent", () => {
    expect(DEFAULT_PROJECT_SORT).toEqual({ key: "lastChecked", dir: "desc" });
    expect(targets(sortProjectsBy(all, "lastChecked", "desc"))).toEqual(["https://new.com", "https://apps.apple.com/gb/app/thing/id123", "acme/api", "https://old.com"]);
  });
  it("sorts by score both ways, with projects that have no score last either way", () => {
    // The scoreless project is the NEWEST here, so a sort that let nulls fall through to the
    // newest-first tie-break would put it at the top.
    const withFresh = buildProjects([
      scan({ inputUrl: "https://a.com", healthScore: 50, createdAt: day(9) }),
      scan({ inputUrl: "https://b.com", healthScore: 60, createdAt: day(8) }),
      scan({ inputUrl: "https://fresh.com", healthScore: null, status: "FAILED", createdAt: day(0) }),
    ], NOW);
    for (const dir of ["asc", "desc"] as const) expect(sortProjectsBy(withFresh, "score", dir).at(-1)!.target).toBe("https://fresh.com");
    expect(targets(sortProjectsBy(all, "score", "asc")).at(-1)).toBe("https://apps.apple.com/gb/app/thing/id123");
    expect(targets(sortProjectsBy(all, "score", "desc"))).toEqual(["https://new.com", "acme/api", "https://old.com", "https://apps.apple.com/gb/app/thing/id123"]);
    expect(targets(sortProjectsBy(all, "score", "asc"))[0]).toBe("https://old.com");
  });
  it("tells websites, repositories and store listings apart", () => {
    expect(all.map(projectKind).sort()).toEqual(["repo", "store", "website", "website"]);
    expect(targets(filterProjects(all, { ...DEFAULT_PROJECT_FILTERS, kind: "store" }))).toEqual(["https://apps.apple.com/gb/app/thing/id123"]);
  });
  it("filters by client, by no client, and by status", () => {
    expect(filterProjects(all, { ...DEFAULT_PROJECT_FILTERS, client: "c1" })).toHaveLength(2);
    expect(filterProjects(all, { ...DEFAULT_PROJECT_FILTERS, client: "none" })).toHaveLength(2);
    expect(targets(filterProjects(all, { ...DEFAULT_PROJECT_FILTERS, status: "failed" }))).toEqual(["https://apps.apple.com/gb/app/thing/id123"]);
    expect(filterProjects(all, { ...DEFAULT_PROJECT_FILTERS, status: "on_track" }).every((p) => p.attention.length === 0)).toBe(true);
  });
});
