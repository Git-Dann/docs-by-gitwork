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
const find = (checks: { checkKey: string }[], key: string) =>
  checks.find((c) => c.checkKey === key) as { status: string; detail: string } | undefined;

describe("web_debug_mode_enabled — dev settings modules (djangoproject.com)", () => {
  it("does not FAIL on settings/dev.py when prod reads an env var", () => {
    const checks = evaluateWebSourceChecks(snapshot({
      "djangoproject/settings/dev.py": "from .common import *  # noqa\n\nDEBUG = True\nTHUMBNAIL_DEBUG = DEBUG\n",
      "djangoproject/settings/prod.py": "import os\nDEBUG = os.getenv(\"DJANGO_DEBUG\", \"false\").lower() == \"true\"\n",
    }));
    expect(find(checks, "web_debug_mode_enabled")).toBeUndefined();
  });
  it("still FAILs on a production settings.py with DEBUG = True", () => {
    const checks = evaluateWebSourceChecks(snapshot({
      "mysite/settings.py": "SECRET_KEY = os.environ['SECRET_KEY']\nDEBUG = True\nALLOWED_HOSTS = ['example.com']\n",
    }));
    expect(find(checks, "web_debug_mode_enabled")?.status).toBe("FAIL");
  });
  it("still FAILs on settings_local.py, the per-deployment override that runs in production", () => {
    const checks = evaluateWebSourceChecks(snapshot({
      "mysite/settings_local.py": "DEBUG = True\n",
    }));
    expect(find(checks, "web_debug_mode_enabled")?.status).toBe("FAIL");
  });
});

describe("web_dynamic_code_execution — member calls are not global eval (discourse)", () => {
  it("ignores a Redis Lua script .eval(...) call", () => {
    const checks = evaluateWebSourceChecks(snapshot({
      "app/services/user_api_key/device_auth/grant_store.rb":
        "def release_lock(lock_token)\n  UNLOCK_SCRIPT.eval(Discourse.redis, [namespaced_lock_key], [lock_token])\nend\n",
      "lib/match.js": "const m = /a(b)/.exec(\"abc\");\n",
    }));
    expect(find(checks, "web_dynamic_code_execution")).toBeUndefined();
  });
  it("still FAILs on a bare eval in the project's own code", () => {
    const checks = evaluateWebSourceChecks(snapshot({
      "djangoproject/static/js/app.js": "g.exec=function(b){return eval(b)};g(q)\n",
    }));
    expect(find(checks, "web_dynamic_code_execution")?.status).toBe("FAIL");
  });
  it("still FAILs Ruby binding.eval / Kernel.eval and Python exec on a string", () => {
    const checks = evaluateWebSourceChecks(snapshot({
      "lib/tpl.rb": "def render(code, src)\n  binding.eval(code)\n  Kernel.eval(src)\nend\n",
      "tools/run.py": "exec(\"print(1)\")\n",
    }));
    const c = find(checks, "web_dynamic_code_execution") as { status: string; evidence?: string } | undefined;
    expect(c?.status).toBe("FAIL");
    expect(c?.evidence).toContain("lib/tpl.rb");
    expect(c?.evidence).toContain("tools/run.py");
  });
});

describe("web_gitignore_covers_env — deliberately re-included / test env files (cal.com)", () => {
  const gitignore = "# .env file\n.env\n!packages/prisma/.env\n.env.local\n.env.*\n!.env.example\n";
  it("WARNs (not FAILs) for a !re-included symlink path and a .env.test", () => {
    const checks = evaluateWebSourceChecks(snapshot(
      { ".gitignore": gitignore, "apps/web/index.ts": "export const x = 1;\n" },
      ["packages/prisma/.env", "packages/lib/test/.env.test", ".env.example"],
    ));
    const c = find(checks, "web_gitignore_covers_env");
    expect(c?.status).toBe("WARN");
    expect(c?.detail).not.toMatch(/Rotate every credential/);
  });
  it("still FAILs for an ordinary committed .env", () => {
    const checks = evaluateWebSourceChecks(snapshot(
      { ".gitignore": ".env\nnode_modules\n", "apps/web/index.ts": "export const x = 1;\n" },
      ["apps/api/.env"],
    ));
    expect(find(checks, "web_gitignore_covers_env")?.status).toBe("FAIL");
  });
  it("still FAILs a committed .env.production when the gitignore re-includes an unrelated path", () => {
    const checks = evaluateWebSourceChecks(snapshot(
      { ".gitignore": ".env\n.env.*\n!packages/prisma/.env\n", "apps/web/index.ts": "export const x = 1;\n" },
      ["apps/api/.env.production"],
    ));
    expect(find(checks, "web_gitignore_covers_env")?.status).toBe("FAIL");
  });
});

describe("web_dependency_pinning — wording respects a committed lockfile (cal.com)", () => {
  const pkg = JSON.stringify({ name: "calcom-monorepo", devDependencies: { checkly: "latest", turbo: "^2.5.0" } });
  it("does not claim two builds of the same commit differ when yarn.lock is committed", () => {
    const checks = evaluateWebSourceChecks(snapshot({ "package.json": pkg, "apps/web/index.ts": "export {};\n" }, ["yarn.lock"]));
    const c = find(checks, "web_dependency_pinning");
    expect(c?.status).toBe("WARN");
    expect(c?.detail).not.toMatch(/Two builds of the same commit/);
    expect(c?.detail).toMatch(/lockfile/);
  });
  it("keeps the original claim when no lockfile is committed", () => {
    const checks = evaluateWebSourceChecks(snapshot({ "package.json": pkg, "apps/web/index.ts": "export {};\n" }));
    const c = find(checks, "web_dependency_pinning");
    expect(c?.status).toBe("WARN");
    expect(c?.detail).toMatch(/Two builds of the same commit/);
  });
});

describe("pulse_static_analysis_policy — checked-in linter config is policy (discourse, supabase)", () => {
  it("PASSes when .rubocop.yml / eslint.config.mjs are committed", () => {
    const checks = evaluateWebSourceChecks(snapshot(
      { "app/models/user.rb": "class User < ActiveRecord::Base\nend\n" },
      [".rubocop.yml", "eslint.config.mjs", "apps/studio/eslint.config.cjs"],
    ));
    expect(find(checks, "pulse_static_analysis_policy")?.status).toBe("PASS");
  });
  it("still WARNs for a formatter-only repo (vercel/commerce) or a vendored config", () => {
    const checks = evaluateWebSourceChecks(snapshot(
      { "lib/utils.ts": "export const baseUrl = process.env.VERCEL_URL;\n" },
      [".prettierrc", "tsconfig.json", "pnpm-lock.yaml", "node_modules/foo/.eslintrc.json"],
    ));
    expect(find(checks, "pulse_static_analysis_policy")?.status).toBe("WARN");
  });
});

describe("pulse_supply_chain_blocking — package-manager audit with a severity gate (cal.com)", () => {
  it("PASSes for `yarn npm audit --severity critical` in CI", () => {
    const wf = "name: Security Audit\non:\n  workflow_call:\njobs:\n  audit:\n    runs-on: ubuntu-latest\n    steps:\n      - name: Report all vulnerabilities\n        run: yarn npm audit --all --recursive || true\n      - name: Fail on critical vulnerabilities\n        run: yarn npm audit --all --recursive --severity critical\n";
    const checks = evaluateWebSourceChecks(snapshot({ ".github/workflows/security-audit.yml": wf, "apps/web/index.ts": "export {};\n" }));
    expect(find(checks, "pulse_supply_chain_blocking")?.status).toBe("PASS");
  });
  it("still WARNs when the audit is neutralised with `|| true` or has no threshold", () => {
    const wf = "name: Audit\njobs:\n  audit:\n    steps:\n      - run: yarn npm audit --all --recursive || true\n      - run: npm audit --audit-level=high || true\n";
    const checks = evaluateWebSourceChecks(snapshot({ ".github/workflows/audit.yml": wf, "apps/web/index.ts": "export {};\n" }));
    expect(find(checks, "pulse_supply_chain_blocking")?.status).toBe("WARN");
  });
  it("WARNs when pip-audit is only installed or neutralised, and when npm audit ends in || exit 0", () => {
    const wf = "jobs:\n  audit:\n    steps:\n      - run: pip install pip-audit\n      - run: pip-audit || true\n      - run: npm audit --audit-level=high || exit 0\n";
    const checks = evaluateWebSourceChecks(snapshot({ ".github/workflows/audit.yml": wf, "app.py": "x = 1\n" }));
    expect(find(checks, "pulse_supply_chain_blocking")?.status).toBe("WARN");
  });
  it("PASSes a bare pip-audit run step", () => {
    const wf = "jobs:\n  audit:\n    steps:\n      - run: pip-audit -r requirements.txt\n";
    const checks = evaluateWebSourceChecks(snapshot({ ".github/workflows/audit.yml": wf, "app.py": "x = 1\n" }));
    expect(find(checks, "pulse_supply_chain_blocking")?.status).toBe("PASS");
  });
});

describe("pulse_supply_chain_blocking — block-scalar run steps", () => {
  it("PASSes pip-audit as the first line of a `run: |` block", () => {
    const wf = "jobs:\n  audit:\n    steps:\n      - run: |\n          pip-audit -r requirements.txt\n";
    const checks = evaluateWebSourceChecks(snapshot({ ".github/workflows/audit.yml": wf, "app.py": "x = 1\n" }));
    expect(find(checks, "pulse_supply_chain_blocking")?.status).toBe("PASS");
  });
  it("still WARNs when that block-scalar pip-audit is neutralised", () => {
    const wf = "jobs:\n  audit:\n    steps:\n      - run: |\n          pip-audit -r requirements.txt || true\n";
    const checks = evaluateWebSourceChecks(snapshot({ ".github/workflows/audit.yml": wf, "app.py": "x = 1\n" }));
    expect(find(checks, "pulse_supply_chain_blocking")?.status).toBe("WARN");
  });
});
