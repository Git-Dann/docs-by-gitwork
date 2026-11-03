import { describe, expect, it } from "vitest";
import type { PulseScanCheckInput } from "@/types/pulse";
import type { RepoSnapshot } from "../native-mobile";
import {
  OPERATIONAL_DEPTH_RULES,
  evaluateOperationalDepthChecks,
  evaluateOperationalRuleText,
} from "../operational-depth";

// The reviewers' counter-examples for the operational-depth fixes: each case is a real
// idiom that a narrowed subject or a widened requirement could have silently mishandled.

const evalKey = (key: string, text: string) => {
  const rule = OPERATIONAL_DEPTH_RULES.find((candidate) => candidate.key === key);
  if (!rule) throw new Error(`missing rule ${key}`);
  return evaluateOperationalRuleText(rule, text).status;
};

function snap(
  files: Record<string, string>,
  extraPaths: string[] = [],
  truncated = false,
): RepoSnapshot {
  return {
    owner: "o",
    repo: "r",
    paths: [...Object.keys(files), ...extraPaths],
    files: new Map(Object.entries(files)),
    truncated,
    accessible: true,
  };
}

const at = (checks: PulseScanCheckInput[], key: string) => {
  const check = checks.find((candidate) => candidate.checkKey === key);
  if (!check) throw new Error(`No check emitted for ${key}`);
  return check;
};

describe("api_depth_cursor_validation keeps real client cursors in scope", () => {
  it("warns on a destructured cursor that is decoded without validation", () => {
    expect(
      evalKey(
        "api_depth_cursor_validation",
        "routes/items.ts\nconst { cursor, limit } = req.query;\nconst position = JSON.parse(atob(cursor));",
      ),
    ).toBe("WARN");
  });
  it("warns on a Flask request.args cursor", () => {
    expect(evalKey("api_depth_cursor_validation", 'app.py\ncursor = request.args.get("cursor")')).toBe("WARN");
  });
});

describe("api_depth_page_size_cap keeps uncapped limits in scope", () => {
  it("warns on a destructured req.query limit", () => {
    expect(evalKey("api_depth_page_size_cap", "routes/items.ts\nconst { limit } = req.query;\ndb.find().limit(limit);")).toBe("WARN");
  });
  it("warns on a FastAPI typed limit parameter", () => {
    expect(evalKey("api_depth_page_size_cap", "main.py\ndef list_items(limit: int = 100):\n    return db[:limit]")).toBe("WARN");
  });
  it("still passes a FastAPI Query cap", () => {
    expect(evalKey("api_depth_page_size_cap", "main.py\ndef list_items(limit: int = Query(20, le=100)):")).toBe("PASS");
  });
});

describe("api_depth_request_deadline does not credit unrelated timeouts", () => {
  it("warns when the only timeout is a pip install flag", () => {
    expect(
      evalKey(
        "api_depth_request_deadline",
        "Dockerfile\nRUN pip install --timeout 100 -r requirements.txt\napp.py\n@app.route('/x')\ndef x(): return request.json",
      ),
    ).toBe("WARN");
  });
  it("warns when the only timeout is Puma's worker heartbeat", () => {
    expect(evalKey("api_depth_request_deadline", "config/puma.rb\nworker_timeout 60\napp.use middleware")).toBe("WARN");
  });
  it("passes a gunicorn command line timeout", () => {
    expect(
      evalKey("api_depth_request_deadline", "Procfile\nweb: gunicorn app:app --timeout 30\napp.py\nrequest.json"),
    ).toBe("PASS");
  });
});

describe("api_depth_response_schema does not count every Mapper", () => {
  it("warns on a Java controller whose only 'mapper' is Jackson's ObjectMapper", () => {
    expect(
      evalKey(
        "api_depth_response_schema",
        "UserController.java\n@RestController\nclass UserController { ObjectMapper m = new ObjectMapper(); }",
      ),
    ).toBe("WARN");
  });
  it("passes a domain mapper (realworld articleMapper)", () => {
    expect(evalKey("api_depth_response_schema", "article.controller.ts\nrouter.get('/a', h); return articleMapper(article);")).toBe("PASS");
  });
});

describe("api_depth_webhook_replay_window only credits the Stripe SDK", () => {
  it("flags a home-made constructEvent that only parses JSON", () => {
    expect(
      evalKey(
        "api_depth_webhook_replay_window",
        "routes/webhook.ts\nfunction constructEvent(body) { return JSON.parse(body); }\napp.post('/webhook', (req) => handle(constructEvent(req.body)));",
      ),
    ).toBe("WARN");
  });
  it("passes the Stripe SDK verification call", () => {
    expect(
      evalKey("api_depth_webhook_replay_window", "routes/webhook.ts\nconst event = stripe.webhooks.constructEvent(body, sig, secret);"),
    ).toBe("PASS");
  });
});

describe("auth_depth_csrf_state_change needs cookie authentication", () => {
  it("warns on a FastAPI handler that sets a session cookie", () => {
    expect(
      evalKey("auth_depth_csrf_state_change", 'main.py\n@app.post("/login")\ndef login(response):\n    response.set_cookie("session", t)'),
    ).toBe("WARN");
  });
  it("warns on a Next 15 cookies() write", () => {
    expect(
      evalKey("auth_depth_csrf_state_change", 'app/actions.ts\n(await cookies()).set("session", token);'),
    ).toBe("WARN");
  });
  it("skips a client-side theme cookie", () => {
    expect(evalKey("auth_depth_csrf_state_change", 'src/theme.ts\nCookies.set("theme", "dark");')).toBe("SKIPPED");
  });
});

describe("auth_depth_oauth_redirect_allowlist ignores documentation prose", () => {
  it("does not pass because a README names the redirect_uri_mismatch error", () => {
    const status = evalKey(
      "auth_depth_oauth_redirect_allowlist",
      "README.md\nIf Google shows `redirect_uri_mismatch`, check the console.\nsrc/auth.ts\nconst returnTo = session.returnTo; res.redirect(returnTo);",
    );
    expect(status).not.toBe("PASS");
    expect(status).toBe("WARN");
  });
});

describe("api_depth_contract_validation_ci", () => {
  it("does not count rswag-ui as a contract test", () => {
    expect(
      evalKey("api_depth_contract_validation_ci", 'Gemfile\ngem "rswag-ui"\ngem "rswag-api"\nopenapi.yaml\nopenapi: 3.0.0'),
    ).toBe("WARN");
  });
  it("brings a NestJS generated contract into scope", () => {
    expect(evalKey("api_depth_contract_validation_ci", 'src/main.ts\nimport { SwaggerModule } from "@nestjs/swagger";')).toBe("WARN");
  });
  it("skips a client-side GraphQL query document", () => {
    expect(evalKey("api_depth_contract_validation_ci", "src/queries/getUser.graphql\nquery GetUser { user { id } }")).toBe("SKIPPED");
  });
});

describe("auth_depth_session_cookie_flags", () => {
  it("flags koa-session with no SameSite policy", () => {
    expect(
      evalKey("auth_depth_session_cookie_flags", 'server.ts\nimport session from "koa-session";\napp.use(session({ key: "s" }, app));'),
    ).toBe("WARN");
  });
});

describe("global and email rules after narrowing", () => {
  it("does not grade a price constant in application code (only stored columns)", () => {
    expect(at(evaluateOperationalDepthChecks(snap({ "src/cart.ts": "const totalPrice = 19.99;" })), "global_depth_currency_precision").status).toBe("SKIPPED");
  });
  it("does not treat a database username env var as user accounts", () => {
    expect(
      at(evaluateOperationalDepthChecks(snap({ ".env.example": "DB_USERNAME=postgres" })), "global_depth_unicode_normalization").status,
    ).toBe("SKIPPED");
  });
  it("still warns on a username unique column with no normalisation", () => {
    expect(
      at(evaluateOperationalDepthChecks(snap({ "prisma/schema.prisma": "model User { username String @unique }" })), "global_depth_unicode_normalization").status,
    ).toBe("WARN");
  });
  it("accepts a zod email schema whose .string() carries options", () => {
    expect(
      evalKey("email_depth_address_validation", 'lib/validations/auth.ts\nconst { email } = req.body;\nconst s = z.string({ required_error: "x" }).email();\nawait sendEmail({ to: s.parse(email) })'),
    ).toBe("PASS");
  });
  it("keeps pg-boss in scope for dead-letter handling, where failed jobs are kept by default", () => {
    expect(
      at(
        evaluateOperationalDepthChecks(snap({ "src/worker.ts": 'import PgBoss from "pg-boss"; await boss.work("q", handler);' })),
        "infra_depth_dead_letter_queue",
      ).status,
    ).toBe("PASS");
  });
});

describe("infrastructure and observability subjects keep real systems", () => {
  const run = (files: Record<string, string>, key: string, extra: string[] = []) =>
    at(evaluateOperationalDepthChecks(snap(files, extra)), key).status;

  it("treats RDS automated backups as backups that need a restore drill", () => {
    expect(run({ "infra/rds.tf": 'resource "aws_db_instance" "db" {\n  backup_retention_period = 7\n}' }, "infra_depth_restore_drill")).toBe("WARN");
  });
  it("keeps Terraform SQS and the SQS SDK client in scope for queue metrics", () => {
    expect(run({ "infra/queue.tf": 'resource "aws_sqs_queue" "jobs" {}' }, "obs_depth_queue_metrics")).toBe("WARN");
    expect(run({ "src/queue.ts": "const client = new SQSClient({});" }, "obs_depth_queue_metrics")).toBe("WARN");
  });
  it("does not credit queue.length or an exporter's maxQueueSize as queue monitoring", () => {
    expect(run({ "src/jobs.ts": 'import { Queue } from "bullmq";\nif (queue.length > 0) drain();' }, "obs_depth_queue_metrics")).toBe("WARN");
    expect(run({ "src/otel.ts": 'import { Queue } from "bullmq";\nnew BatchSpanProcessor(exporter, { maxQueueSize: 2048 });' }, "obs_depth_queue_metrics")).toBe("WARN");
  });
  it("brings OpenTelemetry metrics into the latency histogram rule", () => {
    expect(run({ "src/metrics.ts": 'const h = meter.createHistogram("http.server.duration");' }, "obs_depth_latency_histogram")).toBe("PASS");
    expect(run({ "package.json": '{"dependencies":{"@opentelemetry/sdk-metrics":"^1.20.0"}}' }, "obs_depth_latency_histogram")).toBe("WARN");
  });
  it("keeps a camelCase database helper in scope for slow-query visibility", () => {
    expect(run({ "src/db.ts": "const db = getDatabase();" }, "obs_depth_slow_query_visibility")).toBe("WARN");
  });
  it("keeps an isMinor flag in scope for child consent", () => {
    expect(run({ "src/user.ts": "if (user.isMinor) block();" }, "legal_depth_child_consent")).toBe("WARN");
  });
  it("keeps a camelCase audit-log emitter in scope for UTC timestamps", () => {
    expect(run({ "src/audit.ts": "createAuditLog({ at: new Date().toLocaleString() });" }, "obs_depth_utc_timestamps")).toBe("WARN");
  });
  it("does not let a component folder named accessibility stand in for a statement page", () => {
    const files = { "app/page.tsx": 'import React from "react"; export default function Page() { return null; }' };
    expect(run(files, "pages_depth_accessibility_route", ["src/components/accessibility/focus.ts"])).not.toBe("PASS");
    expect(run(files, "pages_depth_accessibility_route", ["app/accessibility/page.tsx"])).toBe("PASS");
  });
});

describe("payments, performance and roles counter-examples", () => {
  it("fails a checkout that takes a client price even beside a pricing table", () => {
    expect(
      evalKey(
        "payments_depth_price_allowlist",
        "app/api/checkout/route.ts\nconst { priceId } = await req.json();\nawait stripe.checkout.sessions.create({ line_items: [{ price: priceId }] });\ncomponents/pricing.tsx\nconst rows = tiers.map(tier => ({ price: tier.price }));\nconst p = { price: plan.monthlyPrice };",
      ),
    ).toBe("FAIL");
  });
  it("passes a checkout using a server-owned plan price id (taxonomy)", () => {
    expect(
      evalKey(
        "payments_depth_price_allowlist",
        "app/api/users/stripe/route.ts\ncheckout.sessions.create({ line_items: [{ price: proPlan.stripePriceId, quantity: 1 }] });",
      ),
    ).toBe("PASS");
  });
  it("keeps react-dom/client, require(react) and Angular in scope for code splitting", () => {
    expect(evalKey("perf_depth_route_code_splitting", 'src/main.tsx\nimport ReactDOM from "react-dom/client";')).toBe("WARN");
    expect(evalKey("perf_depth_route_code_splitting", 'src/index.js\nconst React = require("react");')).toBe("WARN");
    expect(evalKey("perf_depth_route_code_splitting", 'package.json\n{"dependencies":{"@angular/core":"~17.0.0"}}')).toBe("WARN");
  });
  it("skips pagination JSON whose 'next' key is a URL", () => {
    expect(evalKey("perf_depth_route_code_splitting", 'fixtures/page.json\n{"next": "https://api/x?page=2"}')).toBe("SKIPPED");
  });
  it("keeps DRF and Laravel authorization layers in scope for default-deny", () => {
    expect(
      evalKey(
        "roles_depth_default_deny",
        'settings.py\nREST_FRAMEWORK = { "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.AllowAny"] }',
      ),
    ).not.toBe("SKIPPED");
    expect(evalKey("roles_depth_default_deny", 'AuthServiceProvider.php\nGate::define("edit", fn() => true);')).not.toBe("SKIPPED");
  });
  it("does not accept a null check on the session user as an ownership check", () => {
    expect(
      evalKey(
        "roles_depth_object_ownership",
        "app/api/items/[id]/route.ts\nif (session.user.id !== undefined) {\n  const item = await db.item.findUnique({ where: { id: params.id } });\n}",
      ),
    ).toBe("WARN");
  });
  it("keeps an unprotected adminRouter route in scope and flagged", () => {
    expect(evalKey("roles_depth_server_authorization", 'routes/admin.ts\nadminRouter.delete("/users/:id", handler);')).toBe("INCONCLUSIVE"); // Restored as presence-only (Oct 2026): an unrecognised guard reads like none, so absence is INCONCLUSIVE, not WARN.
  });
});

describe("sampling coverage", () => {
  const tfOnly = { "infra/rds.tf": 'resource "aws_db_instance" "db" {\n  backup_retention_period = 7\n}' };

  it("reports a fully-read Terraform-only repository's missing restore drill as a finding", () => {
    const check = at(evaluateOperationalDepthChecks(snap(tfOnly)), "infra_depth_restore_drill");
    expect(check.status).toBe("WARN");
    expect(check.confidence).toBe("MEDIUM");
  });

  it("treats the same absence on a truncated tree as unobserved", () => {
    const check = at(evaluateOperationalDepthChecks(snap(tfOnly, [], true)), "infra_depth_restore_drill");
    expect(check.status).toBe("INCONCLUSIVE");
    expect(check.confidence).toBe("LOW");
    expect(check.confidenceReason).toMatch(/too large to list in full/);
  });

  it("names plain files, not source files, when a repository has no application source", () => {
    const check = at(
      evaluateOperationalDepthChecks(snap(tfOnly, Array.from({ length: 10 }, (_, i) => `infra/unread-${i}.tf`))),
      "infra_depth_restore_drill",
    );
    expect(check.status).toBe("INCONCLUSIVE");
    expect(check.confidenceReason).toMatch(/1 of 11 files/);
    expect(check.confidenceReason).not.toMatch(/source files/);
  });
});

describe("vibe_depth_no_unresolved_markers reads release source only", () => {
  it("passes when the only marker sits in a test file", () => {
    const check = at(
      evaluateOperationalDepthChecks(snap({
        "src/__tests__/api.test.ts": "// TODO: cover the error path\nit('works', () => {});",
        "src/api.ts": "export function handler() { return ok(); }",
      })),
      "vibe_depth_no_unresolved_markers",
    );
    expect(check.status).toBe("PASS");
  });
  it("still warns on a marker in shipped code", () => {
    const check = at(
      evaluateOperationalDepthChecks(snap({
        "src/__tests__/api.test.ts": "it('works', () => {});",
        "app/api/posts/route.ts": "// TODO: validate the payload\nexport async function PATCH() {}",
      })),
      "vibe_depth_no_unresolved_markers",
    );
    expect(check.status).toBe("WARN");
  });
});
