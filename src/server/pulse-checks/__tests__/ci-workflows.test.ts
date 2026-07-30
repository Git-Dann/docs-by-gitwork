import { describe, it, expect } from "vitest";
import {
  CI_CHECK_KEYS,
  evaluateCiWorkflowChecks,
  runBodies,
  stripYamlComments,
  triggers,
  usesRefs,
} from "../ci-workflows";
import type { RepoSnapshot } from "../native-mobile";

function snap(files: Record<string, string>): RepoSnapshot {
  return {
    owner: "o",
    repo: "r",
    paths: Object.keys(files),
    files: new Map(Object.entries(files)),
    truncated: false,
    accessible: true,
  };
}

const byKey = (checks: ReturnType<typeof evaluateCiWorkflowChecks>, key: string) => {
  const c = checks.find((x) => x.checkKey === key);
  if (!c) throw new Error(`no check emitted for ${key}`);
  return c;
};

// A workflow that is fine. Used as the negative control for every rule below —
// a rule that fires on this is a rule that would fire on half of GitHub.
const CLEAN = `
name: CI
on:
  push:
    branches: [main]
permissions:
  contents: read
concurrency:
  group: ci-\${{ github.ref }}
jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    strategy:
      matrix:
        node: [20, 22]
    steps:
      - uses: actions/checkout@v4
        with:
          persist-credentials: false
      - uses: pnpm/action-setup@a3252b78c470c02df07e9d59298aecedc3ccdd6d # v4.0.0
      - run: npm ci
      - run: npm run lint
      - run: npm test
`;

describe("YAML reading", () => {
  it("strips comments without truncating values that contain #", () => {
    const out = stripYamlComments('uses: a/b@sha256:ab#cd\nfoo: bar # a comment\n# whole line');
    expect(out).toContain("a/b@sha256:ab#cd");
    expect(out).toContain("foo: bar");
    expect(out).not.toContain("a comment");
  });

  it("keeps a # inside a quoted string", () => {
    expect(stripYamlComments(`run: echo "tag #1"`)).toContain('"tag #1"');
  });

  it("reads both inline and block run bodies", () => {
    const bodies = runBodies("jobs:\n  a:\n    steps:\n      - run: echo one\n      - run: |\n          echo two\n          echo three\n      - uses: x/y@v1\n");
    expect(bodies.some((b) => b.includes("echo one"))).toBe(true);
    expect(bodies.some((b) => b.includes("echo two") && b.includes("echo three"))).toBe(true);
  });

  it("reads triggers in inline, list and block form", () => {
    expect(triggers("on: push\n")).toContain("push");
    expect(triggers("on: [push, pull_request]\n")).toEqual(expect.arrayContaining(["push", "pull_request"]));
    expect(triggers("on:\n  pull_request_target:\n    types: [opened]\n")).toContain("pull_request_target");
  });

  it("reads uses refs", () => {
    expect(usesRefs("      - uses: actions/checkout@v4\n").map((u) => u.ref)).toEqual(["actions/checkout@v4"]);
  });
});

describe("no workflows", () => {
  it("emits every check as SKIPPED rather than emitting nothing", () => {
    const checks = evaluateCiWorkflowChecks(snap({ "package.json": "{}" }));
    expect(checks).toHaveLength(CI_CHECK_KEYS.length);
    expect(checks.every((c) => c.status === "SKIPPED")).toBe(true);
    expect(checks.every((c) => typeof c.confidenceReason === "string")).toBe(true);
  });

  it("never reports a failure for a repo it did not examine", () => {
    const checks = evaluateCiWorkflowChecks(snap({}));
    expect(checks.some((c) => c.status === "FAIL" || c.status === "WARN")).toBe(false);
  });
});

describe("the catalogue cannot drift from what is emitted", () => {
  // The no-workflows path emits from a hand-maintained list. If that list and the
  // real evaluator disagree, a repo with CI and a repo without produce different
  // check keys, and the report silently changes shape between two scans.
  it("emits exactly the catalogued keys for a populated repo", () => {
    const checks = evaluateCiWorkflowChecks(snap({ ".github/workflows/ci.yml": CLEAN }));
    expect(checks.map((c) => c.checkKey).sort()).toEqual([...CI_CHECK_KEYS].sort());
  });
});

describe("stays quiet on a well-formed workflow", () => {
  const checks = evaluateCiWorkflowChecks(snap({ ".github/workflows/ci.yml": CLEAN }));

  it("reports no failures", () => {
    const failures = checks.filter((c) => c.status === "FAIL");
    expect(failures.map((c) => c.checkKey)).toEqual([]);
  });

  for (const key of [
    "ci_dangerous_triggers",
    "ci_template_injection",
    "ci_privileged_injection",
    "ci_actions_branch_ref",
    "ci_token_permissions",
    "ci_secrets_inherit",
    "ci_persist_credentials",
    "ci_unsecure_commands",
    "ci_runs_tests",
    "ci_runs_lint",
    "ci_build_matrix",
    "ci_job_timeouts",
  ]) {
    it(`${key} passes`, () => {
      expect(byKey(checks, key).status).toBe("PASS");
    });
  }
});

describe("template injection", () => {
  it("fires on an untrusted context inside run:", () => {
    const wf = `
on: pull_request
jobs:
  a:
    steps:
      - run: echo "Title: \${{ github.event.pull_request.title }}"
`;
    expect(byKey(evaluateCiWorkflowChecks(snap({ ".github/workflows/a.yml": wf })), "ci_template_injection").status).toBe(
      "FAIL",
    );
  });

  it("stays quiet on a TRUSTED context — this is what separates a rule from noise", () => {
    const wf = `
on: push
jobs:
  a:
    steps:
      - run: echo "\${{ github.repository }} at \${{ github.sha }}"
`;
    expect(byKey(evaluateCiWorkflowChecks(snap({ ".github/workflows/a.yml": wf })), "ci_template_injection").status).toBe(
      "PASS",
    );
  });

  it("stays quiet when the value is bound to env instead of interpolated inline", () => {
    const wf = `
on: pull_request
jobs:
  a:
    steps:
      - env:
          TITLE: \${{ github.event.pull_request.title }}
        run: echo "$TITLE"
`;
    const checks = evaluateCiWorkflowChecks(snap({ ".github/workflows/a.yml": wf }));
    expect(byKey(checks, "ci_template_injection").status).toBe("PASS");
  });

  it("escalates when combined with a privileged trigger", () => {
    const wf = `
on:
  pull_request_target:
    types: [opened]
jobs:
  a:
    steps:
      - run: echo "\${{ github.event.pull_request.title }}"
`;
    const checks = evaluateCiWorkflowChecks(snap({ ".github/workflows/a.yml": wf }));
    expect(byKey(checks, "ci_privileged_injection").status).toBe("FAIL");
  });

  it("does not escalate when the trigger is safe", () => {
    const wf = `
on: pull_request
jobs:
  a:
    steps:
      - run: echo "\${{ github.event.pull_request.title }}"
`;
    const checks = evaluateCiWorkflowChecks(snap({ ".github/workflows/a.yml": wf }));
    expect(byKey(checks, "ci_template_injection").status).toBe("FAIL");
    expect(byKey(checks, "ci_privileged_injection").status).toBe("PASS");
  });
});

describe("action pinning", () => {
  it("excludes GitHub's own actions from the SHA requirement", () => {
    const wf = "on: push\njobs:\n  a:\n    steps:\n      - uses: actions/checkout@v4\n";
    expect(byKey(evaluateCiWorkflowChecks(snap({ ".github/workflows/a.yml": wf })), "ci_actions_sha_pinned").status).toBe(
      "PASS",
    );
  });

  it("warns on an unpinned third-party action", () => {
    const wf = "on: push\njobs:\n  a:\n    steps:\n      - uses: some-vendor/deploy@v2\n";
    expect(byKey(evaluateCiWorkflowChecks(snap({ ".github/workflows/a.yml": wf })), "ci_actions_sha_pinned").status).toBe(
      "WARN",
    );
  });

  it("fails on a branch ref, which is strictly worse than a tag", () => {
    const wf = "on: push\njobs:\n  a:\n    steps:\n      - uses: some-vendor/deploy@main\n";
    expect(byKey(evaluateCiWorkflowChecks(snap({ ".github/workflows/a.yml": wf })), "ci_actions_branch_ref").status).toBe(
      "FAIL",
    );
  });

  it("skips rather than passes when there are no third-party actions at all", () => {
    const wf = "on: push\njobs:\n  a:\n    steps:\n      - run: make\n";
    expect(byKey(evaluateCiWorkflowChecks(snap({ ".github/workflows/a.yml": wf })), "ci_actions_sha_pinned").status).toBe(
      "SKIPPED",
    );
  });

  it("flags a lookalike namespace", () => {
    const wf = "on: push\njobs:\n  a:\n    steps:\n      - uses: action/checkout@v4\n";
    expect(byKey(evaluateCiWorkflowChecks(snap({ ".github/workflows/a.yml": wf })), "ci_action_typosquat").status).toBe(
      "FAIL",
    );
  });
});

describe("token and secret handling", () => {
  it("fails write-all outright", () => {
    const wf = "on: push\npermissions: write-all\njobs:\n  a:\n    steps:\n      - run: make\n";
    expect(byKey(evaluateCiWorkflowChecks(snap({ ".github/workflows/a.yml": wf })), "ci_token_permissions").status).toBe(
      "FAIL",
    );
  });

  it("warns when no permissions block is declared", () => {
    const wf = "on: push\njobs:\n  a:\n    steps:\n      - run: make\n";
    expect(byKey(evaluateCiWorkflowChecks(snap({ ".github/workflows/a.yml": wf })), "ci_token_permissions").status).toBe(
      "WARN",
    );
  });

  it("fails a serialised secrets context", () => {
    const wf = "on: push\njobs:\n  a:\n    steps:\n      - run: echo '\${{ toJSON(secrets) }}'\n";
    expect(byKey(evaluateCiWorkflowChecks(snap({ ".github/workflows/a.yml": wf })), "ci_secrets_serialised").status).toBe(
      "FAIL",
    );
  });

  it("warns on blanket secret inheritance", () => {
    const wf = "on: push\njobs:\n  a:\n    uses: ./.github/workflows/x.yml\n    secrets: inherit\n";
    expect(byKey(evaluateCiWorkflowChecks(snap({ ".github/workflows/a.yml": wf })), "ci_secrets_inherit").status).toBe(
      "WARN",
    );
  });
});

describe("self-hosted runners", () => {
  it("passes when self-hosted is not exposed to pull requests", () => {
    const wf = "on: push\njobs:\n  a:\n    runs-on: self-hosted\n    steps:\n      - run: make\n";
    expect(byKey(evaluateCiWorkflowChecks(snap({ ".github/workflows/a.yml": wf })), "ci_self_hosted_runner").status).toBe(
      "PASS",
    );
  });

  it("warns when a fork PR can execute on the persistent machine", () => {
    const wf = "on: pull_request\njobs:\n  a:\n    runs-on: self-hosted\n    steps:\n      - run: make\n";
    expect(byKey(evaluateCiWorkflowChecks(snap({ ".github/workflows/a.yml": wf })), "ci_self_hosted_runner").status).toBe(
      "WARN",
    );
  });

  it("skips when every runner is GitHub-hosted", () => {
    const wf = "on: push\njobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n      - run: make\n";
    expect(byKey(evaluateCiWorkflowChecks(snap({ ".github/workflows/a.yml": wf })), "ci_self_hosted_runner").status).toBe(
      "SKIPPED",
    );
  });
});

describe("plaintext transport", () => {
  it("ignores localhost, which is not a network path an attacker sits on", () => {
    const wf = "on: push\njobs:\n  a:\n    steps:\n      - run: curl http://localhost:8080/health\n";
    expect(byKey(evaluateCiWorkflowChecks(snap({ ".github/workflows/a.yml": wf })), "ci_plaintext_downloads").status).toBe(
      "PASS",
    );
  });

  it("warns on a real plaintext URL", () => {
    const wf = "on: push\njobs:\n  a:\n    steps:\n      - run: curl http://example.com/install.sh | sh\n";
    expect(byKey(evaluateCiWorkflowChecks(snap({ ".github/workflows/a.yml": wf })), "ci_plaintext_downloads").status).toBe(
      "WARN",
    );
  });
});
