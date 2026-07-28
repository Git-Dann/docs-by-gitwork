import { describe, it, expect } from "vitest";
import { githubRepoLabel, hasGithubToken, normalizeGithubRepo, parseGithubRepo } from "../github";

// People paste whatever the address bar or `git remote -v` gave them. Every form
// below is one someone has actually typed into the Pulse scan field.

describe("parseGithubRepo", () => {
  const OWNER_REPO = { owner: "Git-Dann", repo: "Fellas-AndroidMobileApp" };

  it("accepts the plain owner/repo form", () => {
    expect(parseGithubRepo("Git-Dann/Fellas-AndroidMobileApp")).toEqual(OWNER_REPO);
  });

  it("accepts full URLs, bare hosts, www and http", () => {
    for (const input of [
      "https://github.com/Git-Dann/Fellas-AndroidMobileApp",
      "http://github.com/Git-Dann/Fellas-AndroidMobileApp",
      "github.com/Git-Dann/Fellas-AndroidMobileApp",
      "www.github.com/Git-Dann/Fellas-AndroidMobileApp",
      "https://www.github.com/Git-Dann/Fellas-AndroidMobileApp/",
    ]) {
      expect(parseGithubRepo(input), input).toEqual(OWNER_REPO);
    }
  });

  it("accepts SSH remotes and a trailing .git", () => {
    for (const input of [
      "git@github.com:Git-Dann/Fellas-AndroidMobileApp.git",
      "ssh://git@github.com/Git-Dann/Fellas-AndroidMobileApp.git",
      "https://github.com/Git-Dann/Fellas-AndroidMobileApp.git",
      "Git-Dann/Fellas-AndroidMobileApp.git",
    ]) {
      expect(parseGithubRepo(input), input).toEqual(OWNER_REPO);
    }
  });

  it("discards deep links to a branch, file or PR", () => {
    for (const input of [
      "https://github.com/Git-Dann/Fellas-AndroidMobileApp/tree/disable-mobile-data",
      "https://github.com/Git-Dann/Fellas-AndroidMobileApp/blob/master/pubspec.yaml",
      "https://github.com/Git-Dann/Fellas-AndroidMobileApp/pull/12",
      "https://github.com/Git-Dann/Fellas-AndroidMobileApp/settings/branches",
    ]) {
      expect(parseGithubRepo(input), input).toEqual(OWNER_REPO);
    }
  });

  // The bug this fix exists for: the scan header stored the full URL and then
  // prefixed `github.com/` again, producing this. Taking the LAST host occurrence
  // means the doubled form still resolves to the real repo.
  it("recovers from a doubled host prefix", () => {
    expect(parseGithubRepo("github.com/https://github.com/Git-Dann/Fellas-AndroidMobileApp")).toEqual(OWNER_REPO);
  });

  it("tolerates surrounding whitespace and a stray @", () => {
    expect(parseGithubRepo("  @Git-Dann/Fellas-AndroidMobileApp  ")).toEqual(OWNER_REPO);
  });

  it("rejects things that are not a repo reference", () => {
    for (const input of [
      "",
      "   ",
      "Git-Dann",
      "https://github.com/Git-Dann",
      "https://example.com/foo/bar/baz".replace("example.com", "notgithub.example"),
      "https://github.com/features/actions",
      "https://github.com/orgs/Git-Dann/repositories",
    ]) {
      expect(parseGithubRepo(input), `should reject: ${input}`).toBeNull();
    }
  });

  it("does not treat a non-GitHub host's path as a repo", () => {
    // A GitHub parser must not silently accept another forge. Two path segments on
    // another host would otherwise parse as owner `gitlab.com`, repo `group`.
    expect(parseGithubRepo("https://gitlab.com/group/project")).toBeNull();
    expect(parseGithubRepo("https://bitbucket.org/team/repo")).toBeNull();
  });
});

describe("normalizeGithubRepo", () => {
  it("canonicalises every accepted form to owner/repo", () => {
    for (const input of [
      "Git-Dann/FellasRebuild",
      "https://github.com/Git-Dann/FellasRebuild",
      "git@github.com:Git-Dann/FellasRebuild.git",
      "github.com/Git-Dann/FellasRebuild/tree/main",
    ]) {
      expect(normalizeGithubRepo(input), input).toBe("Git-Dann/FellasRebuild");
    }
  });

  it("returns null for unparseable input so callers can reject it", () => {
    expect(normalizeGithubRepo("not a repo")).toBeNull();
  });
});

describe("githubRepoLabel", () => {
  it("renders one github.com/ prefix regardless of what was stored", () => {
    // Historical rows stored the full URL; those must not render doubled.
    expect(githubRepoLabel("Git-Dann/FellasRebuild")).toBe("github.com/Git-Dann/FellasRebuild");
    expect(githubRepoLabel("https://github.com/Git-Dann/FellasRebuild")).toBe("github.com/Git-Dann/FellasRebuild");
    expect(githubRepoLabel("github.com/https://github.com/Git-Dann/FellasRebuild")).toBe(
      "github.com/Git-Dann/FellasRebuild",
    );
  });

  it("falls back to the raw value rather than hiding an unparseable one", () => {
    expect(githubRepoLabel("something odd")).toBe("something odd");
  });
});

describe("hasGithubToken", () => {
  // The whole point: a missing token must be distinguishable from "repo has no files",
  // because they need completely different fixes and looked identical in production.
  it("reports presence without ever returning the value", () => {
    const original = process.env.GITHUB_TOKEN;
    try {
      delete process.env.GITHUB_TOKEN;
      expect(hasGithubToken()).toBe(false);

      process.env.GITHUB_TOKEN = "   ";
      expect(hasGithubToken(), "whitespace is not a token").toBe(false);

      process.env.GITHUB_TOKEN = "github_pat_example";
      expect(hasGithubToken()).toBe(true);
    } finally {
      if (original === undefined) delete process.env.GITHUB_TOKEN;
      else process.env.GITHUB_TOKEN = original;
    }
  });
});
