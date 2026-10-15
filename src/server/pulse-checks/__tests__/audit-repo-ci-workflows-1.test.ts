import { describe, it, expect } from "vitest";
import { evaluateCiWorkflowChecks } from "../ci-workflows";
import type { RepoSnapshot } from "../native-mobile";

function snap(files: Record<string, string>, owner = "o", repo = "r"): RepoSnapshot {
  return {
    owner,
    repo,
    paths: Object.keys(files),
    files: new Map(Object.entries(files)),
    truncated: false,
    accessible: true,
  };
}

function check(files: Record<string, string>, key: string, owner?: string, repo?: string) {
  const c = evaluateCiWorkflowChecks(snap(files, owner, repo)).find((x) => x.checkKey === key);
  if (!c) throw new Error(`no check emitted for ${key}`);
  return c;
}

// ── ci_actions_branch_ref (clash-verge-rev/clash-verge-rev autobuild.yml) ──────
const AUTOBUILD = `name: Auto Build
on:
  push:
    branches: [dev]
permissions:
  contents: read
jobs:
  check_commit:
    uses: clash-verge-rev/clash-verge-rev/.github/workflows/check-commit-needs-build.yml@dev
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
`;

describe("ci_actions_branch_ref", () => {
  it("does not treat the repository's own reusable workflow @branch as an upstream action", () => {
    const c = check({ ".github/workflows/autobuild.yml": AUTOBUILD }, "ci_actions_branch_ref", "clash-verge-rev", "clash-verge-rev");
    expect(c.status).toBe("PASS");
  });

  it("still fails a real upstream branch ref, without claiming it is the default branch", () => {
    const wf = AUTOBUILD + "      - name: Install Rust Stable\n        uses: dtolnay/rust-toolchain@master\n";
    const c = check({ ".github/workflows/autobuild.yml": wf }, "ci_actions_branch_ref", "clash-verge-rev", "clash-verge-rev");
    expect(c.status).toBe("FAIL");
    expect(c.detail).toContain("dtolnay/rust-toolchain@master");
    expect(c.detail).not.toContain("check-commit-needs-build");
    expect(c.detail).not.toContain("default branch");
  });

  it("still fails a reusable workflow from ANOTHER repository on a branch", () => {
    const wf = `name: PR Test Analysis
on:
  pull_request:
permissions:
  contents: read
jobs:
  analyze:
    uses: mattermost/mattermost-test-automation-toolkit/.github/workflows/pr-test-analysis.yml@main
`;
    expect(check({ ".github/workflows/pr-test-analysis.yml": wf }, "ci_actions_branch_ref", "mattermost", "desktop").status).toBe("FAIL");
  });
});

// ── ci_deploy_concurrency (BurntSushi/ripgrep release.yml; supabase) ────────────
describe("ci_deploy_concurrency", () => {
  it("does not grade a tag-only release workflow, which merges cannot start", () => {
    const wf = `name: release
on:
  push:
    tags:
    - "[0-9]+.[0-9]+.[0-9]+"
permissions:
  contents: write
jobs:
  create-release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: gh release create $VERSION --draft --verify-tag --title $VERSION
`;
    expect(check({ ".github/workflows/release.yml": wf }, "ci_deploy_concurrency").status).toBe("SKIPPED");
  });

  it("still warns on a branch-push deploy without concurrency, and omits a cron-only publish", () => {
    const deploy = `name: Deploy Braintrust scorers
on:
  push:
    branches: [master]
    paths:
      - "apps/studio/evals/scorer.ts"
permissions:
  contents: read
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npx braintrust push apps/studio/evals/scorer.ts
`;
    const cron = `name: Publish image
on:
  schedule:
    - cron: '0 4 * * 1'
  workflow_dispatch:
permissions:
  contents: read
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - run: docker push supabase/studio:latest
`;
    const c = check(
      { ".github/workflows/braintrust-scorers-deploy.yml": deploy, ".github/workflows/publish_image.yml": cron },
      "ci_deploy_concurrency",
    );
    expect(c.status).toBe("WARN");
    expect(c.detail).toContain("braintrust-scorers-deploy.yml");
    expect(c.detail).not.toContain("publish_image.yml");
  });
});

describe("ci_deploy_concurrency — what the release/publish exclusion must not drop", () => {
  it("still warns on a dispatch-only deploy workflow (two clicks race like two merges)", () => {
    const wf = `name: Deploy to production
on:
  workflow_dispatch:
permissions:
  contents: read
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - run: ./deploy.sh
`;
    const c = check({ ".github/workflows/deploy.yml": wf }, "ci_deploy_concurrency");
    expect(c.status).toBe("WARN");
    expect(c.detail).toContain("deploy.yml");
  });

  it("still warns on an every-branch publish whose docker step has a tags: input", () => {
    const wf = `name: Publish docker
on:
  push:
permissions:
  contents: read
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: docker/build-push-action@v6
        with:
          push: true
          tags: user/app:latest
`;
    const c = check({ ".github/workflows/publish-docker.yml": wf }, "ci_deploy_concurrency");
    expect(c.status).toBe("WARN");
  });
});

// ── ci_token_permissions (electron/fiddle) ──────────────────────────────────────
describe("ci_token_permissions", () => {
  it("does not require a permissions block in a workflow_call-only reusable workflow", () => {
    const reusable = `name: Test
on:
  workflow_call:
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: yarn test
`;
    const caller = `name: CI
on:
  push:
    branches: [main]
  pull_request:
jobs:
  test:
    permissions:
      contents: read
    uses: ./.github/workflows/test.yml
`;
    const c = check({ ".github/workflows/ci.yml": caller, ".github/workflows/test.yml": reusable }, "ci_token_permissions");
    expect(c.status).toBe("PASS");
  });

  it("still warns on a directly triggered workflow with no permissions (sindresorhus/np main.yml)", () => {
    const wf = `name: CI
on:
  - push
  - pull_request
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - run: npm test
`;
    const c = check({ ".github/workflows/main.yml": wf }, "ci_token_permissions");
    expect(c.status).toBe("WARN");
    expect(c.detail).toContain("main.yml");
  });
});

// ── ci_plaintext_downloads (cli/cli, discourse, clash-verge-rev) ────────────────
describe("ci_plaintext_downloads", () => {
  it("ignores a shell prefix-strip and a .local service container", () => {
    const wf = `name: Triage
on: push
jobs:
  a:
    runs-on: ubuntu-latest
    steps:
      - run: |
          GH_HOST="\${GH_HOST#https://}"
          GH_HOST="\${GH_HOST#http://}"
      - run: curl --fail --retry 10 --retry-connrefused --retry-delay 1 http://minio.local:9000/minio/health/ready
`;
    expect(check({ ".github/workflows/issue-triage.lock.yml": wf }, "ci_plaintext_downloads").status).toBe("PASS");
  });

  it("still warns on a real plaintext mirror URL", () => {
    const wf = `name: Build
on: push
jobs:
  a:
    runs-on: ubuntu-latest
    steps:
      - run: echo "deb [arch=amd64] http://archive.ubuntu.com/ubuntu jammy main" | sudo tee /etc/apt/sources.list.d/amd64.list
`;
    expect(check({ ".github/workflows/autobuild.yml": wf }, "ci_plaintext_downloads").status).toBe("WARN");
  });
});

// ── ci_unpinned_images (immich-app/immich docker.yml; django/djangoproject.com) ──
describe("ci_unpinned_images", () => {
  it("ignores image: as a reusable-workflow input and as a matrix axis", () => {
    const wf = `name: Docker
on:
  push:
    branches: [main]
permissions: {}
jobs:
  server:
    uses: immich-app/devtools/.github/workflows/multi-runner-build.yml@4d420cf8e5ea499f99b2c2849ff9a219d5f7b178
    permissions:
      contents: read
    with:
      image: immich-server
      context: .
  mirror:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        image: [immich-server]
    steps:
      - run: echo mirror
`;
    expect(check({ ".github/workflows/docker.yml": wf }, "ci_unpinned_images").status).toBe("SKIPPED");
  });

  it("still warns on a tag-pinned service container", () => {
    const wf = `name: Tests
on: push
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:17-trixie
        env:
          POSTGRES_PASSWORD: postgres
    steps:
      - run: make ci
`;
    const c = check({ ".github/workflows/tests.yml": wf }, "ci_unpinned_images");
    expect(c.status).toBe("WARN");
    expect(c.detail).toContain("postgres:17-trixie");
  });

  it("still warns on a tagged image passed to a docker-run action", () => {
    const wf = `name: Run
on: push
jobs:
  a:
    runs-on: ubuntu-latest
    steps:
      - uses: addnab/docker-run-action@v3
        with:
          image: alpine:3.19
          run: echo hi
`;
    const c = check({ ".github/workflows/run.yml": wf }, "ci_unpinned_images");
    expect(c.status).toBe("WARN");
    expect(c.detail).toContain("alpine:3.19");
  });

  it("still warns on a tagged matrix image used as the job container", () => {
    const wf = `name: Matrix
on: push
jobs:
  a:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        image: [node:18]
    container: \${{ matrix.image }}
    steps:
      - run: node --version
`;
    const c = check({ ".github/workflows/matrix.yml": wf }, "ci_unpinned_images");
    expect(c.status).toBe("WARN");
    expect(c.detail).toContain("node:18");
  });
});

// ── ci_runs_tests (ripgrep, NetNewsWire, djangoproject.com) ─────────────────────
const job = (run: string) => `name: CI
on: push
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: step
        run: |
${run
  .split("\n")
  .map((l) => "          " + l)
  .join("\n")}
`;

describe("ci_runs_tests", () => {
  it("recognises an env-indirected cargo test (ripgrep)", () => {
    const wf = job("${{ env.CARGO }} test --verbose --workspace --features unstable-index ${{ env.TARGET_FLAGS }}");
    expect(check({ ".github/workflows/ci.yml": wf }, "ci_runs_tests").status).toBe("PASS");
  });

  it("recognises a multi-line xcodebuild ... test (NetNewsWire)", () => {
    const wf = job(
      [
        "xcodebuild \\",
        "  -project NetNewsWire.xcodeproj \\",
        "  -scheme NetNewsWire \\",
        "  -testPlan NetNewsWire-CI \\",
        '  -destination "platform=macOS,arch=arm64" \\',
        '  test 2>&1 | tee "$build_log" | xcbeautify --renderer github-actions',
      ].join("\n"),
    );
    expect(check({ ".github/workflows/ci.yml": wf }, "ci_runs_tests").status).toBe("PASS");
  });

  it("recognises make ci (djangoproject.com)", () => {
    const wf = job('make ci TEST_ARGS="--browser chromium --browser firefox"\ncoverage xml');
    expect(check({ ".github/workflows/tests.yml": wf }, "ci_runs_tests").status).toBe("PASS");
  });

  it("still warns when CI only builds", () => {
    const wf = job(
      [
        "${{ env.CARGO }} build --verbose --workspace",
        "xcodebuild \\",
        "  -scheme NetNewsWire \\",
        "  -testPlan NetNewsWire-CI \\",
        "  build",
        "make build",
      ].join("\n"),
    );
    expect(check({ ".github/workflows/ci.yml": wf }, "ci_runs_tests").status).toBe("WARN");
  });

  it("does not read -scheme Test / test-results / a later `test -f` as the xcodebuild action", () => {
    const wf = job(
      [
        "xcodebuild \\",
        "  -scheme Test \\",
        "  -resultBundlePath test-results \\",
        "  build",
        "test -f build/output.app",
      ].join("\n"),
    );
    expect(check({ ".github/workflows/ci.yml": wf }, "ci_runs_tests").status).toBe("WARN");
  });

  it("recognises a single-line xcodebuild ... test", () => {
    const wf = job("xcodebuild -scheme App test");
    expect(check({ ".github/workflows/ci.yml": wf }, "ci_runs_tests").status).toBe("PASS");
  });
});

// ── package.json script expansion must only follow scripts that really run ──────
describe("ci_runs_lint / ci_runs_tests — built-in package-manager commands", () => {
  const wf = job("npm ci\nnpm run build");
  const pkg = JSON.stringify({ scripts: { ci: "eslint . && jest", build: "tsc" } });

  it("does not credit `npm ci` with the package.json script named ci", () => {
    const files = { ".github/workflows/ci.yml": wf, "package.json": pkg };
    expect(check(files, "ci_runs_lint").status).toBe("WARN");
    expect(check(files, "ci_runs_tests").status).toBe("WARN");
  });

  it("does credit `npm run ci`, which really runs that script", () => {
    const files = { ".github/workflows/ci.yml": job("npm run ci"), "package.json": pkg };
    expect(check(files, "ci_runs_lint").status).toBe("PASS");
    expect(check(files, "ci_runs_tests").status).toBe("PASS");
  });
});

// ── ci_runs_lint (sindresorhus/np) ──────────────────────────────────────────────
describe("ci_runs_lint", () => {
  const npMain = `name: CI
on:
  - push
  - pull_request
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v6
      - run: npm install
      - run: npm test
`;

  it("sees the linter inside the package.json script that npm test runs", () => {
    const c = check(
      { ".github/workflows/main.yml": npMain, "package.json": JSON.stringify({ scripts: { test: "xo && ava" } }) },
      "ci_runs_lint",
    );
    expect(c.status).toBe("PASS");
  });

  it("still warns when the invoked script runs tests only", () => {
    const c = check(
      { ".github/workflows/main.yml": npMain, "package.json": JSON.stringify({ scripts: { test: "ava" } }) },
      "ci_runs_lint",
    );
    expect(c.status).toBe("WARN");
  });
});

// ── ci_security_scanning (supabase/supabase zizmor.yml) ─────────────────────────
describe("ci_security_scanning", () => {
  it("recognises zizmor", () => {
    const wf = `name: GitHub Actions Security Analysis with zizmor
on:
  push:
    branches: [master]
permissions:
  contents: read
jobs:
  zizmor:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: zizmor --format=sarif . > results.sarif
`;
    expect(check({ ".github/workflows/zizmor.yml": wf }, "ci_security_scanning").status).toBe("PASS");
  });

  it("still warns when nothing scans", () => {
    const wf = `name: CI
on: push
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - run: npm test
`;
    expect(check({ ".github/workflows/main.yml": wf }, "ci_security_scanning").status).toBe("WARN");
  });
});

// ── ci_dependency_cache (cli/cli setup-go; nowinandroid setup-gradle) ───────────
describe("ci_dependency_cache", () => {
  const goJob = (uses: string, extra = "") => `name: Lint
on: push
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Set up Go
        uses: ${uses}
        with:
          go-version-file: 'go.mod'
${extra}      - run: go build ./...
`;

  it("treats SHA-pinned setup-go v7 as caching by default", () => {
    const wf = goJob("actions/setup-go@b7ad1dad31e06c5925ef5d2fc7ad053ef454303e # v7.0.0");
    expect(check({ ".github/workflows/lint.yml": wf }, "ci_dependency_cache").status).toBe("PASS");
  });

  it("treats gradle/actions/setup-gradle as caching by default", () => {
    const wf = `name: Build
on: push
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup Gradle
        uses: gradle/actions/setup-gradle@v4
      - run: ./gradlew assembleDebug
`;
    expect(check({ ".github/workflows/Build.yaml": wf }, "ci_dependency_cache").status).toBe("PASS");
  });

  it("still warns for setup-go v3 and for setup-go with cache disabled", () => {
    expect(check({ ".github/workflows/a.yml": goJob("actions/setup-go@v3") }, "ci_dependency_cache").status).toBe("WARN");
    expect(
      check({ ".github/workflows/a.yml": goJob("actions/setup-go@v5", "          cache: false\n") }, "ci_dependency_cache").status,
    ).toBe("WARN");
  });
});
