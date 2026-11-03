import { describe, it, expect, vi } from "vitest";
import { evaluateCiWorkflowChecks } from "../ci-workflows";
import type { RepoSnapshot } from "../native-mobile";

let files: Record<string, string> = {};
let unreadable = new Set<string>();

vi.mock("@/lib/github", () => ({
  safeGithubRequest: vi.fn(async (path: string) => {
    if (path.includes("/git/trees/")) {
      return { tree: Object.keys(files).map((p) => ({ path: p, type: "blob", size: files[p].length })) };
    }
    const m = path.match(/\/contents\/(.+)$/);
    const p = m ? decodeURIComponent(m[1]) : "";
    if (p in files && !unreadable.has(p)) return { content: Buffer.from(files[p], "utf-8").toString("base64"), encoding: "base64" };
    return {};
  }),
}));

const { scanRepoSecrets } = await import("@/server/pulse-agents/secret-scanner");

function check(wfs: Record<string, string>, key: string) {
  const snapshot: RepoSnapshot = {
    owner: "o",
    repo: "r",
    paths: Object.keys(wfs),
    files: new Map(Object.entries(wfs)),
    truncated: false,
    accessible: true,
  };
  const c = evaluateCiWorkflowChecks(snapshot).find((x) => x.checkKey === key);
  if (!c) throw new Error(`no check emitted for ${key}`);
  return c;
}

const stepWith = (uses: string, image: string) => `name: Run
on: push
jobs:
  a:
    runs-on: ubuntu-latest
    steps:
      - name: step
        uses: ${uses}
        with:
          image: ${image}
          run: echo hi
`;

describe("ci_unpinned_images: bare names that are PULLED stay graded", () => {
  it("warns on a bare image a docker-run action pulls (resolves to :latest)", () => {
    const c = check({ ".github/workflows/run.yml": stepWith("addnab/docker-run-action@v3", "alpine") }, "ci_unpinned_images");
    expect(c.status).toBe("WARN");
    expect(c.detail).toContain("alpine");
  });

  it("does not grade a bare name passed to an image-BUILDING action", () => {
    const c = check(
      { ".github/workflows/build.yml": stepWith("redhat-actions/buildah-build@v2", "my-app") },
      "ci_unpinned_images",
    );
    expect(c.status).toBe("SKIPPED");
  });

  it("finds the step's uses: when it follows with:", () => {
    const wf = `name: Run
on: push
jobs:
  a:
    runs-on: ubuntu-latest
    steps:
      - name: step
        with:
          image: alpine
        uses: addnab/docker-run-action@v3
`;
    expect(check({ ".github/workflows/run.yml": wf }, "ci_unpinned_images").status).toBe("WARN");
  });

  it("warns on a bare matrix image the job runs in", () => {
    const wf = `name: Matrix
on: push
jobs:
  a:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        image: [ubuntu]
    container: \${{ matrix.image }}
    steps:
      - run: uname -a
`;
    const c = check({ ".github/workflows/m.yml": wf }, "ci_unpinned_images");
    expect(c.status).toBe("WARN");
    expect(c.detail).toContain("ubuntu");
  });

  it("warns on a bare matrix image a step pulls with docker run", () => {
    const wf = `name: Matrix
on: push
jobs:
  a:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        image: [alpine]
    steps:
      - run: docker run --rm \${{ matrix.image }} uname -a
`;
    expect(check({ ".github/workflows/m.yml": wf }, "ci_unpinned_images").status).toBe("WARN");
  });

  it("does not grade a bare matrix value nothing pulls", () => {
    const wf = `name: Matrix
on: push
jobs:
  a:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        image: [server]
    steps:
      - run: echo \${{ matrix.image }}
`;
    expect(check({ ".github/workflows/m.yml": wf }, "ci_unpinned_images").status).toBe("SKIPPED");
  });
});

describe("ci_token_permissions with only reusable workflows", () => {
  it("does not claim every workflow declares a permissions block when none were graded", () => {
    const wf = `name: Shared
on:
  workflow_call:
    inputs:
      x:
        type: string
jobs:
  a:
    runs-on: ubuntu-latest
    steps:
      - run: echo hi
`;
    const c = check({ ".github/workflows/shared.yml": wf }, "ci_token_permissions");
    expect(c.status).toBe("PASS");
    expect(c.detail).not.toContain("Every workflow declares an explicit permissions block");
    expect(c.detail).toContain("reusable workflow");
  });

  it("still warns when a non-reusable workflow has no permissions block", () => {
    const wf = `name: CI
on: push
jobs:
  a:
    runs-on: ubuntu-latest
    steps:
      - run: echo hi
`;
    expect(check({ ".github/workflows/ci.yml": wf }, "ci_token_permissions").status).toBe("WARN");
  });
});

describe("ci_runs_lint: linting the workflows is not linting the project", () => {
  const wf = (run: string) => `name: CI
on: push
jobs:
  a:
    runs-on: ubuntu-latest
    steps:
      - run: ${run}
`;
  it("does not count actionlint alone as the project's linter", () => {
    expect(check({ ".github/workflows/ci.yml": wf("actionlint") }, "ci_runs_lint").status).toBe("WARN");
  });
  it("still counts a real project linter", () => {
    expect(check({ ".github/workflows/ci.yml": wf("npx eslint .") }, "ci_runs_lint").status).toBe("PASS");
  });
});

describe("repo_env_committed: an empty env file was read", () => {
  it("does not report an empty committed .env as unreadable", async () => {
    files = { ".env": "" };
    const { checks } = await scanRepoSecrets("o", "r");
    const c = checks.find((x) => x.checkKey === "repo_env_committed")!;
    expect(c.status).toBe("WARN");
    expect(c.detail).not.toContain("could not be read");
  });

  it("still reports an env file whose content fetch failed as unread", async () => {
    files = { ".env": "" };
    unreadable = new Set([".env"]);
    const { checks } = await scanRepoSecrets("o", "r");
    unreadable = new Set();
    const c = checks.find((x) => x.checkKey === "repo_env_committed")!;
    expect(c.status).toBe("WARN");
    expect(c.detail).toContain("1 could not be read");
  });
});

describe("repo_env_committed: a reference to where a secret lives is not a secret", () => {
  async function env(text: string) {
    files = { ".env": text };
    const { checks } = await scanRepoSecrets("o", "r");
    return checks.find((x) => x.checkKey === "repo_env_committed")!;
  }

  it("WARNs (not FAILs) on a credentials file path and a plain key URL", async () => {
    const c = await env("GOOGLE_APPLICATION_CREDENTIALS=./service-account.json\nJWKS_KEY_URL=https://auth.acme.io/.well-known/jwks.json\n");
    expect(c.status).toBe("WARN");
  });

  it("still FAILs a secret-named URL that carries an inline password", async () => {
    expect((await env("DB_PASSWORD_URL=postgres://app:s3cretPw9@db.acme.io/app\n")).status).toBe("FAIL");
  });

  it("still FAILs a literal key value", async () => {
    expect((await env("ENCRYPTION_KEY=q8Zr2LmN4vB7xT1pQ9sW\n")).status).toBe("FAIL");
  });

  it("FAILs a random base64 secret that happens to start with '/'", async () => {
    expect((await env("JWT_SECRET=/Kq9vX2mB7rT4pL8nZ1wQ3sY6hA0cE5f\n")).status).toBe("FAIL");
  });

  it("still WARNs on an absolute path to a mounted secret", async () => {
    expect((await env("DB_PASSWORD_FILE=/run/secrets/db_password\n")).status).toBe("WARN");
  });

  it("FAILs a webhook URL whose path is the credential, whatever the variable is called", async () => {
    const c = await env("SLACK_WEBHOOK_URL=https://" + "hooks.slack" + ".com/services/T0A1B2C3D/B0E4F5G6H/q8Zr2LmN4vB7xT1pQ9sWa1b2\n");
    expect(c.status).toBe("FAIL");
  });

  it("FAILs a URL carrying a token in its query string", async () => {
    expect((await env("FEED_URL=https://api.acme.io/feed?token=q8Zr2LmN4vB7xT1p\n")).status).toBe("FAIL");
  });

  it("still WARNs on a plain public URL with no credential in it", async () => {
    expect((await env("API_BASE_URL=https://api.acme.io/v1?page=2\n")).status).toBe("WARN");
  });
});
