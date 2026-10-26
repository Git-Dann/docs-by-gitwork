import { describe, expect, it } from "vitest";
import type { RepoSnapshot } from "../native-mobile";
import { OPERATIONAL_DEPTH_RULES, evaluateOperationalDepthChecks } from "../operational-depth";

// Audit, Oct 2026 — operational-depth rules are keyword regexes over a joined
// repository sample. A missing keyword can never FAIL and nothing here is HIGH;
// only a forbidden construct actually present in source can fail a rule.

function snap(files: Record<string, string>): RepoSnapshot {
  return { owner: "o", repo: "r", paths: Object.keys(files), files: new Map(Object.entries(files)), truncated: false, accessible: true };
}
const at = (files: Record<string, string>, key: string) => {
  const check = evaluateOperationalDepthChecks(snap(files)).find((c) => c.checkKey === key);
  if (!check) throw new Error(`no ${key}`);
  return check;
};

describe("confidence and status ceiling", () => {
  it("never emits HIGH, and never FAILs on an absence alone", () => {
    const files = {
      "src/admin.ts": `router.delete("/admin/users/:id", handler);`,
      "src/tenant.ts": `const rows = await db.item.findMany({ where: { id } }); const workspaceId = 1;`,
    };
    for (const check of evaluateOperationalDepthChecks(snap(files))) {
      expect(check.confidence, check.checkKey).not.toBe("HIGH");
    }
    expect(at(files, "roles_depth_server_authorization").status).toBe("WARN");
    expect(at(files, "roles_depth_tenant_query_scope").status).toBe("WARN");
  });

  it("still FAILs when a forbidden construct is present", () => {
    expect(at({ "src/session.ts": `app.use(session({ cookie: { secure: false } }));` }, "auth_depth_session_cookie_flags").status).toBe("FAIL");
    expect(at({ "app/api/checkout/route.ts": `const { priceId } = await req.json(); await stripe.checkout.sessions.create({ line_items: [{ price: priceId }] });` }, "payments_depth_price_allowlist").status).toBe("FAIL");
  });

  it("has no FAIL rule that cannot be reached (FAIL only via a forbidden pattern)", () => {
    for (const rule of OPERATIONAL_DEPTH_RULES) {
      if (rule.onMissing === "FAIL") expect(rule.forbidden?.length ?? 0, rule.key).toBeGreaterThan(0);
    }
  });
});

describe("roles_depth_server_authorization", () => {
  it("is not in scope for an app that merely uses the word 'admin'", () => {
    expect(at({
      "src/copy.ts": `export const help = "Ask your administrator or workspace admin to invite you.";`,
      "src/settings.tsx": `<p>Contact an admin</p>`,
    }, "roles_depth_server_authorization").status).toBe("SKIPPED");
  });

  it("accepts common guard idioms the fixed list used to miss", () => {
    for (const guard of [
      `@UseGuards(RolesGuard)\n@Delete("admin/users/:id") remove() {}\nif (user.role === "admin") {}`,
      `const session = await getServerSession(authOptions); if (!isAdmin(session)) throw new Error("forbidden"); const r = "/admin/users";`,
      `@login_required\ndef admin_panel(request):\n  if user.role == "admin": pass\npath = "/admin/"`,
    ]) {
      expect(at({ "src/a.ts": guard }, "roles_depth_server_authorization").status, guard).toBe("PASS");
    }
  });
});

describe("roles_depth_default_deny", () => {
  const policy = `export function can(user, action) { return hasPermission(user, action); }`;

  it("does not pass on an unrelated return false", () => {
    expect(at({ "src/p.ts": `${policy}\nfunction isEmpty(s) { if (s.length) return false; return true; }` }, "roles_depth_default_deny").status).toBe("WARN");
  });

  it("does not FAIL on 'default' and 'allow' near each other in prose or identifiers", () => {
    const check = at({ "src/p.ts": `${policy}\n// by default allowed origins come from config\nconst defaultAllowedHosts = [];` }, "roles_depth_default_deny");
    expect(check.status).not.toBe("FAIL");
  });

  it("FAILs a policy that declares an allow default, and passes a declared deny default", () => {
    expect(at({ "src/p.ts": `${policy}\nconst config = { defaultEffect: "allow" };` }, "roles_depth_default_deny").status).toBe("FAIL");
    expect(at({ "src/p.ts": `${policy}\nconst config = { defaultEffect: "deny" };` }, "roles_depth_default_deny").status).toBe("PASS");
  });
});

describe("auth_depth_generic_login_errors", () => {
  it("does not treat UI copy 'Wrong password' as an account-existence leak", () => {
    const check = at({
      "src/login.tsx": `export function Login() { return <p className="hint">Wrong password? Reset it below.</p>; } // login`,
      "src/api/login.ts": `const ok = await bcrypt.compare(password, user.hash);\nif (!ok) return res.status(401).json({ error: "Invalid credentials" }); // login`,
    }, "auth_depth_generic_login_errors");
    expect(check.status).toBe("PASS");
  });

  it("warns when the server's login response names a missing account", () => {
    const check = at({ "src/api/login.ts": `// login\nif (!user) return res.status(404).json({ error: "User not found" });\nconst ok = await bcrypt.compare(password, user.hash);` }, "auth_depth_generic_login_errors");
    expect(check.status).toBe("WARN");
    expect(check.confidence).toBe("MEDIUM");
  });
});

describe("ai_safety_sensitive_telemetry", () => {
  it("does not FAIL on the word 'prompt' inside a log message (chat-langchain)", () => {
    const check = at({ "src/middleware/guardrails_middleware.py": `logger.info("Using local guardrails prompt because USE_LOCAL_PROMPTS is enabled")` }, "ai_safety_sensitive_telemetry");
    expect(check.status).not.toBe("FAIL");
  });
  it("FAILs when the prompt itself is logged", () => {
    expect(at({ "src/a.ts": `logger.info("request", prompt);` }, "ai_safety_sensitive_telemetry").status).toBe("FAIL");
    expect(at({ "src/a.py": `logger.debug(f"model input: {prompt}")` }, "ai_safety_sensitive_telemetry").status).toBe("FAIL");
  });
});
