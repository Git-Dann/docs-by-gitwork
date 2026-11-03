// @vitest-environment node
/**
 * Audit packet repo-pulse-scan-2 — repo shapes observed live (2026-10-14):
 *   tmoreton/tutorials (manifests + tsconfig only in subdirs), django/djangoproject.com
 *   (blog/migrations/), node-express-realworld (src/prisma/migrations/), calcom/cal.com
 *   (docs/api-reference/v2/openapi.json), expressjs/express (.github/dependabot.yml),
 *   immich-app/immich (org-default SECURITY.md), mattermost/desktop (package.json#jest).
 * Every case is two-sided: the observed true case must PASS, a genuine absence must still WARN.
 * No case may cost a GitHub API call beyond the shared snapshot (the quota is shared with
 * live scans), so organisation defaults and unread dependabot.yml files are reported as
 * caveats / INCONCLUSIVE rather than fetched.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as github from "@/lib/github";

type Entry = { name: string; type: "file" | "dir" };
type FakeRepo = {
  root: Entry[];
  paths: string[];
  packageJson?: string;
  /** Text of .github/dependabot.yml when the shared snapshot happens to carry it. */
  dependabotYml?: string;
};
let repo: FakeRepo;

vi.mock("@/lib/github", async (orig) => {
  const actual = await orig<typeof import("@/lib/github")>();
  return {
    ...actual,
    hasGithubToken: () => true,
    githubRateLimitedUntil: () => null,
    safeGithubRequest: vi.fn(async (path: string, fallback: unknown) => {
      if (/^\/repos\/[^/]+\/[^/]+\/contents$/.test(path)) return repo.root;
      return fallback;
    }),
  };
});

// getRepoSnapshot is replaced outright, so its owner/repo memo is never consulted and
// __clearRepoSnapshotMemo() is not needed between cases.
vi.mock("@/server/pulse-checks/native-repo", async (orig) => {
  const actual = await orig<typeof import("@/server/pulse-checks/native-repo")>();
  return {
    ...actual,
    detectRepoShape: vi.fn(async () => "none"),
    getRepoSnapshot: vi.fn(async (input: string) => {
      const [owner, name] = input.split("/");
      const files = new Map<string, string>();
      if (repo.packageJson) files.set("package.json", repo.packageJson);
      if (repo.dependabotYml !== undefined) files.set(".github/dependabot.yml", repo.dependabotYml);
      return { owner, repo: name, paths: repo.paths, files, truncated: false, accessible: true };
    }),
  };
});

import { runGithubChecks } from "@/server/pulse-scan";

const f = (name: string): Entry => ({ name, type: "file" });
const d = (name: string): Entry => ({ name, type: "dir" });

async function check(target: string, key: string) {
  const { checks } = await runGithubChecks(target, undefined, "none");
  const c = checks.find((x) => x.checkKey === key);
  if (!c) throw new Error(`check ${key} not emitted`);
  return c;
}

const SPOON_KNIFE: FakeRepo = {
  root: [f("README.md"), f("index.html"), f("styles.css")],
  paths: ["README.md", "index.html", "styles.css"],
};

beforeEach(() => {
  repo = SPOON_KNIFE;
  vi.mocked(github.safeGithubRequest).mockClear();
});

/** GitHub requests these checks must never add: the org .github repo or dependabot.yml. */
function extraGithubCalls(): string[] {
  return vi
    .mocked(github.safeGithubRequest)
    .mock.calls.map((c) => String(c[0]))
    .filter((p) => /^\/repos\/[^/]+\/\.github(\/|$)|dependabot/i.test(p));
}

describe("has_manifest / has_typescript look below the root", () => {
  const TUTORIALS: FakeRepo = {
    root: [d("agentcore"), d("app"), d("assets"), d("blogs"), d("proxy"), f(".gitignore"), f("CNAME"), f("README.md"), f("index.html")],
    paths: [
      ".gitignore", "CNAME", "README.md", "index.html",
      "proxy/.gitignore", "proxy/index.mjs", "proxy/package-lock.json", "proxy/package.json",
      "app/MyAgent/main.ts", "app/MyAgent/model.ts", "app/MyAgent/package.json", "app/MyAgent/tsconfig.json",
      "agentcore/agentcore.json",
    ],
  };

  it("PASSes tmoreton/tutorials, whose manifests and tsconfig live in subfolders", async () => {
    repo = TUTORIALS;
    expect((await check("tmoreton/tutorials", "has_manifest")).status).toBe("PASS");
    expect((await check("tmoreton/tutorials", "has_typescript")).status).toBe("PASS");
  });

  it("still WARNs a static repo with no manifest or tsconfig anywhere", async () => {
    expect((await check("octocat/Spoon-Knife", "has_manifest")).status).toBe("WARN");
    expect((await check("octocat/Spoon-Knife", "has_typescript")).status).toBe("WARN");
  });

  it("does not count a tsconfig that only exists under test/fixtures/", async () => {
    repo = { root: [f("index.js"), d("test")], paths: ["index.js", "test/fixtures/ts-project/tsconfig.json"] };
    expect((await check("acme/js-only", "has_typescript")).status).toBe("WARN");
  });

  it("does not count a tsconfig that only exists inside committed node_modules", async () => {
    repo = { root: [f("index.js"), d("node_modules")], paths: ["index.js", "node_modules/some-lib/tsconfig.json"] };
    expect((await check("acme/js-only", "has_typescript")).status).toBe("WARN");
  });
});

describe("has_migrations", () => {
  it("PASSes Django per-app migrations (djangoproject.com blog/migrations/)", async () => {
    repo = {
      root: [d("blog"), d("accounts"), f("manage.py"), f("pyproject.toml"), f("README.rst")],
      paths: ["manage.py", "pyproject.toml", "blog/models.py", "blog/migrations/__init__.py", "blog/migrations/0001_initial.py"],
    };
    expect((await check("django/djangoproject.com", "has_migrations")).status).toBe("PASS");
  });

  it("PASSes nested Prisma migrations (node-express-realworld src/prisma/migrations/)", async () => {
    repo = {
      root: [d("src"), d("e2e"), f("package.json"), f("nx.json")],
      paths: ["package.json", "src/prisma/schema.prisma", "src/prisma/migrations/20210924225358_initial/migration.sql", "src/prisma/migrations/migration_lock.toml"],
    };
    expect((await check("gothinkster/node-express-realworld-example-app", "has_migrations")).status).toBe("PASS");
  });

  it("does not treat a docs/migrations upgrade guide as database migrations", async () => {
    repo = { root: [d("docs"), f("package.json")], paths: ["package.json", "docs/migrations/upgrading-to-v2.md"] };
    expect((await check("acme/lib", "has_migrations")).status).toBe("WARN");
  });
});

describe("has_openapi_spec", () => {
  it("PASSes cal.com's docs/api-reference/v2/openapi.json", async () => {
    repo = { root: [d("apps"), d("docs"), d("packages"), f("package.json"), f("turbo.json")], paths: ["package.json", "docs/api-reference/v2/openapi.json"] };
    expect((await check("calcom/cal.com", "has_openapi_spec")).status).toBe("PASS");
  });

  it("still WARNs when no spec exists anywhere", async () => {
    expect((await check("octocat/Spoon-Knife", "has_openapi_spec")).status).toBe("WARN");
  });
});

describe("has_renovate (automated dependency updates)", () => {
  it("PASSes Dependabot (expressjs/express .github/dependabot.yml) without claiming Renovate only", async () => {
    repo = {
      root: [d(".github"), d("lib"), f("package.json")],
      paths: ["package.json", ".github/dependabot.yml", ".github/workflows/ci.yml"],
      dependabotYml: "version: 2\nupdates:\n  - package-ecosystem: github-actions\n    directory: /\n  - package-ecosystem: npm\n    directory: /\n",
    };
    const c = await check("expressjs/express", "has_renovate");
    expect(c.status).toBe("PASS");
    expect(c.detail).toMatch(/Dependabot/);
  });

  it("PASSes a root renovate.json (immich)", async () => {
    repo = { root: [f("renovate.json"), d("server")], paths: ["renovate.json", "server/package.json"] };
    expect((await check("immich-app/immich", "has_renovate")).status).toBe("PASS");
  });

  it("still WARNs a dependabot.yml that only bumps GitHub Actions pins", async () => {
    repo = {
      root: [d(".github"), f("package.json")],
      paths: ["package.json", ".github/dependabot.yml"],
      dependabotYml: "version: 2\nupdates:\n  - package-ecosystem: github-actions\n    directory: /\n  # - package-ecosystem: npm\n",
    };
    expect((await check("acme/app", "has_renovate")).status).toBe("WARN");
  });

  it("is INCONCLUSIVE (LOW) when dependabot.yml exists but the snapshot did not read it — no extra API call", async () => {
    repo = { root: [d(".github"), f("package.json")], paths: ["package.json", ".github/dependabot.yml"] };
    const c = await check("expressjs/express", "has_renovate");
    expect(c.status).toBe("INCONCLUSIVE");
    expect(c.confidence).toBe("LOW");
    expect(c.detail).toMatch(/did not read it/);
    expect(extraGithubCalls()).toEqual([]);
  });

  it("does not say 'No Dependabot config' for an actions-only dependabot.yml", async () => {
    repo = {
      root: [d(".github"), f("package.json")],
      paths: ["package.json", ".github/dependabot.yml"],
      dependabotYml: "version: 2\nupdates:\n  - package-ecosystem: github-actions\n",
    };
    expect((await check("acme/app", "has_renovate")).detail).toMatch(/only updates GitHub Actions pins/);
  });

  it("still WARNs a .github dir that only holds CI workflows", async () => {
    repo = { root: [d(".github"), f("package.json")], paths: ["package.json", ".github/workflows/ci.yml"] };
    expect((await check("acme/app", "has_renovate")).status).toBe("WARN");
  });
});

describe("has_security_md", () => {
  it("WARNs a repo with no local policy but names the org-default caveat, without probing the org repo", async () => {
    repo = { root: [d("server"), f("README.md")], paths: ["README.md", "server/package.json"] };
    const c = await check("immich-app/immich", "has_security_md");
    expect(c.status).toBe("WARN");
    expect(c.detail).toMatch(/immich-app\/\.github/);
    expect(c.detail).toMatch(/does not check organisation defaults/);
    expect(extraGithubCalls()).toEqual([]);
  });

  it("PASSes .github/SECURITY.md as a repo-local policy", async () => {
    repo = { root: [d(".github"), f("README.md")], paths: ["README.md", ".github/SECURITY.md"] };
    const c = await check("acme/app", "has_security_md");
    expect(c.status).toBe("PASS");
    expect(c.detail).toMatch(/^SECURITY\.md found/);
  });

  it("PASSes docs/SECURITY.md, but not one nested deeper", async () => {
    repo = { root: [d("docs"), f("README.md")], paths: ["README.md", "docs/SECURITY.md"] };
    expect((await check("acme/app", "has_security_md")).status).toBe("PASS");
    repo = { root: [d("packages"), f("README.md")], paths: ["README.md", "packages/x/SECURITY.md"] };
    expect((await check("acme/app", "has_security_md")).status).toBe("WARN");
  });
});

describe("has_unit_test_config", () => {
  it("PASSes mattermost/desktop's inline package.json jest block", async () => {
    repo = {
      root: [d("src"), f("package.json"), f("tsconfig.json")],
      paths: ["package.json", "tsconfig.json", "src/main/app.ts"],
      packageJson: '{\n  "name": "mattermost-desktop",\n  "scripts": { "test:unit": "jest" },\n  "jest": {\n    "testEnvironment": "node"\n  },\n  "devDependencies": { "jest": "29.4.1" }\n}',
    };
    expect((await check("mattermost/desktop", "has_unit_test_config")).status).toBe("PASS");
  });

  it("PASSes a nested vitest.config.mts in a workspace package", async () => {
    repo = { root: [d("packages"), f("package.json")], paths: ["package.json", "packages/web/vitest.config.mts"] };
    expect((await check("acme/mono", "has_unit_test_config")).status).toBe("PASS");
  });

  it("still WARNs a jest plugin whose only object-valued jest key is nested (eslint-plugin-jest)", async () => {
    repo = {
      root: [f("index.js"), f("package.json")],
      paths: ["index.js", "package.json"],
      packageJson:
        '{"name":"eslint-plugin-jest","peerDependencies":{"jest":"*"},"peerDependenciesMeta":{"jest":{"optional":true}}}',
    };
    expect((await check("jest-community/eslint-plugin-jest", "has_unit_test_config")).status).toBe("WARN");
  });

  it("still WARNs a package.json with no jest/vitest config", async () => {
    repo = {
      root: [f("index.js"), f("package.json")],
      paths: ["index.js", "package.json"],
      packageJson: '{"name":"x","scripts":{"start":"node index.js"}}',
    };
    expect((await check("acme/plain", "has_unit_test_config")).status).toBe("WARN");
  });
});
