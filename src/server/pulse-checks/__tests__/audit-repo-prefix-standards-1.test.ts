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
const find = (checks: { checkKey: string; status: string; evidence?: string; detail?: string }[], key: string) =>
  checks.find((c) => c.checkKey === key);

describe("web_dynamic_code_execution (security_core_09)", () => {
  it("does not treat a Redis Lua script .eval method call as code eval", () => {
    const checks = evaluateWebSourceChecks(
      snapshot({
        "app/services/user_api_key/device_auth/grant_store.rb":
          "class GrantStore\n  def unlock\n    UNLOCK_SCRIPT.eval(Discourse.redis, [namespaced_lock_key], [lock_token])\n  end\nend\n",
      }),
    );
    expect(find(checks, "web_dynamic_code_execution")).toBeUndefined();
  });

  it("still fails real eval, including window.eval and new Function", () => {
    const checks = evaluateWebSourceChecks(
      snapshot({
        "src/calc.js": "export function run(expr) { return eval(expr); }\n",
        "src/other.js": "export const f = (s) => window.eval(s);\n",
        "src/fn.js": "export const g = new Function('a', body);\n",
      }),
    );
    const c = find(checks, "web_dynamic_code_execution");
    expect(c?.status).toBe("FAIL");
    expect(c?.evidence).toContain("src/calc.js");
    expect(c?.evidence).toContain("src/other.js");
    expect(c?.evidence).toContain("src/fn.js");
    expect(c?.detail).not.toContain("on a string literal appears");
  });

  it("ignores a vendored library in a static lib directory but not the project's own static JS", () => {
    const vendored = evaluateWebSourceChecks(
      snapshot({
        "djangoproject/static/js/lib/require.js": "var g={};g.exec=function(b){return eval(b)};\n",
        // views.py keeps ctx.files non-empty, so "no finding" means the vendored file was
        // excluded rather than the whole family returning nothing.
        "djangoproject/views.py": "def index(request):\n    return render(request, 'index.html')\n",
      }),
    );
    expect(find(vendored, "web_dynamic_code_execution")).toBeUndefined();

    const own = evaluateWebSourceChecks(
      snapshot({
        "djangoproject/static/js/app.js": "function go(code){ return eval(code); }\n",
      }),
    );
    expect(find(own, "web_dynamic_code_execution")?.status).toBe("FAIL");
  });
});

describe("web_dynamic_code_execution — narrowings must not hide real eval", () => {
  it("still scans first-party Rails/Ember code under app/assets/**/lib", () => {
    const checks = evaluateWebSourceChecks(
      snapshot({ "app/assets/javascripts/discourse/app/lib/run.js": "export const r = (s) => eval(s);\n" }),
    );
    const c = find(checks, "web_dynamic_code_execution");
    expect(c?.status).toBe("FAIL");
    expect(c?.evidence).toContain("app/assets/javascripts/discourse/app/lib/run.js");
  });

  it("still FAILs Ruby binding.eval and Python builtins.eval", () => {
    const checks = evaluateWebSourceChecks(
      snapshot({
        "app/models/runner.rb": "class Runner\n  def call\n    binding.eval(params[:code])\n  end\nend\n",
        "tools/x.py": "import builtins\nbuiltins.eval(expr)\n",
      }),
    );
    const c = find(checks, "web_dynamic_code_execution");
    expect(c?.status).toBe("FAIL");
    expect(c?.evidence).toContain("app/models/runner.rb");
    expect(c?.evidence).toContain("tools/x.py");
  });

  it("does not treat torch model.eval() as code execution", () => {
    const checks = evaluateWebSourceChecks(
      snapshot({ "train.py": "model = build()\nmodel.eval()\nout = model(batch)\n" }),
    );
    expect(find(checks, "web_dynamic_code_execution")).toBeUndefined();
  });

  it("ignores a minified bundle", () => {
    const checks = evaluateWebSourceChecks(
      snapshot({
        "static/js/vendor.min.js": "!function(){var a=eval(b)}();\n",
        "app.py": "def index():\n    return 'ok'\n",
      }),
    );
    expect(find(checks, "web_dynamic_code_execution")).toBeUndefined();
  });
});

describe("web_shell_injection (deep_input_07) unchanged", () => {
  it("still fails an interpolated shell=True command", () => {
    const checks = evaluateWebSourceChecks(
      snapshot({
        "docs/management/commands/update_docs.py":
          "import subprocess\nsubprocess.check_call(\n    \"cd %s && make translations\" % trans_dir, shell=True\n)\n",
      }),
    );
    expect(find(checks, "web_shell_injection")?.status).toBe("FAIL");
  });
});
