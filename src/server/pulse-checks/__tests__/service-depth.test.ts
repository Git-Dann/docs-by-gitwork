import { describe, it, expect } from "vitest";
import { SERVICE_DEPTH_KEYS, SERVICE_DEPTH_REGISTRY, evaluateServiceDepthChecks } from "../service-depth";
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

const at = (files: Record<string, string>, key: string) => {
  const c = evaluateServiceDepthChecks(snap(files)).find((x) => x.checkKey === key);
  if (!c) throw new Error(`no check for ${key}`);
  return c;
};

describe("catalogue", () => {
  it("emits exactly the registered keys, every time", () => {
    const keys = evaluateServiceDepthChecks(snap({ "a.ts": "" })).map((c) => c.checkKey);
    expect(keys.sort()).toEqual([...SERVICE_DEPTH_KEYS].sort());
    expect(SERVICE_DEPTH_REGISTRY).toHaveLength(SERVICE_DEPTH_KEYS.length);
  });

  it("only touches the five categories with real headroom", () => {
    // The point of the file. AEO, Store Listing and Business Operations are small
    // because their surface is small; growing them would mean inventing checks.
    const cats = new Set(SERVICE_DEPTH_REGISTRY.map((r) => r.category));
    expect([...cats].sort()).toEqual([
      "API Quality",
      "Authentication",
      "Email Deliverability",
      "Observability",
      "Payments",
    ]);
  });

  it("skips everything for an empty repo rather than failing it", () => {
    const checks = evaluateServiceDepthChecks(snap({ "README.md": "hi" }));
    expect(checks.every((c) => c.status === "SKIPPED")).toBe(true);
  });
});

describe("authentication", () => {
  const authed = (extra: string) => ({ "package.json": '{"dependencies":{"next-auth":"^5"}}', "auth.ts": extra });

  it("fails when no password hashing is present", () => {
    expect(at(authed("export const login = () => {};"), "auth_x_password_hashing_modern").status).toBe("FAIL");
  });

  it("passes with bcrypt", () => {
    expect(at(authed("import bcrypt from 'bcrypt';"), "auth_x_password_hashing_modern").status).toBe("PASS");
  });

  it("skips auth checks entirely for a project with no auth", () => {
    expect(at({ "a.ts": "export const x = 1;" }, "auth_x_password_hashing_modern").status).toBe("SKIPPED");
  });

  it("fails an unpinned JWT algorithm", () => {
    const f = { "package.json": '{"dependencies":{"jsonwebtoken":"^9"}}', "t.ts": "jwt.verify(token, secret);" };
    expect(at(f, "auth_x_jwt_algorithm_pinned").status).toBe("FAIL");
  });

  it("passes a pinned algorithm list", () => {
    const f = {
      "package.json": '{"dependencies":{"jsonwebtoken":"^9"}}',
      "t.ts": "jwt.verify(token, secret, { algorithms: ['RS256'] });",
    };
    expect(at(f, "auth_x_jwt_algorithm_pinned").status).toBe("PASS");
  });

  it("skips the JWT check when no JWTs are used", () => {
    expect(at(authed("import bcrypt from 'bcrypt';"), "auth_x_jwt_algorithm_pinned").status).toBe("SKIPPED");
  });

  it("passes timing-safe comparison", () => {
    const f = { "a.ts": "const apiKey = h; crypto.timingSafeEqual(a, b);" };
    expect(at(f, "auth_x_timing_safe_compare").status).toBe("PASS");
  });
});

describe("observability", () => {
  const svc = (extra: string) => ({ "package.json": '{"dependencies":{"express":"^4"}}', "s.ts": extra });

  it("fails a log statement that writes a token", () => {
    expect(at(svc("logger.info('token', token);"), "obs_x_no_secrets_in_logs").status).toBe("FAIL");
  });

  it("stays quiet on ordinary logging", () => {
    expect(at(svc("logger.info('user created', { id });"), "obs_x_no_secrets_in_logs").status).toBe("PASS");
  });

  it("warns when a health endpoint checks nothing downstream", () => {
    const f = { "package.json": '{"dependencies":{"express":"^4"}}', "h.ts": "app.get('/health', () => 'ok');" };
    expect(at(f, "obs_x_dependency_health").status).toBe("WARN");
  });

  it("passes when the health endpoint pings the database", () => {
    const f = {
      "package.json": '{"dependencies":{"express":"^4"}}',
      "h.ts": "app.get('/health', async () => { await db.query('SELECT 1'); });",
    };
    expect(at(f, "obs_x_dependency_health").status).toBe("PASS");
  });
});

describe("api quality", () => {
  const svc = (extra: string) => ({ "package.json": '{"dependencies":{"express":"^4"}}', "s.ts": extra });

  it("warns on an outbound call with no timeout", () => {
    expect(at(svc("await fetch('https://api.example.com');"), "api_x_timeout_on_outbound").status).toBe("WARN");
  });

  it("passes when an AbortSignal timeout is set", () => {
    expect(
      at(svc("await fetch(url, { signal: AbortSignal.timeout(5000) });"), "api_x_timeout_on_outbound").status,
    ).toBe("PASS");
  });

  it("warns on retries with no backoff", () => {
    expect(at(svc("for (let i = 0; i < retries; i++) { await call(); }"), "api_x_retry_backoff").status).toBe("WARN");
  });

  it("passes with exponential backoff", () => {
    expect(
      at(svc("const wait = Math.pow(2, attempt) * 100; // retries with jitter"), "api_x_retry_backoff").status,
    ).toBe("PASS");
  });
});

describe("payments", () => {
  const pay = (extra: string) => ({ "package.json": '{"dependencies":{"stripe":"^16"}}', "p.ts": extra });

  it("fails an unverified webhook", () => {
    expect(at(pay("app.post('/webhook', (req) => handle(req.body));"), "pay_x_webhook_signature").status).toBe("FAIL");
  });

  it("passes constructEvent verification", () => {
    expect(at(pay("stripe.webhooks.constructEvent(body, sig, secret);"), "pay_x_webhook_signature").status).toBe("PASS");
  });

  it("fails a charge amount taken from the request body", () => {
    expect(at(pay("stripe.charges.create({ amount: req.body.amount });"), "pay_x_amount_server_side").status).toBe("FAIL");
  });

  it("passes when the amount is looked up server-side", () => {
    expect(
      at(pay("const amount = await priceFor(planId); stripe.charges.create({ amount });"), "pay_x_amount_server_side").status,
    ).toBe("PASS");
  });

  it("fails raw card fields in application code", () => {
    expect(at(pay("const cardNumber = form.cardNumber;"), "pay_x_no_card_data").status).toBe("FAIL");
  });

  it("skips every payment check for a project that takes no payments", () => {
    expect(at({ "a.ts": "export const x = 1;" }, "pay_x_webhook_signature").status).toBe("SKIPPED");
  });
});

describe("email", () => {
  const mail = (extra: string) => ({ "package.json": '{"dependencies":{"resend":"^4"}}', "m.ts": extra });

  it("warns when no bounce handling exists", () => {
    expect(at(mail("resend.emails.send({ to, subject });"), "mail_x_bounce_handling").status).toBe("WARN");
  });

  it("passes when bounces are handled", () => {
    expect(at(mail("if (event.type === 'email.bounced') suppress(to);"), "mail_x_bounce_handling").status).toBe("PASS");
  });

  it("warns on HTML-only mail", () => {
    expect(at(mail("send({ html: '<p>hi</p>' });"), "mail_x_plaintext_alternative").status).toBe("WARN");
  });

  it("passes when a text part is present", () => {
    expect(at(mail("send({ html: '<p>hi</p>', text: 'hi' });"), "mail_x_plaintext_alternative").status).toBe("PASS");
  });

  it("skips email checks for a project that sends none", () => {
    expect(at({ "a.ts": "export const x = 1;" }, "mail_x_bounce_handling").status).toBe("SKIPPED");
  });
});
