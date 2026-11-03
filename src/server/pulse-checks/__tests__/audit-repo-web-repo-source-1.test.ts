import { describe, it, expect } from "vitest";
import { evaluateWebSourceChecks } from "../web-repo-source";
import type { RepoSnapshot } from "../native-mobile";

function snapshot(files: Record<string, string>, extraPaths: string[] = []): RepoSnapshot {
  return {
    owner: "acme",
    repo: "app",
    paths: [...Object.keys(files), ...extraPaths],
    files: new Map(Object.entries(files)),
    truncated: false,
    accessible: true,
  };
}

const find = (checks: { checkKey: string; status: string; confidence?: string; detail?: string }[], key: string) =>
  checks.find((c) => c.checkKey === key);

// psf/requests .github/workflows/codeql-analysis.yml (abridged)
const CODEQL_WORKFLOW = `name: "CodeQL"
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
permissions:
  contents: read
jobs:
  analyze:
    name: Analyze
    runs-on: ubuntu-latest
    steps:
    - name: Checkout repository
      uses: actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0 # v7.0.0
    - name: Initialize CodeQL
      uses: github/codeql-action/init@b96794f015dfd88f77b49b1c93e0fa7110f94c63 # v4.38.0
      with:
        languages: "python"
    - name: Perform CodeQL Analysis
      uses: github/codeql-action/analyze@b96794f015dfd88f77b49b1c93e0fa7110f94c63 # v4.38.0
`;

describe("pulse_code_flow_* recognise CodeQL", () => {
  it("passes a repo that runs CodeQL analysis in CI", () => {
    const checks = evaluateWebSourceChecks(snapshot({
      ".github/workflows/codeql-analysis.yml": CODEQL_WORKFLOW,
      "src/requests/api.py": "def get(url, params=None, **kwargs):\n    return request(\"get\", url, params=params, **kwargs)\n",
    }));
    expect(find(checks, "pulse_code_flow_gate")?.status).toBe("PASS");
    expect(find(checks, "pulse_code_flow_sources")?.status).toBe("PASS");
    expect(find(checks, "pulse_code_flow_sinks")?.status).toBe("PASS");
  });

  it("still warns when CodeQL is only used to upload third-party SARIF", () => {
    const checks = evaluateWebSourceChecks(snapshot({
      ".github/workflows/scorecard.yml": `jobs:\n  analysis:\n    steps:\n      - uses: ossf/scorecard-action@4eaacf0543bb3f2c246792bd56e8cdeffafb205a\n      - uses: github/codeql-action/upload-sarif@2892aa5e19bbd11bc0cff5427e3b750a04d9e3c2\n`,
      "src/index.js": "module.exports = function app() {}\n",
    }));
    expect(find(checks, "pulse_code_flow_sources")?.status).toBe("WARN");
    expect(find(checks, "pulse_code_flow_sinks")?.status).toBe("WARN");
  });
});

describe("pulse_browser_failure_evidence", () => {
  it("accepts Playwright retain-on-failure tracing (cal.com playwright.config.ts)", () => {
    const checks = evaluateWebSourceChecks(snapshot({
      "playwright.config.ts": `const config: PlaywrightTestConfig = {
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: process.env.NEXT_PUBLIC_WEBAPP_URL,
    locale: "en-US",
    trace: "retain-on-failure",
    headless,
  },
  projects: [{ name: "@calcom/web", testDir: "./apps/web/playwright", testMatch: "**/*.e2e.ts" }],
};
export default config;
`,
    }));
    expect(find(checks, "pulse_browser_failure_evidence")?.status).toBe("PASS");
  });

  it("still warns when browser tests keep no traces, screenshots or reports", () => {
    const checks = evaluateWebSourceChecks(snapshot({
      ".github/workflows/e2e.yml": `jobs:\n  e2e:\n    runs-on: ubuntu-latest\n    steps:\n      - run: yarn e2e\n      - uses: actions/upload-artifact@v4\n        with:\n          name: coverage\n          path: coverage/\n`,
      "playwright.config.ts": `export default { use: { baseURL: "http://localhost:3000", headless: true, trace: "off", screenshot: "off" } };\n`,
    }));
    expect(find(checks, "pulse_browser_failure_evidence")?.status).toBe("WARN");
  });

  it("does not count a generic test-results artifact from a non-browser test job", () => {
    const checks = evaluateWebSourceChecks(snapshot({
      ".github/workflows/ci.yml": `jobs:\n  test:\n    steps:\n      - run: pytest --junitxml=test-results/junit.xml\n      - uses: actions/upload-artifact@v4\n        with:\n          name: test-results\n          path: test-results/\n`,
      "app.py": "x = 1\n",
    }));
    expect(find(checks, "pulse_browser_failure_evidence")?.status).toBe("WARN");
  });
});

describe("pulse_browser_release_coverage", () => {
  const E2E_WORKFLOW = `name: E2E
on: workflow_call
jobs:
  e2e:
    timeout-minutes: 20
    name: E2E
    runs-on: buildjet-8vcpu-ubuntu-2204
    steps:
      - uses: actions/checkout@v4
        with:
          sparse-checkout: .github
      - uses: ./.github/actions/cache-checkout
      - run: yarn e2e --workers=4
`;

  it("does not treat actions/checkout as a checkout-flow test", () => {
    const checks = evaluateWebSourceChecks(snapshot({ ".github/workflows/e2e.yml": E2E_WORKFLOW, "src/app.ts": "export {};\n" }));
    expect(find(checks, "pulse_browser_release_coverage")?.status).toBe("WARN");
  });

  it("does not treat a 'Checkout code' step name or a registry login as critical-flow coverage", () => {
    const wf = `name: E2E
jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      - name: Login to GHCR
        uses: docker/login-action@v3
      - run: docker login ghcr.io -u bot -p x
      - run: yarn e2e
`;
    const checks = evaluateWebSourceChecks(snapshot({ ".github/workflows/e2e.yml": wf, "src/app.ts": "export {};\n" }));
    expect(find(checks, "pulse_browser_release_coverage")?.status).toBe("WARN");
  });

  it("passes when browser-test files are named for critical flows (cal.com apps/web/playwright)", () => {
    const checks = evaluateWebSourceChecks(snapshot(
      { ".github/workflows/e2e.yml": E2E_WORKFLOW, "src/app.ts": "export {};\n" },
      ["apps/web/playwright/login.e2e.ts", "apps/web/playwright/onboarding.e2e.ts"],
    ));
    expect(find(checks, "pulse_browser_release_coverage")?.status).toBe("PASS");
  });

  it("still passes when the workflow itself targets a critical flow", () => {
    const checks = evaluateWebSourceChecks(snapshot({
      ".github/workflows/e2e.yml": `jobs:\n  e2e:\n    steps:\n      - run: yarn e2e --grep "login|checkout"\n`,
      "src/app.ts": "export {};\n",
    }));
    expect(find(checks, "pulse_browser_release_coverage")?.status).toBe("PASS");
  });

  it("does not count app source or unit tests named login/checkout", () => {
    const checks = evaluateWebSourceChecks(snapshot(
      { ".github/workflows/e2e.yml": E2E_WORKFLOW, "src/app.ts": "export {};\n" },
      ["src/pages/login.tsx", "src/checkout.test.ts"],
    ));
    expect(find(checks, "pulse_browser_release_coverage")?.status).toBe("WARN");
  });
});

describe("pulse_ci_immutable_* presence findings are not 'inconclusive'", () => {
  const unread = Array.from({ length: 200 }, (_, i) => `packages/lib/file${i}.ts`);

  it("reports an observed mutable action / latest image at HIGH confidence even at low coverage", () => {
    const checks = evaluateWebSourceChecks(snapshot({
      ".github/workflows/e2e-api-v2.yml": `jobs:\n  e2e:\n    services:\n      redis:\n        image: redis:latest\n    steps:\n      - uses: actions/checkout@v4\n`,
    }, unread));
    for (const key of ["pulse_ci_immutable_actions", "pulse_ci_immutable_images"]) {
      const c = find(checks, key);
      expect(c?.status, key).toBe("WARN");
      expect(c?.confidence, key).toBe("HIGH");
      expect(c?.detail, key).not.toContain("inconclusive");
    }
  });

  it("still downgrades the 'none found' PASS at low coverage", () => {
    const checks = evaluateWebSourceChecks(snapshot({
      ".github/workflows/ci.yml": `jobs:\n  test:\n    container:\n      image: python:3.12-slim\n    steps:\n      - uses: actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0 # v7.0.0\n`,
    }, unread));
    for (const key of ["pulse_ci_immutable_actions", "pulse_ci_immutable_images"]) {
      const c = find(checks, key);
      expect(c?.status, key).toBe("PASS");
      expect(c?.confidence, key).toBe("LOW");
    }
  });
});

describe("pulse_request_body_limit", () => {
  it("treats body-parser defaults (100kb) as bounded (node-express-realworld src/main.ts)", () => {
    const checks = evaluateWebSourceChecks(snapshot({
      "src/main.ts": `import express from 'express';\nimport * as bodyParser from 'body-parser';\nconst app = express();\napp.use(bodyParser.json());\napp.use(bodyParser.urlencoded({ extended: true }));\napp.listen(3000);\n`,
      "src/app/routes/auth/auth.controller.ts": `const router = Router();\nrouter.post('/users', async (req: Request, res: Response) => { res.json(await createUser(req.body.user)); });\nexport default router;\n`,
    }));
    expect(find(checks, "pulse_request_body_limit")?.status).toBe("PASS");
  });

  it("still warns on hand-rolled unbounded body accumulation", () => {
    const checks = evaluateWebSourceChecks(snapshot({
      "src/ingest.ts": `const router = Router();\nrouter.post('/ingest', (req, res) => {\n  let body = '';\n  req.on('data', (chunk) => (body += chunk));\n  req.on('end', () => res.end(body));\n});\n`,
    }));
    expect(find(checks, "pulse_request_body_limit")?.status).toBe("WARN");
  });
});
