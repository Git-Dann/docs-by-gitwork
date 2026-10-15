import { describe, it, expect } from "vitest";
import { evaluateWebSourceChecks } from "../web-repo-source";
import type { RepoSnapshot } from "../native-mobile";

function snapshot(files: Record<string, string>): RepoSnapshot {
  return {
    owner: "acme",
    repo: "app",
    paths: Object.keys(files),
    files: new Map(Object.entries(files)),
    truncated: false,
    accessible: true,
  };
}

const status = (files: Record<string, string>, key: string) =>
  evaluateWebSourceChecks(snapshot(files)).find((c) => c.checkKey === key)?.status;

describe("review: dynamic code execution receivers", () => {
  it("does not flag a Python instance's own eval method", () => {
    expect(status({ "model/train.py": "class Net(Module):\n    def finish(self):\n        self.eval()\n" }, "web_dynamic_code_execution")).not.toBe("FAIL");
    expect(status({ "lisp/interp.py": "class Interp:\n    def run(self, expr, env):\n        return self.eval(expr, env)\n" }, "web_dynamic_code_execution")).not.toBe("FAIL");
  });
  it("still flags a real global eval with an argument", () => {
    expect(status({ "app/calc.py": "def calc(expr):\n    return eval(expr)\n" }, "web_dynamic_code_execution")).toBe("FAIL");
    expect(status({ "app/run.rb": "def run(code)\n  binding.eval(code)\nend\n" }, "web_dynamic_code_execution")).toBe("FAIL");
  });
});

describe("review: bundled static library exclusion is JS-only", () => {
  it("keeps first-party PHP under a public/lib webroot", () => {
    expect(status({ "public/lib/run.php": "<?php\nfunction run($c) { return eval($c); }\n" }, "web_dynamic_code_execution")).toBe("FAIL");
  });
  it("still drops a vendored JS library in the same directory", () => {
    expect(status({ "public/lib/require.js": "function x(b){return eval(b)}\n", "app/main.py": "print(1)\n" }, "web_dynamic_code_execution")).not.toBe("FAIL");
  });
});

describe("review: browser release coverage reads a spec path in a workflow", () => {
  const wf = (cmd: string) => `jobs:\n  e2e:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: ${cmd}\n`;
  it("passes when the e2e job runs a login spec by path", () => {
    expect(status({ ".github/workflows/e2e.yml": wf("npx playwright test tests/login.spec.ts"), "src/a.ts": "export const a = 1;\n" }, "pulse_browser_release_coverage")).toBe("PASS");
  });
  it("does not pass on actions/checkout or docker/login-action alone", () => {
    const yml = `jobs:\n  e2e:\n    steps:\n      - uses: actions/checkout@v4\n      - uses: docker/login-action@v3\n`;
    expect(status({ ".github/workflows/e2e.yml": yml, "src/a.ts": "export const a = 1;\n" }, "pulse_browser_release_coverage")).not.toBe("PASS");
  });
});
