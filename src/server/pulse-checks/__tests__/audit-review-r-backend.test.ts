import { describe, it, expect } from "vitest";
import { evaluateServiceDepthChecks } from "../service-depth";
import { evaluateContainerChecks } from "../containers";
import { evaluateBackendServiceChecks } from "../backend-service";
import type { RepoSnapshot } from "../native-mobile";

// Adversarial review of the r-backend fixes. Each block pairs an input whose verdict
// the review had to change with a representative one whose verdict must not.

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

const sd = (files: Record<string, string>, key: string, unread: string[] = []) => {
  const c = evaluateServiceDepthChecks(snap(files, unread)).find((x) => x.checkKey === key);
  if (!c) throw new Error("no check for " + key);
  return c;
};

const UNREAD = Array.from({ length: 300 }, (_, i) => "src/modules/m" + i + ".ts");

/** passport in package.json; the sampled file has no password handling in it. */
const PASSPORT_APP: Record<string, string> = {
  "package.json": '{"dependencies":{"express":"^4.18.0","passport":"^0.7.0","passport-local":"^1.0.0"}}',
  "src/server.ts": 'import express from "express";\nconst app = express();\napp.listen(3000);\n',
};

describe("a narrowed `applies` on a thin sample is inconclusive, not a confident SKIPPED", () => {
  it("password hashing is INCONCLUSIVE/LOW when password code may sit in an unread file", () => {
    const c = sd(PASSPORT_APP, "auth_x_password_hashing_modern", UNREAD);
    expect(c.status).toBe("INCONCLUSIVE");
    expect(c.confidence).toBe("LOW");
    expect(c.detail).not.toMatch(/delegated/);
  });

  it("the same repo, fully read, is a confident SKIPPED", () => {
    const c = sd(PASSPORT_APP, "auth_x_password_hashing_modern");
    expect(c.status).toBe("SKIPPED");
    expect(c.confidence).toBe("HIGH");
  });

  it("login rate limit follows the same rule", () => {
    expect(sd(PASSPORT_APP, "auth_x_login_rate_limit", UNREAD).status).toBe("INCONCLUSIVE");
    expect(sd(PASSPORT_APP, "auth_x_login_rate_limit").status).toBe("SKIPPED");
  });

  it("a project with no auth at all is still SKIPPED even on a thin sample", () => {
    const files = { "package.json": '{"dependencies":{"express":"^4.18.0"}}', "src/server.ts": "app.listen(3000)\n" };
    expect(sd(files, "auth_x_password_hashing_modern", UNREAD).status).toBe("SKIPPED");
  });
});

describe("pay_x_webhook_signature credits a hand-rolled HMAC check", () => {
  const base = {
    "package.json": '{"dependencies":{"next":"14.0.0","@lemonsqueezy/lemonsqueezy.js":"^2.0.0","stripe":"^14.0.0"}}',
  };

  it("passes the documented Lemon Squeezy pattern (createHmac + timingSafeEqual)", () => {
    const files = {
      ...base,
      "app/api/webhook/route.ts": [
        "export async function POST(request: Request) {",
        "  const rawBody = await request.text();",
        "  const hmac = crypto.createHmac('sha256', process.env.LEMON_SECRET!);",
        "  const digest = Buffer.from(hmac.update(rawBody).digest('hex'), 'utf8');",
        "  const sig = Buffer.from(request.headers.get(SIG_HEADER) || '', 'utf8');",
        "  if (!crypto.timingSafeEqual(digest, sig)) throw new Error('bad');",
        "}",
      ].join("\n"),
    };
    expect(sd(files, "pay_x_webhook_signature").status).toBe("PASS");
  });

  it("still fails a webhook whose only timingSafeEqual compares an API key", () => {
    const files = {
      ...base,
      "app/api/webhook/route.ts": [
        "export async function POST(request: Request) {",
        "  const event = await request.json();",
        "  await fulfil(event);",
        "}",
      ].join("\n"),
      "lib/auth.ts": "export const ok = (a: Buffer, b: Buffer) => crypto.timingSafeEqual(a, b);\n",
    };
    expect(sd(files, "pay_x_webhook_signature").status).toBe("FAIL");
  });
});

describe("api_x_idempotency ignores prose", () => {
  const svc = { "package.json": '{"dependencies":{"express":"^4.18.0"}}' };

  it("does not apply on 'in order to' in a comment", () => {
    const files = { ...svc, "src/server.ts": "// in order to keep the cache warm we ping it\napp.listen(3000);\n" };
    expect(sd(files, "api_x_idempotency").status).toBe("SKIPPED");
  });

  it("still applies to an orders route", () => {
    const files = { ...svc, "src/server.ts": "app.post('/orders', async (req, res) => { await db.insert(req.body); });\n" };
    expect(sd(files, "api_x_idempotency").status).toBe("WARN");
  });
});

describe("obs_x_no_secrets_in_logs reads only the log call's own arguments", () => {
  const svc = { "package.json": '{"dependencies":{"express":"^4.18.0"}}' };

  it("passes a log call followed by an unrelated statement on the same line", () => {
    const files = { ...svc, "src/a.ts": 'logger.info("issued"); return token;\n' };
    expect(sd(files, "obs_x_no_secrets_in_logs").status).toBe("PASS");
  });

  it("still fails a log call whose argument is the token", () => {
    const files = { ...svc, "src/a.ts": 'logger.info("issued", token); return null;\n' };
    expect(sd(files, "obs_x_no_secrets_in_logs").status).toBe("FAIL");
  });

  it("still fails an interpolated token", () => {
    const files = { ...svc, "src/a.ts": "console.log(`issued ${user.token}`);\n" };
    expect(sd(files, "obs_x_no_secrets_in_logs").status).toBe("FAIL");
  });

  it("stays fast on a minified one-line bundle", () => {
    const chunk = "var a='x\\'y',b=\"q\";console.log(a,'z',b);";
    const files = { ...svc, "dist/app.js": chunk.repeat(20000) };
    const t = Date.now();
    sd(files, "obs_x_no_secrets_in_logs");
    expect(Date.now() - t).toBeLessThan(2000);
  });
});

describe("docker_no_secrets_in_env: a literal in a discarded stage is still committed", () => {
  const byKey = (text: string) =>
    evaluateContainerChecks(snap({ Dockerfile: text })).find((c) => c.checkKey === "docker_no_secrets_in_env")!;

  it("warns a real credential in a builder stage that does not ship", () => {
    const c = byKey("FROM node:20 AS build\nARG NPM_TOKEN=npm_aB3dEf9hIjKlMnOp\nRUN npm ci\nFROM node:20-slim\nUSER node\n");
    expect(c.status).toBe("WARN");
    expect(c.detail).toMatch(/not part of the final image/);
  });

  it("passes a build-stage placeholder", () => {
    const c = byKey("FROM node:20 AS build\nARG NEXTAUTH_SECRET=secret\nRUN npm run build\nFROM node:20-slim\nUSER node\n");
    expect(c.status).toBe("PASS");
  });

  it("still fails a literal in the shipped stage", () => {
    const c = byKey("FROM node:20 AS build\nRUN npm ci\nFROM node:20-slim\nENV API_KEY=" + "sk_" + "live_realvalue123\nUSER node\n");
    expect(c.status).toBe("FAIL");
  });
});

describe("backend service gate: a Deno service has no package.json", () => {
  const key = "svc_health_endpoint";
  it("grades a Deno service rather than skipping it", () => {
    const s = snap({ "deno.json": '{"tasks":{"start":"deno run main.ts"}}', "main.ts": "Deno.serve((req) => new Response('ok'));\n" });
    expect(evaluateBackendServiceChecks(s).find((c) => c.checkKey === key)!.status).not.toBe("SKIPPED");
  });
  it("still skips a static page", () => {
    const s = snap({ "index.html": "<h1>hi</h1>", "app.js": "document.title='x'\n" });
    expect(evaluateBackendServiceChecks(s).find((c) => c.checkKey === key)!.status).toBe("SKIPPED");
  });
});

describe("compose_no_plaintext_secrets reads one line, not the next key", () => {
  const plain = (compose: string) =>
    evaluateContainerChecks(snap({ "docker-compose.yml": compose })).find(
      (c) => c.checkKey === "compose_no_plaintext_secrets",
    )!;

  it("passes an empty credential followed by another key", () => {
    const c = plain("services:\n  db:\n    environment:\n      POSTGRES_PASSWORD:\n      POSTGRES_USER: application\n");
    expect(c.status).toBe("PASS");
  });

  it("still fails a literal credential in mapping form", () => {
    expect(plain("services:\n  db:\n    environment:\n      POSTGRES_PASSWORD: Prod2024xyz\n").status).toBe("FAIL");
  });

  it("still fails a literal credential in list form", () => {
    expect(plain("services:\n  db:\n    environment:\n      - DB_PASSWORD=Prod2024xyz\n").status).toBe("FAIL");
  });

  it("does not backtrack catastrophically over a run of blank lines", () => {
    const t = Date.now();
    plain("services:\n" + "\n".repeat(5000) + "  x:\n    restart: always\n");
    expect(Date.now() - t).toBeLessThan(2000);
  });
});
