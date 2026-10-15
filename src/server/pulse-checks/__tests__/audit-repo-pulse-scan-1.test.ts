import { describe, expect, it, vi } from "vitest";

// Root listings and recursive paths taken from treeless clones of the real repos
// (git ls-tree HEAD) on 2026-10-14.

let rootEntries: { name: string; type: "file" | "dir" }[] = [];
let treePaths: string[] = [];

vi.mock("@/lib/github", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/github")>();
  return {
    ...actual,
    hasGithubToken: () => true,
    githubRateLimitedUntil: () => null,
    safeGithubRequest: async (path: string, fallback: unknown) =>
      /^\/repos\/[^/]+\/[^/]+\/contents$/.test(path) ? rootEntries : fallback,
  };
});

vi.mock("@/server/pulse-checks/native-repo", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/pulse-checks/native-repo")>();
  return {
    ...actual,
    detectRepoShape: async () => "none",
    getRepoSnapshot: async () => ({
      owner: "owner",
      repo: "repo",
      paths: treePaths,
      files: new Map<string, string>(),
      truncated: false,
      accessible: true,
    }),
  };
});

const { runGithubChecks } = await import("@/server/pulse-scan");

async function scan(root: string[], paths: string[] = []) {
  rootEntries = root.map((n) => ({ name: n.replace(/\/$/, ""), type: n.endsWith("/") ? "dir" : "file" }));
  treePaths = paths;
  const { checks } = await runGithubChecks("owner/repo");
  return new Map(checks.map((c) => [c.checkKey, c]));
}

const SPOON_KNIFE = ["README.md", "index.html", "styles.css"];

describe("has_contributing / has_code_of_conduct — .github/ and docs/ are recognised", () => {
  it("passes cli/cli, which keeps both files in .github/", async () => {
    const r = await scan(
      [".devcontainer/", ".github/", ".gitignore", ".golangci.yml", "AGENTS.md", "LICENSE", "Makefile", "README.md", "go.mod", "cmd/", "pkg/"],
      [".github/CODE-OF-CONDUCT.md", ".github/CONTRIBUTING.md", ".github/SECURITY.md", "go.mod", "README.md"],
    );
    expect(r.get("has_contributing")!.status).toBe("PASS");
    expect(r.get("has_code_of_conduct")!.status).toBe("PASS");
  });

  it("still warns kickstarter/ios-oss (.github holds only a PR template) and a deeply nested CoC", async () => {
    const r = await scan(
      [".circleci/", ".github/", ".gitignore", "LICENSE", "Makefile", "README.md", "packages/"],
      [".github/PULL_REQUEST_TEMPLATE.md", ".github/ksr-wordmark.svg", "packages/vendored-lib/CODE_OF_CONDUCT.md"],
    );
    expect(r.get("has_contributing")!.status).toBe("WARN");
    expect(r.get("has_code_of_conduct")!.status).toBe("WARN");
    expect(r.get("has_code_of_conduct")!.detail).not.toMatch(/marketplace/i);
  });
});

describe("dockerfile_present — compose/Dockerfile below the root", () => {
  it("passes supabase/supabase (docker/docker-compose.yml, apps/studio/Dockerfile)", async () => {
    const r = await scan(
      [".github/", ".gitignore", "AGENTS.md", "LICENSE", "Makefile", "README.md", "apps/", "docker/", "packages/"],
      ["docker/docker-compose.yml", "docker/docker-compose.pg17.yml", "apps/studio/Dockerfile"],
    );
    expect(r.get("dockerfile_present")!.status).toBe("PASS");
  });

  it("still warns when the only Dockerfiles are test or dev-container fixtures", async () => {
    const r = await scan(
      [".devcontainer/", ".github/", ".gitignore", "LICENSE", "README.md", "packages/"],
      [".devcontainer/Dockerfile", "packages/pg-meta/test/db/Dockerfile", ".agents/skills/sandbox/compose.yaml"],
    );
    expect(r.get("dockerfile_present")!.status).toBe("WARN");
  });
});

describe("dockerfile_present — files merely NAMED after Dockerfiles", () => {
  it("still warns when the only Docker-named paths are source or doc files", async () => {
    const r = await scan(
      [".github/", ".gitignore", "README.md", "go.mod", "pkg/", "docs/"],
      ["pkg/dockerfile/dockerfile.go", "docs/dockerfile.md", "src/generators/dockerfile.ts"],
    );
    expect(r.get("dockerfile_present")!.status).toBe("WARN");
  });

  it("passes a variant Dockerfile (apps/web/Dockerfile.prod)", async () => {
    const r = await scan([".gitignore", "README.md", "apps/"], ["apps/web/Dockerfile.prod"]);
    expect(r.get("dockerfile_present")!.status).toBe("PASS");
  });
});

describe("has_e2e_tests — nested Playwright config", () => {
  it("passes mattermost/desktop (e2e/playwright.config.ts)", async () => {
    const r = await scan(
      [".editorconfig", ".github/", ".gitignore", "AGENTS.md", "CHANGELOG.md", "LICENSE.txt", "Makefile", "README.md", "e2e/", "src/"],
      ["e2e/playwright.config.ts", "e2e/specs/startup/config.test.ts"],
    );
    expect(r.get("has_e2e_tests")!.status).toBe("PASS");
  });

  it("still warns ripgrep-style integration tests and a config that only lives in examples/", async () => {
    const r = await scan(
      [".github/", ".gitignore", "CHANGELOG.md", "Cargo.toml", "README.md", "examples/", "tests/"],
      ["tests/regression.rs", "examples/web-demo/playwright.config.ts"],
    );
    expect(r.get("has_e2e_tests")!.status).toBe("WARN");
  });
});

describe("has_coverage_config — .coveragerc and coverage workflows", () => {
  it("passes psf/requests (.coveragerc) and electron/fiddle (coveralls workflow)", async () => {
    const requests = await scan([".coveragerc", ".github/", ".gitignore", ".pre-commit-config.yaml", "HISTORY.md", "LICENSE", "README.md", "src/", "tests/"]);
    expect(requests.get("has_coverage_config")!.status).toBe("PASS");
    const fiddle = await scan(
      [".github/", ".gitignore", ".husky/", "CONTRIBUTING.md", "LICENSE.md", "README.md", "src/", "tests/", "vitest.config.ts"],
      [".github/workflows/coveralls.yml", ".github/workflows/test.yml"],
    );
    expect(fiddle.get("has_coverage_config")!.status).toBe("PASS");
  });

  it("still warns sindresorhus/np (no coverage tooling, plain CI workflow)", async () => {
    const r = await scan(
      [".editorconfig", ".gitattributes", ".github/", ".gitignore", ".npmrc", "license", "media/", "readme.md", "source/", "test/"],
      [".github/workflows/main.yml", ".github/pull_request_template.md"],
    );
    expect(r.get("has_coverage_config")!.status).toBe("WARN");
  });
});

describe("has_git_hooks — pre-commit and lefthook, status and detail agree", () => {
  it("passes psf/requests (.pre-commit-config.yaml) with a matching detail", async () => {
    const r = await scan([".coveragerc", ".github/", ".gitignore", ".pre-commit-config.yaml", "LICENSE", "README.md"]);
    expect(r.get("has_git_hooks")!.status).toBe("PASS");
    expect(r.get("has_git_hooks")!.detail).not.toMatch(/No pre-commit hooks/);
  });

  it("does not tell discourse (lefthook.yml) it has no hooks while passing it", async () => {
    const r = await scan([".github/", ".gitignore", "AGENTS.md", "CLAUDE.md", "README.md", "lefthook.yml"]);
    expect(r.get("has_git_hooks")!.status).toBe("PASS");
    expect(r.get("has_git_hooks")!.detail).not.toMatch(/No pre-commit hooks/);
  });

  it("still warns vercel/commerce (no hook manager)", async () => {
    const r = await scan([".env.example", ".gitignore", ".vscode/", "README.md", "app/", "components/", "lib/", "license.md", "next.config.ts", "tsconfig.json"]);
    expect(r.get("has_git_hooks")!.status).toBe("WARN");
  });
});

describe("has_changelog_file — names and wording", () => {
  it("passes a Python-style CHANGES.rst", async () => {
    const r = await scan([".gitignore", "CHANGES.rst", "LICENSE", "README.rst", "src/"]);
    expect(r.get("has_changelog_file")!.status).toBe("PASS");
  });

  it("warns cli/cli without claiming history cannot be tracked, and a 'newsroom' dir is not a changelog", async () => {
    const r = await scan([".github/", ".gitignore", "LICENSE", "Makefile", "README.md", "go.mod", "newsroom/"]);
    expect(r.get("has_changelog_file")!.status).toBe("WARN");
    expect(r.get("has_changelog_file")!.detail).not.toMatch(/can't track/);
  });
});

describe("has_changelog_file — root FILES only", () => {
  it("still warns a root news/ or releases/ DIRECTORY", async () => {
    const r = await scan([".gitignore", "README.md", "news/", "releases/", "src/"]);
    expect(r.get("has_changelog_file")!.status).toBe("WARN");
  });

  it("passes an extensionless root NEWS file", async () => {
    const r = await scan([".gitignore", "NEWS", "README.md", "src/"]);
    expect(r.get("has_changelog_file")!.status).toBe("PASS");
  });
});

describe("has_env_example — names and wording", () => {
  it("passes a .env.template", async () => {
    const r = await scan([".env.template", ".gitignore", "README.md", "src/"]);
    expect(r.get("has_env_example")!.status).toBe("PASS");
  });

  it("warns realworld-example-app without claiming its env setup is undocumented", async () => {
    const r = await scan([".eslintrc.json", ".gitignore", ".prettierrc", "Dockerfile", "README.md", "e2e/", "jest.config.ts", "nx.json", "src/", "tsconfig.json"]);
    expect(r.get("has_env_example")!.status).toBe("WARN");
    expect(r.get("has_env_example")!.detail).not.toMatch(/undocumented/);
  });
});

describe("has_gitignore — hygiene warning, not a failure", () => {
  it("warns (not fails) octocat/Spoon-Knife", async () => {
    const r = await scan(SPOON_KNIFE);
    expect(r.get("has_gitignore")!.status).toBe("WARN");
  });

  it("still passes darkreader, which has a .gitignore", async () => {
    const r = await scan([".gitattributes", ".github/", ".gitignore", "CHANGELOG.md", "CODE_OF_CONDUCT.md", "LICENSE", "README.md", "src/"]);
    expect(r.get("has_gitignore")!.status).toBe("PASS");
    expect(r.get("has_code_of_conduct")!.status).toBe("PASS");
  });
});
