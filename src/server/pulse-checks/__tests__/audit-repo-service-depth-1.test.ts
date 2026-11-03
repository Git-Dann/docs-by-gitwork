import { describe, it, expect } from "vitest";
import { evaluateServiceDepthChecks } from "../service-depth";
import type { RepoSnapshot } from "../native-mobile";

// Audit packet repo-service-depth-1. Fixtures are trimmed from the repositories the
// audit scanned and checked by hand: shadcn-ui/taxonomy, calcom/cal.com,
// gothinkster/node-express-realworld-example-app, discourse/discourse,
// vercel/commerce and tmoreton/tutorials. Every block pairs an input whose verdict
// had to change with a realistic one whose verdict must not.

function snap(files: Record<string, string>, unreadPaths: string[] = []): RepoSnapshot {
  return {
    owner: "o",
    repo: "r",
    paths: [...Object.keys(files), ...unreadPaths],
    files: new Map(Object.entries(files)),
    truncated: false,
    accessible: true,
  };
}

const at = (files: Record<string, string>, key: string, unreadPaths: string[] = []) => {
  const c = evaluateServiceDepthChecks(snap(files, unreadPaths)).find((x) => x.checkKey === key);
  if (!c) throw new Error("no check for " + key);
  return c;
};

/** Source paths listed in the tree but not read — a thin sample of a big monorepo. */
const UNREAD = Array.from({ length: 300 }, (_, i) => "packages/features/f" + i + ".ts");

/** shadcn-ui/taxonomy: next-auth with GitHub + magic-link providers, Stripe, Postmark. */
const TAXONOMY: Record<string, string> = {
  "package.json":
    '{"dependencies":{"next":"13.3.2","next-auth":"4.22.1","@next-auth/prisma-adapter":"^1.0.6","postmark":"^3.0.15","stripe":"^11.18.0"}}',
  "lib/auth.ts": [
    'import { NextAuthOptions } from "next-auth"',
    'import EmailProvider from "next-auth/providers/email"',
    'import GitHubProvider from "next-auth/providers/github"',
    "export const authOptions: NextAuthOptions = {",
    '  session: { strategy: "jwt" },',
    '  pages: { signIn: "/login" },',
    "  providers: [",
    "    GitHubProvider({ clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET }),",
    "    EmailProvider({ from: env.SMTP_FROM }),",
    "  ],",
    "}",
  ].join("\n"),
  "app/api/webhooks/stripe/route.ts": [
    'const signature = headers().get("Stripe-Signature") as string',
    "event = stripe.webhooks.constructEvent(body, signature, env.STRIPE_WEBHOOK_SECRET)",
  ].join("\n"),
  "pnpm-lock.yaml": "  /jose@4.14.1:\n    resolution: {integrity: sha512-x}\n      jose: 4.14.1\n",
};

/** gothinkster/node-express-realworld-example-app: stateless JWT, bcrypt, no sessions. */
const REALWORLD: Record<string, string> = {
  "package.json":
    '{"dependencies":{"express":"~4.18.1","express-jwt":"^8.4.1","jsonwebtoken":"^9.0.0","bcryptjs":"^2.4.3","axios":"^1.0.0"}}',
  "package-lock.json": '"node_modules/regenerate": {\n  "version": "1.4.2"\n}',
  "src/app/routes/auth/auth.ts":
    "const auth = { required: jwt({ secret: process.env.JWT_SECRET || 'superSecret', algorithms: ['HS256'] }) };",
  "src/app/routes/auth/auth.service.ts": [
    "import * as bcrypt from 'bcryptjs';",
    "export const login = async (userPayload: any) => {",
    "  const { email, password } = userPayload;",
    "  const match = await bcrypt.compare(password, user.password);",
    "};",
  ].join("\n"),
  "src/main.ts": "app.listen(PORT, () => { console.info('server up on port ' + PORT); });",
  "src/tests/services/auth.service.test.ts": "await expect(login(user)).resolves.toHaveProperty('token');",
  "e2e/src/server/server.spec.ts": "import axios from 'axios';\nconst res = await axios.get('/');",
};

describe("lockfiles and test files are not the product", () => {
  it("does not treat a transitive jose in pnpm-lock as JWT verification", () => {
    expect(at(TAXONOMY, "auth_x_jwt_algorithm_pinned").status).toBe("SKIPPED");
  });

  it("still FAILs an unpinned verify on jsonwebtoken 8", () => {
    const f = {
      "package.json": '{"dependencies":{"jsonwebtoken":"^8.5.1"}}',
      "src/auth.ts": "const decoded = jwt.verify(token, publicKey);",
    };
    expect(at(f, "auth_x_jwt_algorithm_pinned").status).toBe("FAIL");
  });

  it("does not PASS session rotation on Babel's regenerate package in package-lock", () => {
    expect(at(REALWORLD, "auth_x_session_rotation").status).toBe("SKIPPED");
  });

  it("does not treat an e2e axios client as an outbound call", () => {
    expect(at(REALWORLD, "api_x_timeout_on_outbound").status).toBe("SKIPPED");
  });

  it("does not read expect(login(user))...('token') in a spec as a log statement", () => {
    expect(at(REALWORLD, "obs_x_no_secrets_in_logs").status).toBe("PASS");
  });

  it("does not treat a transitive pino in a nested lockfile as a configured logger", () => {
    const tutorials = {
      "app/MyAgent/package-lock.json": '"node_modules/pino": {\n  "version": "9.5.0"\n}',
      "app/MyAgent/main.ts": "const app = new BedrockAgentCoreApp({ invocationHandler: { process: handler } });",
    };
    expect(at(tutorials, "obs_x_log_retention_config").status).toBe("SKIPPED");
  });

  it("still WARNs a winston file transport with no rotation", () => {
    const f = {
      "package.json": '{"dependencies":{"winston":"^3.11.0"}}',
      "src/logger.ts": "export const logger = winston.createLogger({ transports: [new winston.transports.File({ filename: 'app.log' })] });",
    };
    expect(at(f, "obs_x_log_retention_config").status).toBe("WARN");
  });
});

describe("password-dependent auth checks", () => {
  it("skips password hashing and login rate limiting for OAuth + magic-link auth", () => {
    expect(at(TAXONOMY, "auth_x_password_hashing_modern").status).toBe("SKIPPED");
    expect(at(TAXONOMY, "auth_x_login_rate_limit").status).toBe("SKIPPED");
  });

  it("still FAILs a credentials provider that compares plaintext passwords", () => {
    const f = {
      "package.json": '{"dependencies":{"next-auth":"4.22.1"}}',
      "lib/auth.ts":
        "CredentialsProvider({ async authorize(credentials) { const user = await db.user.findUnique({ where: { email: credentials.email } }); if (user && user.password === credentials.password) return user; return null; } })",
    };
    expect(at(f, "auth_x_password_hashing_modern").status).toBe("FAIL");
  });

  it("passes bcrypt and still WARNs the missing login rate limit on the realworld app", () => {
    expect(at(REALWORLD, "auth_x_password_hashing_modern").status).toBe("PASS");
    expect(at(REALWORLD, "auth_x_login_rate_limit").status).toBe("WARN");
  });

  it("credits Devise now that Gemfile.lock is not read", () => {
    const f = {
      Gemfile: 'gem "rails", "~> 7.1"\ngem "devise"',
      "Gemfile.lock": "    bcrypt (3.1.20)\n    devise (4.9.3)",
      "app/models/user.rb":
        "class User < ApplicationRecord\n  devise :database_authenticatable, :registerable, :recoverable\n  validates :password, length: { minimum: 12 }\nend",
    };
    expect(at(f, "auth_x_password_hashing_modern").status).toBe("PASS");
  });
});

describe("auth_x_session_rotation", () => {
  it("passes next-auth, which issues a fresh session token at sign-in", () => {
    expect(at(TAXONOMY, "auth_x_session_rotation").status).toBe("PASS");
  });

  it("still WARNs express-session that never regenerates", () => {
    const f = {
      "package.json": '{"dependencies":{"express":"^4.18.2","express-session":"^1.17.3","bcrypt":"^5.1.1"}}',
      "src/routes/login.ts":
        "router.post('/login', async (req, res) => {\n  if (await bcrypt.compare(req.body.password, user.hash)) {\n    req.session.userId = user.id;\n    res.redirect('/');\n  }\n});",
    };
    expect(at(f, "auth_x_session_rotation").status).toBe("WARN");
  });
});

describe("auth_x_jwt_algorithm_pinned", () => {
  it("passes an unpinned verify on jsonwebtoken 9, which derives algorithms from the key", () => {
    const calcom = {
      "package.json": '{"dependencies":{"jsonwebtoken":"9.0.0"}}',
      "packages/features/oauth/services/OAuthService.ts":
        "const decoded = jwt.verify(refreshToken, secretKey) as DecodedRefreshToken;",
    };
    expect(at(calcom, "auth_x_jwt_algorithm_pinned").status).toBe("PASS");
  });
});

describe("auth_x_timing_safe_compare", () => {
  it("skips repos that only mention tokens and secrets without comparing them", () => {
    expect(at(TAXONOMY, "auth_x_timing_safe_compare").status).toBe("SKIPPED");
    expect(at(REALWORLD, "auth_x_timing_safe_compare").status).toBe("SKIPPED");
    expect(at({ "src/a.ts": 'if (typeof token === "string") return token;' }, "auth_x_timing_safe_compare").status).toBe(
      "SKIPPED",
    );
  });

  it("still WARNs a webhook token compared with !==", () => {
    const f = {
      "packages/features/calendar-subscription/adapters/GoogleCalendarSubscription.adapter.ts":
        '    if (token !== this.GOOGLE_WEBHOOK_TOKEN) {\n      throw new Error("Invalid webhook token");\n    }',
    };
    expect(at(f, "auth_x_timing_safe_compare").status).toBe("WARN");
  });
});

describe("obs_x_no_secrets_in_logs", () => {
  it("passes a comment mentioning a login form and a message mentioning passwords", () => {
    const discourse = {
      Gemfile: 'gem "rails"',
      "app/controllers/static_controller.rb":
        "  # a post of a login form so that it offers to remember your password.\n  def enter\n  end",
      "lib/common_passwords.rb":
        '    Rails.logger.error "Common passwords file #{PASSWORD_FILE} is not found! Common password checking is skipped."',
    };
    expect(at(discourse, "obs_x_no_secrets_in_logs").status).toBe("PASS");
  });

  it("still FAILs a debug log of an access token", () => {
    const calcom = {
      "package.json": '{"dependencies":{"next":"14.2.0"}}',
      "packages/app-store/zohocrm/lib/CrmService.ts": '          this.log.debug("Fetched token", this.accessToken);',
    };
    expect(at(calcom, "obs_x_no_secrets_in_logs").status).toBe("FAIL");
  });

  it("still FAILs an interpolated token and a logged Authorization header", () => {
    const py = { "requirements.txt": "flask==3.0.0", "app/auth.py": '    logger.info(f"issued token={token}")' };
    expect(at(py, "obs_x_no_secrets_in_logs").status).toBe("FAIL");
    const go = {
      "go.mod": "module x\nrequire github.com/gin-gonic/gin v1.9.1",
      "main.go": 'log.Printf("auth header %s", r.Header.Get("Authorization"))',
    };
    expect(at(go, "obs_x_no_secrets_in_logs").status).toBe("FAIL");
  });
});

describe("api_x_idempotency", () => {
  it("skips a static site whose only 'order' is a CSS border", () => {
    const tutorials = {
      "index.html": '<style>.card{border:1px solid #333;border-radius:8px}</style><form method="POST" action="/subscribe">',
      "proxy/index.mjs": "export const handler = async (event) => ({ statusCode: 200, body: event.body });",
    };
    expect(at(tutorials, "api_x_idempotency").status).toBe("SKIPPED");
  });

  const orders = {
    "package.json": '{"dependencies":{"express":"^4.18.2","stripe":"^14.0.0"}}',
    "src/routes/orders.ts":
      "router.post('/orders', async (req, res) => {\n  const intent = await stripe.paymentIntents.create({ amount: order.total, currency: 'gbp' });\n});",
  };

  it("still WARNs a payment route with no idempotency key at full coverage", () => {
    const c = at(orders, "api_x_idempotency");
    expect(c.status).toBe("WARN");
    expect(c.confidence).toBe("HIGH");
  });

  it("downgrades the absence to LOW confidence on a thin sample", () => {
    expect(at(orders, "api_x_idempotency", UNREAD).confidence).toBe("LOW");
  });
});

describe("api_x_retry_backoff", () => {
  it("skips a comment that says the provider retries", () => {
    const commerce = {
      "package.json": '{"dependencies":{"next":"15.0.0"}}',
      "lib/shopify/index.ts":
        "  // We always need to respond with a 200 status code to Shopify,\n  // otherwise it will continue to retry the request.\n  const result = await fetch(endpoint, { method: 'POST', headers });",
    };
    expect(at(commerce, "api_x_retry_backoff").status).toBe("SKIPPED");
  });

  const loop = {
    "src/send.ts": "for (let attempt = 0; attempt < maxRetries; attempt++) {\n  try { return await send(); } catch {}\n}",
  };

  it("still WARNs an immediate retry loop", () => {
    const c = at(loop, "api_x_retry_backoff");
    expect(c.status).toBe("WARN");
    expect(c.confidence).toBe("HIGH");
  });

  it("downgrades the absence to LOW confidence on a thin sample", () => {
    expect(at(loop, "api_x_retry_backoff", UNREAD).confidence).toBe("LOW");
  });

  it("passes Math.pow backoff", () => {
    const calcom = {
      "packages/app-store/dailyvideo/lib/scripts/deleteRecordings.ts":
        "while (retries <= maxRetries) {\n  const backoffDelay = Math.pow(2, retries) * 1000;\n  await new Promise((resolve) => setTimeout(resolve, backoffDelay));\n  retries++;\n}",
    };
    expect(at(calcom, "api_x_retry_backoff").status).toBe("PASS");
  });
});

describe("api_x_timeout_on_outbound", () => {
  it("WARNs an unbounded fetch without claiming Node's fetch waits forever", () => {
    const commerce = { "lib/shopify/index.ts": "const result = await fetch(endpoint, { method: 'POST', headers, body });" };
    const c = at(commerce, "api_x_timeout_on_outbound");
    expect(c.status).toBe("WARN");
    expect(c.detail).not.toContain("both wait indefinitely");
    expect(c.detail).toContain("five minutes");
  });

  it("passes a fetch with an AbortSignal timeout", () => {
    const f = { "lib/shopify/index.ts": "const result = await fetch(endpoint, { signal: AbortSignal.timeout(10_000) });" };
    expect(at(f, "api_x_timeout_on_outbound").status).toBe("PASS");
  });
});

describe("obs_x_metrics_endpoint", () => {
  it("passes Sentry metrics instrumentation", () => {
    const calcom = {
      "package.json": '{"dependencies":{"next":"14.2.0","@sentry/nextjs":"10.33.0"}}',
      "packages/features/calendar-subscription/lib/CalendarSubscriptionService.ts":
        'import { metrics } from "@sentry/nextjs";\nmetrics.distribution("calendar.subscription.webhook.duration_ms", durationMs, { attributes });',
    };
    expect(at(calcom, "obs_x_metrics_endpoint").status).toBe("PASS");
  });

  const plain = {
    "package.json": '{"dependencies":{"express":"^4.18.2"}}',
    "src/main.ts": "app.listen(PORT);",
  };

  it("still WARNs a service with no metrics at full coverage", () => {
    const c = at(plain, "obs_x_metrics_endpoint");
    expect(c.status).toBe("WARN");
    expect(c.confidence).toBe("HIGH");
  });

  it("downgrades the absence to LOW confidence on a thin sample", () => {
    expect(at(plain, "obs_x_metrics_endpoint", UNREAD).confidence).toBe("LOW");
  });
});

// Reviewer follow-ups: the revised applicability gates must still reach the cases they
// exist for.
describe("revisions keep their negative cases", () => {
  it("a passport-local strategy comparing user.pwd === pwd FAILs hashing and WARNs rate limiting", () => {
    const f = {
      "package.json": '{"dependencies":{"express":"^4.18.2","passport":"^0.7.0","passport-local":"^1.0.0"}}',
      "src/auth.ts":
        "passport.use(new LocalStrategy((u, pwd, done) => { const user = users.find(u); if (user.pwd === pwd) return done(null, user); return done(null, false); }));",
    };
    expect(at(f, "auth_x_password_hashing_modern").status).toBe("FAIL");
    expect(at(f, "auth_x_login_rate_limit").status).toBe("WARN");
  });

  it("a PHP $_SESSION login with no session_regenerate_id WARNs session rotation; with it, PASSes", () => {
    const login = (extra: string) => ({
      "composer.json": '{"require":{"php":"^8.2"}}',
      "public/login.php":
        "<?php session_start();\nif (password_verify($_POST['password'], $row['hash'])) {\n" +
        extra +
        "  $_SESSION['uid'] = $row['id'];\n}\n$hash = password_hash($pw, PASSWORD_BCRYPT);\n",
    });
    // doesAuth needs an auth library signal; bcrypt via password_hash(PASSWORD_BCRYPT).
    expect(at(login(""), "auth_x_session_rotation").status).toBe("WARN");
    expect(at(login("  session_regenerate_id(true);\n"), "auth_x_session_rotation").status).toBe("PASS");
  });

  it("a webhook signature compared with !== against a quoted header key WARNs timing-safe compare", () => {
    const f = {
      "package.json": '{"dependencies":{"express":"^4.18.2"}}',
      "src/hook.ts":
        "const expected = sign(body);\nif (req.headers['x-hub-signature-256'] !== expected) return res.sendStatus(401);",
    };
    expect(at(f, "auth_x_timing_safe_compare").status).toBe("WARN");
  });

  it("idempotency applies to createOrder and stripeClient.paymentIntents identifiers", () => {
    const order = { "package.json": '{"dependencies":{"express":"^4.18.2"}}', "src/r.ts": "router.post('/x', createOrder);" };
    const stripe = {
      "package.json": '{"dependencies":{"express":"^4.18.2"}}',
      "src/p.ts": "await stripeClient.paymentIntents.create({ amount, currency: 'gbp' });",
    };
    expect(at(order, "api_x_idempotency").status).toBe("WARN");
    expect(at(stripe, "api_x_idempotency").status).toBe("WARN");
  });

  it("idempotency does not apply to a CSS border or a Postmark mention", () => {
    const f = {
      "package.json": '{"dependencies":{"express":"^4.18.2"}}',
      "src/ui.ts": "const cls = 'border-b'; const style = { borderBottom: 1 }; import { ServerClient } from 'postmark';",
    };
    expect(at(f, "api_x_idempotency").status).toBe("SKIPPED");
  });

  it("an immediate retry loop on a `tries` counter, or Python range(self.retries), WARNs retry backoff", () => {
    const js = {
      "package.json": '{"dependencies":{"express":"^4.18.2"}}',
      "src/c.ts": "let tries = 0;\nwhile (tries++ < 5) { try { return await call(); } catch (e) {} }",
    };
    const py = {
      "requirements.txt": "flask==3.0\n",
      "app/client.py": "class C:\n    def go(self):\n        for _ in range(self.retries):\n            try:\n                return call()\n            except Exception:\n                pass\n",
    };
    expect(at(js, "api_x_retry_backoff").status).toBe("WARN");
    expect(at(py, "api_x_retry_backoff").status).toBe("WARN");
  });

  it("doesAuth ignores lockfiles: a transitive jose/bcrypt in a lockfile alone is not authentication", () => {
    const f = {
      "package.json": '{"dependencies":{"express":"^4.18.2"}}',
      "src/app.ts": "app.get('/', (q, r) => r.send('ok'));",
      "pnpm-lock.yaml": "  /jose@4.14.1:\n    resolution: {integrity: sha512-x}\n  /bcrypt@5.1.0:\n",
    };
    expect(at(f, "auth_x_password_hashing_modern").status).toBe("SKIPPED");
    expect(at(f, "auth_x_jwt_algorithm_pinned").status).toBe("SKIPPED");
    // The same auth library named in the project's own manifest does apply.
    const own = { ...f, "package.json": '{"dependencies":{"express":"^4.18.2","jsonwebtoken":"^8.5.1"}}', "src/v.ts": "jwt.verify(token, key);" };
    expect(at(own, "auth_x_jwt_algorithm_pinned").status).toBe("FAIL");
  });
});
