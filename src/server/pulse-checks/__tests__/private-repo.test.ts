// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const rest = vi.fn();
const graphQL = vi.fn();
let hasToken = true;
vi.mock("@/lib/github", () => ({
  githubRequest: (...args: unknown[]) => rest(...args),
  githubGraphQL: (...args: unknown[]) => graphQL(...args),
  hasGithubToken: () => hasToken,
  parseGithubRepo: (input: string) => {
    const segments = input.replace(/^https?:\/\/github\.com\//, "").split("/").filter(Boolean);
    return segments.length >= 2 ? { owner: segments[0], repo: segments[1] } : null;
  },
}));

import {
  applyPrivateRepoPolicy,
  applyPrivateRepoPolicyAll,
  OPEN_SOURCE_ONLY_KEYS,
  parseRepoVisibility,
  PRIVATE_REPO_DETAIL,
} from "@/server/pulse-checks/private-repo";
import { applyAbsencePolicy, OPTIONAL_ABSENCE } from "@/server/pulse-checks/absence-policy";
import { CATEGORIES } from "@/server/pulse-checks/categories";
import { readFileSync } from "node:fs";
import type { PulseScanCheckInput } from "@/types/pulse";

const check = (checkKey: string, status: PulseScanCheckInput["status"], detail = "No LICENSE file found.") =>
  ({ checkKey, status, detail, category: CATEGORIES.CODE_QUALITY, label: checkKey }) as PulseScanCheckInput;

// What a real private client repo was graded down on before this change.
const OSS_CHORES = [
  check("has_license", "WARN"),
  check("has_license_graphql", "WARN", "No license file detected by GitHub."),
  check("has_contributing", "WARN", "No CONTRIBUTING.md."),
  check("has_code_of_conduct", "WARN", "No CODE_OF_CONDUCT.md."),
  check("has_security_md", "WARN", "No SECURITY.md."),
  check("has_changelog_file", "WARN", "No CHANGELOG.md."),
  check("issue_close_rate", "FAIL", "10% of issues closed (1/10)."),
  check("github_stars", "FAIL", "0 GitHub stars."),
  check("github_issue_templates", "WARN", "No issue templates."),
  check("github_pr_template", "WARN", "No PR template."),
];

describe("a PRIVATE repo is not graded on open-source chores", () => {
  it("every open-source-only key becomes NOT_APPLICABLE with the stated reason", () => {
    for (const c of OSS_CHORES) {
      const out = applyPrivateRepoPolicy(c, true);
      expect(out.status, c.checkKey).toBe("NOT_APPLICABLE");
      expect(out.detail, c.checkKey).toBe(PRIVATE_REPO_DETAIL);
    }
  });

  it("a PASS is not applicable either — a licence does not lift a private repo's score", () => {
    expect(applyPrivateRepoPolicy(check("has_license", "PASS", "MIT"), true).status).toBe("NOT_APPLICABLE");
  });

  it("has_releases never FAILs, and says why neutrally", () => {
    for (const status of ["FAIL", "WARN"] as const) {
      const out = applyPrivateRepoPolicy(check("has_releases", status, "No releases or version tags."), true);
      expect(out.status).toBe("PASS");
      expect(out.detail).toMatch(/No tagged releases — fine for a private product shipped through an app store/);
    }
  });

  it("has_releases that could not be read stays INCONCLUSIVE — a gap is not a pass", () => {
    expect(applyPrivateRepoPolicy(check("has_releases", "INCONCLUSIVE"), true).status).toBe("INCONCLUSIVE");
  });

  it("commit_velocity never FAILs: at most an informational WARN", () => {
    const out = applyPrivateRepoPolicy(check("commit_velocity", "FAIL", "0 commits/week over last 30 days, 0 contributors."), true);
    expect(out.status).toBe("WARN");
    expect(out.detail).toMatch(/0 commits\/week/);
    expect(out.detail).toMatch(/informational/);
    expect(applyPrivateRepoPolicy(check("commit_velocity", "PASS", "5/week"), true).status).toBe("PASS");
  });

  it("real findings on a private repo are untouched", () => {
    for (const key of ["has_readme", "has_gitignore", "branch_protection", "dependency_vulnerabilities", "repo_not_archived"]) {
      const c = check(key, "FAIL", "real");
      expect(applyPrivateRepoPolicy(c, true), key).toBe(c);
    }
  });

  it("is idempotent", () => {
    const once = applyPrivateRepoPolicyAll(OSS_CHORES, true);
    expect(applyPrivateRepoPolicyAll(once, true)).toEqual(once);
  });
});

describe("public and unknown visibility change nothing", () => {
  it("public: every check is returned as-is", () => {
    for (const c of [...OSS_CHORES, check("has_releases", "FAIL"), check("commit_velocity", "FAIL")]) {
      expect(applyPrivateRepoPolicy(c, false), c.checkKey).toBe(c);
    }
  });
  it("unknown (null) is never read as private (§35)", () => {
    for (const c of [...OSS_CHORES, check("has_releases", "FAIL"), check("commit_velocity", "FAIL")]) {
      expect(applyPrivateRepoPolicy(c, null), c.checkKey).toBe(c);
    }
    expect(applyPrivateRepoPolicyAll(OSS_CHORES, null)).toBe(OSS_CHORES);
  });
});

describe("visibility is read from GitHub's own answer", () => {
  it("REST /repos body", () => {
    expect(parseRepoVisibility({ private: true, visibility: "private" })).toBe(true);
    expect(parseRepoVisibility({ private: false, visibility: "public" })).toBe(false);
    expect(parseRepoVisibility({ private: true })).toBe(true);
  });
  it("enterprise 'internal' is not an open-source project", () => {
    expect(parseRepoVisibility({ private: false, visibility: "internal" })).toBe(true);
  });
  it("GraphQL repository body", () => {
    expect(parseRepoVisibility({ isPrivate: true, visibility: "PRIVATE" })).toBe(true);
    expect(parseRepoVisibility({ isPrivate: false, visibility: "PUBLIC" })).toBe(false);
  });
  it("a partial GraphQL response or an error body is unknown, not public", () => {
    expect(parseRepoVisibility({ isPrivate: null, visibility: null })).toBeNull();
    expect(parseRepoVisibility({ message: "Not Found" })).toBeNull();
    expect(parseRepoVisibility(null)).toBeNull();
    expect(parseRepoVisibility("private")).toBeNull();
  });
});

describe("the key list stays honest", () => {
  const registered = new Set((JSON.parse(readFileSync("src/server/pulse-checks/catalogue-baseline.json", "utf8")) as { keys: string[] }).keys);
  it("every key is a registered check", () => {
    for (const k of OPEN_SOURCE_ONLY_KEYS) expect(registered.has(k), k).toBe(true);
    expect(registered.has("has_releases")).toBe(true);
    expect(registered.has("commit_velocity")).toBe(true);
  });
});

describe("always optional, whatever the visibility", () => {
  it("git hooks, .env.example and an OpenAPI spec are choices, not defects", () => {
    for (const key of ["has_git_hooks", "has_env_example", "has_openapi_spec"]) {
      expect(OPTIONAL_ABSENCE.has(key), key).toBe(true);
      expect(applyAbsencePolicy(check(key, "WARN"), "repo").status, key).toBe("NOT_APPLICABLE");
      expect(applyAbsencePolicy(check(key, "PASS"), "repo").status, key).toBe("PASS");
    }
  });
});

describe("fetchRepoVisibility — REST first, GraphQL fallback, null when neither answers", async () => {
  const { fetchRepoVisibility } = await import("@/server/pulse-agents/code-agent");
  beforeEach(() => { rest.mockReset(); graphQL.mockReset(); hasToken = true; });

  it("reads REST's private flag", async () => {
    rest.mockResolvedValue({ private: true, visibility: "private" });
    expect(await fetchRepoVisibility("Git-Dann/Fellas-AndroidMobileApp")).toBe(true);
    expect(rest).toHaveBeenCalledWith("/repos/Git-Dann/Fellas-AndroidMobileApp");
    expect(graphQL).not.toHaveBeenCalled();
  });
  it("a public repo is public", async () => {
    rest.mockResolvedValue({ private: false, visibility: "public" });
    expect(await fetchRepoVisibility("expressjs/express")).toBe(false);
  });
  it("falls back to GraphQL when REST fails", async () => {
    rest.mockRejectedValue(new Error("403"));
    graphQL.mockResolvedValue({ repository: { isPrivate: true, visibility: "PRIVATE" } });
    expect(await fetchRepoVisibility("a/b")).toBe(true);
  });
  it("neither answering is unknown, never private", async () => {
    rest.mockRejectedValue(new Error("rate limited"));
    graphQL.mockRejectedValue(new Error("nope"));
    expect(await fetchRepoVisibility("a/b")).toBeNull();
    graphQL.mockResolvedValue({ repository: null });
    expect(await fetchRepoVisibility("a/b")).toBeNull();
    hasToken = false;
    graphQL.mockReset();
    expect(await fetchRepoVisibility("a/b")).toBeNull();
    expect(graphQL).not.toHaveBeenCalled();
  });
});

describe("wired into the one ingest every scan surface shares", () => {
  const src = readFileSync("src/server/pulse-lite/run-lite-scan.ts", "utf8");
  it("ingest applies the policy to every check", () => {
    expect(src).toMatch(/applyAbsencePolicy\(applyPrivateRepoPolicy\(c, repoIsPrivate\)/);
  });
  it("visibility is settled BEFORE the repo collectors ingest anything", () => {
    const settled = src.indexOf("repoIsPrivate = await visibilityRun");
    const collectors = src.indexOf("runGithubChecks(repo, executionPlatform");
    expect(settled).toBeGreaterThan(0);
    expect(collectors).toBeGreaterThan(settled);
  });
});
