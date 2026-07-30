import { describe, it, expect } from "vitest";
import { evaluateWebSourceChecks } from "../web-repo-source";
import type { RepoSnapshot } from "../native-mobile";

// ─────────────────────────────────────────────────────────────────────────────
// This family carries the highest false-positive risk in Pulse, because unlike
// the platform families it matches PATTERNS in ordinary application code rather
// than reading a named config value. So most of these tests are about staying
// QUIET: on template code, on placeholders, on localhost, on comments.
//
// A scanner that fires on every React app is one people learn to scroll past,
// and at that point it is worse than no scanner — it costs attention and buys
// nothing.
// ─────────────────────────────────────────────────────────────────────────────

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

const statusOf = (checks: { checkKey: string; status: string }[], key: string) =>
  checks.find((c) => c.checkKey === key)?.status;
const keys = (checks: { checkKey: string }[]) => checks.map((c) => c.checkKey);

describe("gating", () => {
  it("returns nothing for an unreadable repo", () => {
    const snap = { ...snapshot({}), accessible: false };
    expect(evaluateWebSourceChecks(snap)).toEqual([]);
  });

  it("returns nothing when no source was actually read", () => {
    // A wall of passes over files we never fetched is the §35 failure exactly.
    expect(evaluateWebSourceChecks(snapshot({}))).toEqual([]);
  });
});

describe("AI-generated app quality gates", () => {
  it("finds real audit-tool workflow and test evidence", () => {
    const checks = evaluateWebSourceChecks(snapshot({
      "package.json": JSON.stringify({ devDependencies: { "@playwright/test": "^1", "@axe-core/playwright": "^4" } }),
      ".github/workflows/quality.yml": `
        - uses: returntocorp/semgrep-action@v1
        - uses: gitleaks/gitleaks-action@v2
        - uses: aquasecurity/trivy-action@master
        - uses: github/codeql-action/analyze@v3
        - uses: zaproxy/action-baseline@v0.12.0
      `,
      "tests/home.spec.ts": `test("home", async () => { await axe.run(); });`,
    }));
    for (const key of ["vibe_semgrep_gate", "vibe_gitleaks_gate", "vibe_trivy_gate", "vibe_codeql_gate", "vibe_playwright_evidence", "vibe_axe_evidence", "vibe_zap_gate"]) {
      expect(statusOf(checks, key), key).toBe("PASS");
    }
  });

  it("does not invent audit-tool evidence from ordinary app code", () => {
    const checks = evaluateWebSourceChecks(snapshot({ "src/app.ts": `export const title = "hello";` }));
    expect(statusOf(checks, "vibe_semgrep_gate")).toBe("WARN");
    expect(statusOf(checks, "vibe_zap_gate")).toBe("WARN");
  });
});

describe("injection — presence findings", () => {
  it("fails raw HTML rendering with no sanitiser present", () => {
    const checks = evaluateWebSourceChecks(snapshot({
      "src/Post.tsx": `<div dangerouslySetInnerHTML={{ __html: post.body }} />`,
    }));
    expect(statusOf(checks, "web_raw_html_injection")).toBe("FAIL");
  });

  it("downgrades to WARN when a sanitiser is in the project", () => {
    const checks = evaluateWebSourceChecks(snapshot({
      "package.json": JSON.stringify({ dependencies: { dompurify: "^3.0.0" } }),
      "src/Post.tsx": `<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(post.body) }} />`,
    }));
    expect(statusOf(checks, "web_raw_html_injection")).toBe("WARN");
  });

  it("says nothing at all when there is no raw HTML rendering", () => {
    const checks = evaluateWebSourceChecks(snapshot({ "src/Post.tsx": `<div>{post.body}</div>` }));
    expect(keys(checks)).not.toContain("web_raw_html_injection");
  });

  it("detects SQL built by each of the four idioms", () => {
    const cases: Array<[string, string]> = [
      ["python-fstring", `cur.execute(f"SELECT * FROM users WHERE id = {uid}")`],
      ["str-format", `cur.execute("SELECT * FROM users WHERE id = {}".format(uid))`],
      ["template-literal", "db.query(`SELECT * FROM users WHERE id = ${uid}`)"],
      ["concat", `db.query("SELECT * FROM users WHERE id = " + uid)`],
    ];
    for (const [name, code] of cases) {
      const checks = evaluateWebSourceChecks(snapshot({ "src/db.js": code }));
      expect(statusOf(checks, "web_sql_string_building"), name).toBe("FAIL");
    }
  });

  it("stays quiet on parameterised SQL", () => {
    const checks = evaluateWebSourceChecks(snapshot({
      "src/db.js": `db.query("SELECT * FROM users WHERE id = $1", [uid])`,
      "src/py.py": `cur.execute("SELECT * FROM users WHERE id = %s", (uid,))`,
    }));
    expect(keys(checks)).not.toContain("web_sql_string_building");
  });

  it("does not read a commented-out eval as live code", () => {
    // Third time this class of bug is guarded in this codebase (§34.3, §34.6).
    const checks = evaluateWebSourceChecks(snapshot({
      "src/run.js": `// eval(userInput)  <- removed in review\nconst x = JSON.parse(input);`,
    }));
    expect(keys(checks)).not.toContain("web_dynamic_code_execution");
  });

  it("does not truncate a URL when stripping comments", () => {
    const checks = evaluateWebSourceChecks(snapshot({
      "src/run.js": `const api = "https://api.example.com/v1"; eval(userInput);`,
    }));
    expect(statusOf(checks, "web_dynamic_code_execution")).toBe("FAIL");
  });

  it("flags shell execution built from a variable but not a fixed command", () => {
    const interpolated = evaluateWebSourceChecks(snapshot({
      "src/git.js": "exec(`git clone ${repoUrl}`)",
    }));
    expect(statusOf(interpolated, "web_shell_injection")).toBe("FAIL");

    const fixed = evaluateWebSourceChecks(snapshot({
      "src/git.js": `execFile("git", ["clone", repoUrl])`,
    }));
    expect(keys(fixed)).not.toContain("web_shell_injection");
  });

  it("flags yaml.load without SafeLoader but not with it", () => {
    const unsafe = evaluateWebSourceChecks(snapshot({ "src/cfg.py": `cfg = yaml.load(f)` }));
    expect(statusOf(unsafe, "web_unsafe_deserialization")).toBe("FAIL");

    const safe = evaluateWebSourceChecks(snapshot({ "src/cfg.py": `cfg = yaml.load(f, Loader=yaml.SafeLoader)` }));
    expect(keys(safe)).not.toContain("web_unsafe_deserialization");
  });
});

describe("credentials", () => {
  it("warns when .gitignore exists but misses .env", () => {
    // The case a presence test passes — and the second most common finding in
    // AI-built repos. Pulse could previously only see "a .gitignore is present".
    const checks = evaluateWebSourceChecks(snapshot({
      ".gitignore": `node_modules/\ndist/\n.DS_Store`,
      "src/app.js": `const x = 1;`,
    }));
    expect(statusOf(checks, "web_gitignore_covers_env")).toBe("WARN");
  });

  it("passes when .gitignore covers .env", () => {
    const checks = evaluateWebSourceChecks(snapshot({
      ".gitignore": `node_modules/\n.env\n.env.*`,
      "src/app.js": `const x = 1;`,
    }));
    expect(statusOf(checks, "web_gitignore_covers_env")).toBe("PASS");
  });

  it("fails outright when a .env is actually committed", () => {
    const checks = evaluateWebSourceChecks(snapshot(
      { ".gitignore": `node_modules/`, "src/app.js": `const x = 1;` },
      [".env"],
    ));
    expect(statusOf(checks, "web_gitignore_covers_env")).toBe("FAIL");
  });

  it("does not count .env.example as a committed secret", () => {
    const checks = evaluateWebSourceChecks(snapshot(
      { ".gitignore": `.env`, "src/app.js": `const x = 1;` },
      [".env.example"],
    ));
    expect(statusOf(checks, "web_gitignore_covers_env")).toBe("PASS");
  });

  it("downgrades a password finding when it looks like a placeholder", () => {
    const placeholder = evaluateWebSourceChecks(snapshot({
      "src/config.js": `const password = "changeme";`,
    }));
    expect(statusOf(placeholder, "web_hardcoded_password")).toBe("WARN");

    const real = evaluateWebSourceChecks(snapshot({
      "src/config.js": `const password = "Tr0ub4dor&3xkcd";`,
    }));
    expect(statusOf(real, "web_hardcoded_password")).toBe("FAIL");
  });
});

describe("Supabase RLS from the repo side", () => {
  it("fails when Supabase is used and no migration enables RLS", () => {
    const checks = evaluateWebSourceChecks(snapshot({
      "package.json": JSON.stringify({ dependencies: { "@supabase/supabase-js": "^2.0.0" } }),
      "src/db.ts": `import { createClient } from "@supabase/supabase-js"`,
      "supabase/migrations/001_init.sql": `CREATE TABLE profiles (id uuid, user_id uuid);`,
    }));
    expect(statusOf(checks, "web_supabase_rls_migrations")).toBe("FAIL");
  });

  it("warns on a USING (true) policy — security theatre", () => {
    const checks = evaluateWebSourceChecks(snapshot({
      "package.json": JSON.stringify({ dependencies: { "@supabase/supabase-js": "^2.0.0" } }),
      "src/db.ts": `createClient(url, anonKey)`,
      "supabase/migrations/001_init.sql":
        `ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;\nCREATE POLICY p ON profiles USING (true);`,
    }));
    expect(statusOf(checks, "web_supabase_rls_migrations")).toBe("WARN");
  });

  it("passes a scoped policy", () => {
    const checks = evaluateWebSourceChecks(snapshot({
      "package.json": JSON.stringify({ dependencies: { "@supabase/supabase-js": "^2.0.0" } }),
      "src/db.ts": `createClient(url, anonKey)`,
      "supabase/migrations/001_init.sql":
        `ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;\nCREATE POLICY p ON profiles USING (auth.uid() = user_id);`,
    }));
    expect(statusOf(checks, "web_supabase_rls_migrations")).toBe("PASS");
  });

  it("says nothing for a project that does not use Supabase", () => {
    const checks = evaluateWebSourceChecks(snapshot({
      "src/db.ts": `import pg from "pg"`,
      "migrations/001.sql": `CREATE TABLE users (id serial);`,
    }));
    expect(keys(checks)).not.toContain("web_supabase_rls_migrations");
  });
});

describe("framework defaults and transport", () => {
  it("fails committed debug mode", () => {
    const checks = evaluateWebSourceChecks(snapshot({ "settings.py": `DEBUG = True` }));
    expect(statusOf(checks, "web_debug_mode_enabled")).toBe("FAIL");
  });

  it("fails disabled TLS verification", () => {
    const checks = evaluateWebSourceChecks(snapshot({
      "src/client.js": `const agent = new https.Agent({ rejectUnauthorized: false })`,
    }));
    expect(statusOf(checks, "web_tls_verification_disabled")).toBe("FAIL");
  });

  it("excludes localhost from the plaintext-URL finding", () => {
    const local = evaluateWebSourceChecks(snapshot({
      "src/dev.js": `const api = "http://localhost:3000/api";`,
    }));
    expect(keys(local)).not.toContain("web_plaintext_api_calls");

    const remote = evaluateWebSourceChecks(snapshot({
      "src/dev.js": `const api = "http://api.partner.com/v1";`,
    }));
    expect(statusOf(remote, "web_plaintext_api_calls")).toBe("WARN");
  });

  it("fails wildcard CORS with credentials, warns without", () => {
    const withCreds = evaluateWebSourceChecks(snapshot({
      "src/server.js": `app.use(cors({ origin: "*", credentials: true }))`,
    }));
    expect(statusOf(withCreds, "web_cors_source_config")).toBe("FAIL");

    const without = evaluateWebSourceChecks(snapshot({
      "src/server.js": `app.use(cors({ origin: "*" }))`,
    }));
    expect(statusOf(without, "web_cors_source_config")).toBe("WARN");
  });

  it("only asks about helmet for a node http framework", () => {
    const express = evaluateWebSourceChecks(snapshot({
      "package.json": JSON.stringify({ dependencies: { express: "^4.18.0" } }),
      "src/server.js": `const app = express();`,
    }));
    expect(statusOf(express, "web_security_headers_middleware")).toBe("WARN");

    const frontend = evaluateWebSourceChecks(snapshot({
      "package.json": JSON.stringify({ dependencies: { react: "^19.0.0" } }),
      "src/App.tsx": `export default function App() { return null; }`,
    }));
    expect(keys(frontend)).not.toContain("web_security_headers_middleware");
  });
});

describe("supply chain", () => {
  it("warns on curl piped into a shell in the README", () => {
    const checks = evaluateWebSourceChecks(snapshot({
      "README.md": "## Install\n\n```\ncurl -fsSL https://example.com/i.sh | sh\n```",
      "src/app.js": `const x = 1;`,
    }));
    expect(statusOf(checks, "web_curl_pipe_shell")).toBe("WARN");
  });

  it("warns on unpinned dependency specifiers", () => {
    const checks = evaluateWebSourceChecks(snapshot({
      "package.json": JSON.stringify({ dependencies: { lodash: "*", react: "latest" } }),
      "src/app.js": `const x = 1;`,
    }));
    expect(statusOf(checks, "web_dependency_pinning")).toBe("WARN");
  });

  it("passes pinned dependencies with a lockfile", () => {
    const checks = evaluateWebSourceChecks(snapshot(
      {
        "package.json": JSON.stringify({ dependencies: { lodash: "^4.17.21" } }),
        "src/app.js": `const x = 1;`,
      },
      ["package-lock.json"],
    ));
    expect(statusOf(checks, "web_dependency_pinning")).toBe("PASS");
  });
});

describe("a clean repo produces a clean report, not a wall of findings", () => {
  it("emits no FAILs for a well-built project", () => {
    const checks = evaluateWebSourceChecks(snapshot(
      {
        "package.json": JSON.stringify({ dependencies: { express: "^4.18.0", helmet: "^7.0.0" } }),
        ".gitignore": `node_modules/\n.env\n.env.*`,
        "README.md": "## Install\n\n```\nnpm install\n```",
        "src/server.js":
          `const app = express();\napp.use(helmet());\n` +
          `app.use(cors({ origin: ["https://app.example.com"], credentials: true }));\n` +
          `db.query("SELECT * FROM users WHERE id = $1", [id]);`,
      },
      ["package-lock.json"],
    ));
    expect(checks.filter((c) => c.status === "FAIL")).toEqual([]);
  });
});
