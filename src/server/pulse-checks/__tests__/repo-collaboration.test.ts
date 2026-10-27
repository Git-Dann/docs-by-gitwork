import { describe, expect, it } from "vitest";
import { evaluateRepoCollaborationChecks } from "../repo-collaboration";
import { assessCommitSigning } from "@/server/pulse-agents/code-agent";
import type { RepoSnapshot } from "../native-mobile";

function snap(paths: string[], files: Record<string, string> = {}, over: Partial<RepoSnapshot> = {}): RepoSnapshot {
  return { owner: "o", repo: "r", paths, files: new Map(Object.entries(files)), truncated: false, accessible: true, ...over };
}
const statuses = (s: RepoSnapshot) => Object.fromEntries(evaluateRepoCollaborationChecks(s).map((c) => [c.checkKey, c.status]));

const CODEQL = "name: CodeQL\non: [push]\njobs:\n  analyze:\n    steps:\n      - uses: github/codeql-action/init@v3\n";
const GITLEAKS = "on: [push]\njobs:\n  scan:\n    steps:\n      - uses: gitleaks/gitleaks-action@v2\n";
const RELEASE = "on: push\njobs:\n  release:\n    steps:\n      - uses: googleapis/release-please-action@v4\n";
const PLAIN_CI = "on: [push]\njobs:\n  test:\n    steps:\n      - run: npm test\n";

describe("repo collaboration files", () => {
  it("passes when the files and tools are in the repository", () => {
    const s = snap(
      ["src/a.ts", ".github/CODEOWNERS", ".github/pull_request_template.md", ".github/ISSUE_TEMPLATE/bug.yml", ".github/workflows/codeql.yml", ".github/workflows/leaks.yml", ".github/workflows/release.yml"],
      { ".github/workflows/codeql.yml": CODEQL, ".github/workflows/leaks.yml": GITLEAKS, ".github/workflows/release.yml": RELEASE },
    );
    expect(statuses(s)).toEqual({
      github_codeowners: "PASS",
      github_pr_template: "PASS",
      github_issue_templates: "PASS",
      release_automation: "PASS",
      github_code_scanning: "PASS",
      github_secret_scanning: "PASS",
    });
  });

  it("warns on missing files, but never claims a built-in GitHub setting is off", () => {
    const s = snap(["src/a.ts", ".github/workflows/ci.yml"], { ".github/workflows/ci.yml": PLAIN_CI });
    const r = statuses(s);
    expect(r.github_codeowners).toBe("WARN");
    expect(r.github_pr_template).toBe("WARN");
    expect(r.github_issue_templates).toBe("WARN");
    expect(r.release_automation).toBe("WARN");
    // CodeQL default setup and GitHub secret scanning leave no file.
    expect(r.github_code_scanning).toBe("INCONCLUSIVE");
    expect(r.github_secret_scanning).toBe("INCONCLUSIVE");
  });

  it("only accepts CODEOWNERS where GitHub reads it", () => {
    expect(statuses(snap(["CODEOWNERS"])).github_codeowners).toBe("PASS");
    expect(statuses(snap(["docs/CODEOWNERS"])).github_codeowners).toBe("PASS");
    expect(statuses(snap(["src/CODEOWNERS"])).github_codeowners).toBe("WARN");
  });

  it("a scanning tool mentioned in a comment does not count", () => {
    const s = snap([".github/workflows/ci.yml"], { ".github/workflows/ci.yml": "# TODO add github/codeql-action\n" + PLAIN_CI });
    expect(statuses(s).github_code_scanning).toBe("INCONCLUSIVE");
  });

  it("release tooling is found from config files and package.json too", () => {
    expect(statuses(snap([".releaserc.json"])).release_automation).toBe("PASS");
    expect(statuses(snap([".changeset/config.json"])).release_automation).toBe("PASS");
    expect(statuses(snap(["package.json"], { "package.json": '{"devDependencies":{"semantic-release":"^24"}}' })).release_automation).toBe("PASS");
    // Real shapes: sindresorhus/ky's script, expressjs/express's npm-publish.yml step.
    expect(statuses(snap(["package.json"], { "package.json": '{"scripts":{"release": "np","test":"xo && ava"}}' })).release_automation).toBe("PASS");
    expect(statuses(snap([".github/workflows/npm-publish.yml"], { ".github/workflows/npm-publish.yml": 'on:\n  release:\n    types: [published]\njobs:\n  publish:\n    steps:\n      - run: npm stage publish --tag "$NPM_DIST_TAG"\n' })).release_automation).toBe("PASS");
    // A test script that merely mentions "version" is not a release tool.
    expect(statuses(snap(["package.json"], { "package.json": '{"scripts":{"check-version":"node scripts/v.js"}}' })).release_automation).toBe("WARN");
  });

  it("an incomplete read never becomes a missing file", () => {
    const truncated = statuses(snap(["src/a.ts"], {}, { truncated: true }));
    expect(truncated.github_codeowners).toBe("INCONCLUSIVE");
    expect(truncated.release_automation).toBe("INCONCLUSIVE");
    // A workflow listed but not fetched may hold the release step.
    expect(statuses(snap([".github/workflows/release.yml"])).release_automation).toBe("INCONCLUSIVE");
    expect(evaluateRepoCollaborationChecks(snap([], {}, { accessible: false }))).toEqual([]);
  });
});

describe("assessCommitSigning", () => {
  const base = { defaultBranchRef: { name: "main" } };
  it("passes on a classic rule or a ruleset that requires signatures", () => {
    expect(assessCommitSigning({ ...base, branchProtectionRules: { nodes: [{ requiresCommitSignatures: true }] } }).status).toBe("PASS");
    expect(assessCommitSigning({
      ...base,
      branchProtectionRules: { nodes: [] },
      rulesets: { nodes: [{ enforcement: "ACTIVE", target: "BRANCH", conditions: { refName: { include: ["~DEFAULT_BRANCH"] } }, rules: { nodes: [{ type: "REQUIRED_SIGNATURES" }] } }] },
    }).status).toBe("PASS");
  });
  it("only an admin viewer can establish that signatures are not required", () => {
    const none = { ...base, branchProtectionRules: { nodes: [] }, rulesets: { nodes: [] } };
    expect(assessCommitSigning({ ...none, viewerPermission: "READ" }).status).toBe("INCONCLUSIVE");
    expect(assessCommitSigning({ ...none, viewerPermission: "ADMIN" }).status).toBe("WARN");
    // An evaluate-only ruleset enforces nothing.
    expect(assessCommitSigning({
      ...base, viewerPermission: "ADMIN", branchProtectionRules: { nodes: [] },
      rulesets: { nodes: [{ enforcement: "EVALUATE", target: "BRANCH", conditions: { refName: { include: ["~ALL"] } }, rules: { nodes: [{ type: "REQUIRED_SIGNATURES" }] } }] },
    }).status).toBe("WARN");
  });
});
