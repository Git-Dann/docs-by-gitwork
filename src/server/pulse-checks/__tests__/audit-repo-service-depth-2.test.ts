import { describe, it, expect } from "vitest";
import { evaluateServiceDepthChecks } from "../service-depth";
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

const nextApp = {
  "package.json": '{"private":true,"scripts":{"start":"next start"},"dependencies":{"next":"15.6.0-canary.60","react":"19.0.0"}}',
  "app/page.tsx": "export default async function HomePage() { return null; }",
};
const expressApp = (src: string) => ({
  "package.json": '{"dependencies":{"express":"^4.18.2"}}',
  "src/app.ts": `import express from "express";\nconst app = express();\n${src}\napp.listen(3000);`,
});
const djangoSettings =
  'INSTALLED_APPS = ["django.contrib.admin"]\n' +
  'if "sentry_dsn" in SECRETS and not DEBUG:\n    import sentry_sdk\n    from sentry_sdk.integrations.django import DjangoIntegration\n' +
  '    sentry_sdk.init(dsn=SECRETS["sentry_dsn"], integrations=[DjangoIntegration(transaction_style="function_name")], traces_sample_rate=0.1)\n';

describe("obs_x_uncaught_handler", () => {
  it("passes a Next.js app, whose server registers its own handlers", () => {
    expect(at(nextApp, "obs_x_uncaught_handler").status).toBe("PASS");
  });
  it("does not apply Node's crash rationale to a Django project", () => {
    expect(at({ "djangoproject/settings/prod.py": djangoSettings }, "obs_x_uncaught_handler").status).toBe("SKIPPED");
  });
  it("still warns a plain express server with no handler", () => {
    expect(at(expressApp("app.get('/', (_req, res) => res.send('ok'));"), "obs_x_uncaught_handler").status).toBe("WARN");
  });
  it("passes an express server with process.on('unhandledRejection')", () => {
    expect(
      at(expressApp("process.on('unhandledRejection', (e) => logger.error(e));"), "obs_x_uncaught_handler").status,
    ).toBe("PASS");
  });
});

describe("obs_x_tracing", () => {
  it("does not pass on a transitive @opentelemetry/api lockfile entry", () => {
    const files = {
      ...nextApp,
      "pnpm-lock.yaml": "  next@15.6.0-canary.60:\n    peerDependencies:\n      \"@opentelemetry/api\": ^1.1.0\n",
    };
    expect(at(files, "obs_x_tracing").status).toBe("WARN");
  });
  it("passes Sentry performance tracing in Django settings", () => {
    expect(at({ "djangoproject/settings/prod.py": djangoSettings }, "obs_x_tracing").status).toBe("PASS");
  });
  it("passes Sentry tracesSampleRate in a Node app", () => {
    const files = {
      ...nextApp,
      "apps/web/sentry.server.config.ts":
        'import * as Sentry from "@sentry/nextjs";\nSentry.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0.0") || 0.0 });',
    };
    expect(at(files, "obs_x_tracing").status).toBe("PASS");
  });
  it("still warns a service with no tracing", () => {
    expect(at(expressApp("app.get('/', (_req, res) => res.send('ok'));"), "obs_x_tracing").status).toBe("WARN");
  });
  it("still passes a real OpenTelemetry SDK setup", () => {
    expect(
      at(expressApp('import { NodeSDK } from "@opentelemetry/sdk-node";\nnew NodeSDK().start();'), "obs_x_tracing").status,
    ).toBe("PASS");
  });
});

describe("obs_x_startup_config_validation", () => {
  it("passes a getEnv that throws on a missing variable", () => {
    const files = {
      "package.json": '{"dependencies":{"@nestjs/core":"^10.0.0","@nestjs/config":"^3.0.0"}}',
      "apps/api/v2/src/env.ts":
        "export const getEnv = <K extends keyof Environment>(key: K, fallback?: Environment[K]): Environment[K] => {\n" +
        "  const value = process.env[key] as Environment[K] | undefined;\n" +
        "  if (value === undefined) {\n    if (fallback !== undefined) return fallback;\n" +
        "    throw new Error(`Missing environment variable: ${key}.`);\n  }\n  return value;\n};",
    };
    expect(at(files, "obs_x_startup_config_validation").status).toBe("PASS");
  });
  it("still warns a service that reads process.env unchecked", () => {
    expect(
      at(expressApp("const apiUrl = process.env.API_URL; app.get('/', (_q, r) => r.send(apiUrl));"), "obs_x_startup_config_validation").status,
    ).toBe("WARN");
  });
});

describe("pay_x_currency_explicit", () => {
  const stripePkg = { "package.json": '{"dependencies":{"stripe":"^11.1.0","next":"13.3.2"}}' };
  it("does not warn a checkout that references a provider price ID", () => {
    const files = {
      ...stripePkg,
      "app/api/users/stripe/route.ts":
        "const stripeSession = await stripe.checkout.sessions.create({\n  success_url: billingUrl,\n  mode: \"subscription\",\n" +
        "  line_items: [{ price: proPlan.stripePriceId, quantity: 1 }],\n});",
    };
    expect(at(files, "pay_x_currency_explicit").status).toBe("SKIPPED");
  });
  it("does not treat a CI 'concurrency' key as a currency", () => {
    const files = {
      ...stripePkg,
      "lib/pay.ts": "await stripe.paymentIntents.create({ amount: 2000, payment_method_types: ['card'] });",
      ".github/workflows/ci.yml": "concurrency:\n  group: ${{ github.ref }}\n  cancel-in-progress: true\n",
    };
    expect(at(files, "pay_x_currency_explicit").status).toBe("WARN");
  });
  it("still passes an amount that carries a currency", () => {
    const files = {
      ...stripePkg,
      "lib/pay.ts": "await stripe.paymentIntents.create({ amount: 2000, currency: \"gbp\" });",
    };
    expect(at(files, "pay_x_currency_explicit").status).toBe("PASS");
  });
});

describe("pay_x_webhook_signature", () => {
  const pkg = { "package.json": '{"dependencies":{"stripe":"^9.16.0","next":"14.0.0"}}' };
  it("passes a webhook that checks svix-signature", () => {
    const files = {
      ...pkg,
      "packages/app-store/vital/api/webhook.ts":
        'const sig = req.headers["svix-signature"];\nif (!sig) {\n  throw new HttpCode({ statusCode: 400, message: "Missing svix-signature" });\n}\n' +
        "const payload = wh.verify(rawBody, headers);",
    };
    expect(at(files, "pay_x_webhook_signature").status).toBe("PASS");
  });
  it("passes a webhook that checks a provider HMAC", () => {
    const files = {
      ...pkg,
      "packages/app-store/btcpayserver/api/webhook.ts":
        "function verifyBTCPaySignature(rawBody: Buffer, expectedSignature: string, secret: string): string {\n" +
        '  const hmac = crypto.createHmac("sha256", secret);\n  hmac.update(rawBody);\n  return hmac.digest("hex");\n}',
    };
    expect(at(files, "pay_x_webhook_signature").status).toBe("PASS");
  });
  it("skips a payments project with no webhook at all", () => {
    const files = {
      ...pkg,
      "app/api/users/stripe/route.ts": "await stripe.checkout.sessions.create({ line_items: [{ price: id, quantity: 1 }] });",
    };
    expect(at(files, "pay_x_webhook_signature").status).toBe("SKIPPED");
  });
  it("still fails an unverified webhook handler", () => {
    const files = { ...pkg, "p.ts": "app.post('/webhook', (req) => handle(req.body));" };
    expect(at(files, "pay_x_webhook_signature").status).toBe("FAIL");
  });
  it("still passes Stripe constructEvent", () => {
    const files = { ...pkg, "p.ts": "stripe.webhooks.constructEvent(body, sig, secret);" };
    expect(at(files, "pay_x_webhook_signature").status).toBe("PASS");
  });
});

// Reviewer follow-ups for the revised gates.
describe("revisions keep their negative cases", () => {
  it("obs_x_tracing: zero-code agents wired in config PASS", () => {
    const procfile = { ...expressApp("app.get('/', h);"), Procfile: "web: ddtrace-run node server.js\n" };
    const javaagent = {
      ...expressApp("app.get('/', h);"),
      Dockerfile: "FROM eclipse-temurin:21-jre\nENTRYPOINT [\"java\", \"-javaagent:/otel/opentelemetry-javaagent.jar\", \"-jar\", \"app.jar\"]\n",
    };
    expect(at(procfile, "obs_x_tracing").status).toBe("PASS");
    expect(at(javaagent, "obs_x_tracing").status).toBe("PASS");
  });

  it("obs_x_tracing: an @opentelemetry entry in a lockfile alone does not PASS", () => {
    const files = {
      ...expressApp("app.get('/', h);"),
      "pnpm-lock.yaml": "  /@opentelemetry/api@1.9.0:\n    resolution: {integrity: sha512-x}\n",
    };
    expect(at(files, "obs_x_tracing").status).toBe("WARN");
  });

  it("pay_x_currency_explicit: Python amount= with no currency WARNs, not SKIPPED", () => {
    const files = {
      "requirements.txt": "stripe==8.0\nflask==3.0\n",
      "app/pay.py": "intent = stripe.PaymentIntent.create(amount=2000)\n",
    };
    expect(at(files, "pay_x_currency_explicit").status).toBe("WARN");
  });

  it("pay_x_currency_explicit: a price-ID checkout SKIPs without claiming the project takes no payments", () => {
    const files = {
      "package.json": '{"dependencies":{"next":"14.0.0","stripe":"^11.18.0"}}',
      "app/checkout.ts": "await stripe.checkout.sessions.create({ line_items: [{ price: env.STRIPE_PRO_PRICE_ID, quantity: 1 }] });",
    };
    const c = at(files, "pay_x_currency_explicit");
    expect(c.status).toBe("SKIPPED");
    expect(c.detail).not.toMatch(/does not appear to take payments/i);
  });

  it("pay_x_webhook_signature: an unverified handler identified by provider event names FAILs", () => {
    const files = {
      "package.json": '{"dependencies":{"next":"14.0.0","stripe":"^11.18.0"}}',
      "app/api/stripe/events/route.ts":
        "export async function POST(req: Request) { const event = await req.json(); if (event.type === 'checkout.session.completed') await grant(event.data.object.customer); return new Response('ok'); }",
    };
    expect(at(files, "pay_x_webhook_signature").status).toBe("FAIL");
  });

  it("pay_x_webhook_signature: timingSafeEqual used for an API key elsewhere does not vouch for the webhook", () => {
    const files = {
      "package.json": '{"dependencies":{"express":"^4.18.2","stripe":"^11.18.0"}}',
      "src/webhook.ts": "app.post('/webhook', (req, res) => { fulfil(req.body); res.sendStatus(200); });",
      "src/apikey.ts": "export const ok = (k: Buffer) => crypto.timingSafeEqual(k, expectedKey);",
    };
    expect(at(files, "pay_x_webhook_signature").status).toBe("FAIL");
  });

  // Known gap, not fixed here: Sentry.init in a browser-only sentry.client.config.ts
  // currently counts as a process-level handler for an Express server beside it.
  it.todo("obs_x_uncaught_handler: Sentry.init only in sentry.client.config.ts does not pass an express server");
});
