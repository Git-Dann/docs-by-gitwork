import { describe, expect, it } from "vitest";

import { evaluateBackendServiceChecks } from "../backend-service";
import type { RepoSnapshot } from "../native-mobile";

function snap(files: Record<string, string>, extraPaths: string[] = []): RepoSnapshot {
  return {
    owner: "o",
    repo: "r",
    paths: [...Object.keys(files), ...extraPaths],
    files: new Map(Object.entries(files)),
    truncated: false,
    accessible: true,
  };
}

const at = (s: RepoSnapshot, key: string) => {
  const c = evaluateBackendServiceChecks(s).find((x) => x.checkKey === key);
  if (!c) throw new Error(`no check emitted for ${key}`);
  return c;
};

const pkg = (deps: Record<string, string>) => JSON.stringify({ name: "app", dependencies: deps }, null, 2);

// gothinkster/node-express-realworld-example-app, abridged from the real files.
const realworld = () =>
  snap(
    {
      "package.json": pkg({
        "@prisma/client": "^4.16.1",
        "body-parser": "^1.20.2",
        cors: "^2.8.5",
        express: "~4.18.1",
        "express-jwt": "^8.4.1",
      }),
      "src/main.ts": [
        "import express from 'express';",
        "import cors from 'cors';",
        "import * as bodyParser from 'body-parser';",
        "import routes from './app/routes/routes';",
        "const app = express();",
        "app.use(cors());",
        "app.use(bodyParser.json());",
        "app.use(bodyParser.urlencoded({ extended: true }));",
        "app.use(routes);",
        "app.get('/', (req, res) => { res.json({ status: 'API is running on /api' }); });",
        "const PORT = process.env.PORT || 3000;",
        "app.listen(PORT, () => { console.info('server up on port ' + PORT); });",
      ].join("\n"),
      "src/prisma/prisma-client.ts":
        "import { PrismaClient } from '@prisma/client';\nconst prisma = new PrismaClient();\nexport default prisma;\n",
      "e2e/src/support/global-setup.ts":
        "module.exports = async function () {\n  // Start services that that the app needs to run (e.g. database, docker-compose, etc.).\n};\n",
    },
    ["src/prisma/migrations/20210924225358_initial/migration.sql"],
  );

// octocat/Spoon-Knife: the whole repository.
const spoonKnife = () =>
  snap({
    "README.md": "### Well hello there!\n\nThis repository is meant to provide an example for *forking* a repository on GitHub.\n",
    "index.html": '<!DOCTYPE html>\n<html>\n<head>\n<link rel="stylesheet" href="styles.css">\n</head>\n<body>\n<h2>I love Spoon-Knife</h2>\n</body>\n</html>\n',
    "styles.css": "* { margin: 0; padding: 0; }\nbody { font: 14px/21px Monaco, sans-serif; }\n",
  });

// discourse/discourse: Rails, Logster, no config.force_ssl.
const railsFiles = (applicationRb: string, productionRb: string) =>
  snap({
    Gemfile: 'source "https://rubygems.org"\ngem "rails"\ngem "logster"\n',
    "config/application.rb": applicationRb,
    "config/environments/production.rb": productionRb,
  });
const discourseApplication =
  'module Discourse\n  class Application < Rails::Application\n    require "logster/redis_store"\n    Logster.store = Logster::RedisStore.new(DiscourseRedis.new)\n  end\nend\n';
const discourseProduction =
  "Discourse::Application.configure do\n  config.eager_load = true\n  config.log_level = :info\nend\n";

describe("svc_env_example_no_secrets", () => {
  it("does not read the next line's variable name as the value of an empty secret (shadcn-ui/taxonomy)", () => {
    const s = snap({
      "package.json": pkg({ next: "13.3.2", "next-auth": "4.22.1" }),
      ".env.example": [
        "NEXTAUTH_URL=http://localhost:3000",
        "NEXTAUTH_SECRET=",
        "",
        "GITHUB_CLIENT_ID=",
        "GITHUB_CLIENT_SECRET=",
        "GITHUB_ACCESS_TOKEN=",
        'DATABASE_URL="mysql://root:root@localhost:3306/taxonomy?schema=public"',
        "POSTMARK_API_TOKEN=",
        "POSTMARK_SIGN_IN_TEMPLATE=",
        "STRIPE_API_KEY=",
        "STRIPE_WEBHOOK_SECRET=",
        "STRIPE_PRO_MONTHLY_PLAN_ID=",
      ].join("\n"),
    });
    expect(at(s, "svc_env_example_no_secrets").status).toBe("PASS");
  });

  it("still fails a real-looking key committed on the same line", () => {
    const s = snap({
      "package.json": pkg({ next: "13.3.2" }),
      ".env.example": "NEXTAUTH_URL=http://localhost:3000\nSTRIPE_API_KEY=" + "sk_" + "live_51H8xQ2eZvKYlo2C0aB3dE4fG5hI6\n",
    });
    expect(at(s, "svc_env_example_no_secrets").status).toBe("FAIL");
  });
});

describe("svc_db_connection_pool / svc_db_migrations_versioned", () => {
  it("treats Prisma as pooled (realworld)", () => {
    expect(at(realworld(), "svc_db_connection_pool").status).toBe("PASS");
    expect(at(realworld(), "svc_db_migrations_versioned").status).toBe("PASS");
  });

  it("does not read a Bedrock knowledge-base `dataSources` field as a database (tmoreton/tutorials)", () => {
    const s = snap({
      "agentcore/cdk/package.json": pkg({ "aws-cdk-lib": "^2.200.0" }),
      "agentcore/cdk/bin/cdk.ts":
        "for (const kb of specAny.knowledgeBases ?? []) {\n  for (const ds of kb.dataSources ?? []) {\n    if (ds.type !== 'S3' && ds.connectorConfigFile) {\n      connectorParametersByFile[ds.connectorConfigFile] = {};\n    }\n  }\n}\n",
    });
    expect(at(s, "svc_db_connection_pool").status).toBe("SKIPPED");
    expect(at(s, "svc_db_migrations_versioned").status).toBe("SKIPPED");
  });

  it("still warns on a single unpooled pg Client", () => {
    const s = snap({
      "package.json": pkg({ express: "^4.19.2", pg: "^8.11.0" }),
      "src/db.ts":
        'import { Client } from "pg";\nexport const client = new Client({ connectionString: process.env.DATABASE_URL });\nawait client.connect();\n',
    });
    expect(at(s, "svc_db_connection_pool").status).toBe("WARN");
  });

  it("still warns on Django DATABASES with no migrations committed", () => {
    const s = snap({
      "mysite/settings.py":
        'DATABASES = {\n    "default": {"ENGINE": "django.db.backends.postgresql", "NAME": "app"}\n}\n',
      "manage.py": "#!/usr/bin/env python\n",
    });
    expect(at(s, "svc_db_migrations_versioned").status).toBe("WARN");
  });
});

describe("svc_dependency_lockfile", () => {
  it("skips a repository with no dependency manifest (octocat/Spoon-Knife)", () => {
    expect(at(spoonKnife(), "svc_dependency_lockfile").status).toBe("SKIPPED");
  });

  it("still warns when package.json has no lockfile", () => {
    const s = snap({ "package.json": pkg({ express: "^4.19.2" }), "src/server.ts": "x" });
    expect(at(s, "svc_dependency_lockfile").status).toBe("WARN");
  });
});

describe("service checks on a repository with no server", () => {
  it("skips service-absence checks for a static page (octocat/Spoon-Knife)", () => {
    for (const key of ["svc_error_tracking", "svc_structured_logging", "svc_request_id", "svc_health_endpoint"]) {
      expect(at(spoonKnife(), key).status).toBe("SKIPPED");
    }
  });

  it("still warns, at HIGH confidence, on a fully-read Express service with no health route (realworld)", () => {
    const c = at(realworld(), "svc_health_endpoint");
    expect(c.status).toBe("WARN");
    expect(c.confidence).toBe("HIGH");
  });

  it("downgrades an absence found in a thin sample of a large repository to LOW", () => {
    const unread = Array.from({ length: 300 }, (_, i) => `src/modules/m${i}.service.ts`);
    const s = snap(
      {
        "package.json": pkg({ express: "^4.19.2" }),
        "src/server.ts": "import express from 'express';\nconst app = express();\napp.listen(3000);\n",
      },
      unread,
    );
    const c = at(s, "svc_health_endpoint");
    expect(c.status).toBe("WARN");
    expect(c.confidence).toBe("LOW");
    expect(c.detail).toMatch(/inconclusive/);
  });
});

describe("svc_error_tracking", () => {
  it("recognises Logster (discourse/discourse)", () => {
    expect(at(railsFiles(discourseApplication, discourseProduction), "svc_error_tracking").status).toBe("PASS");
  });

  it("still warns on a Rails app with no tracker", () => {
    const s = snap({
      Gemfile: 'source "https://rubygems.org"\ngem "rails"\n',
      "config/application.rb": "module Shop\n  class Application < Rails::Application\n  end\nend\n",
      "config/environments/production.rb": discourseProduction,
    });
    expect(at(s, "svc_error_tracking").status).toBe("WARN");
  });
});

describe("svc_request_id", () => {
  it("passes Rails, whose default middleware sets X-Request-Id (discourse)", () => {
    expect(at(railsFiles(discourseApplication, discourseProduction), "svc_request_id").status).toBe("PASS");
  });

  it("still warns on Django with no request-id middleware", () => {
    const s = snap({
      "djangoproject/settings/common.py": 'MIDDLEWARE = [\n    "django.middleware.security.SecurityMiddleware",\n]\n',
      "manage.py": "#!/usr/bin/env python\n",
    });
    expect(at(s, "svc_request_id").status).toBe("WARN");
  });
});

describe("svc_rails_force_ssl", () => {
  it("no longer claims all three protections are lost when only force_ssl was observed", () => {
    const c = at(railsFiles(discourseApplication, discourseProduction), "svc_rails_force_ssl");
    expect(c.status).toBe("WARN");
    expect(c.detail).not.toMatch(/costs all three/);
    expect(c.detail).toMatch(/proxy/);
  });

  it("still passes config.force_ssl = true", () => {
    const prod = "Rails.application.configure do\n  config.force_ssl = true\nend\n";
    expect(at(railsFiles(discourseApplication, prod), "svc_rails_force_ssl").status).toBe("PASS");
  });
});

describe("svc_session_cookie_flags", () => {
  it("passes NextAuth, which sets HttpOnly and SameSite=Lax by default (taxonomy)", () => {
    const s = snap({
      "package.json": pkg({ next: "13.3.2", "next-auth": "4.22.1", "@next-auth/prisma-adapter": "^1.0.6" }),
      "lib/auth.ts": [
        'import { PrismaAdapter } from "@next-auth/prisma-adapter"',
        'import { NextAuthOptions } from "next-auth"',
        'import GitHubProvider from "next-auth/providers/github"',
        "export const authOptions: NextAuthOptions = {",
        "  adapter: PrismaAdapter(db as any),",
        '  session: { strategy: "jwt" },',
        '  pages: { signIn: "/login" },',
        "  providers: [GitHubProvider({ clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET })],",
        "}",
      ].join("\n"),
    });
    expect(at(s, "svc_session_cookie_flags").status).toBe("PASS");
  });

  it("still warns on express-session with no HttpOnly/SameSite", () => {
    const s = snap({
      "package.json": pkg({ express: "^4.19.2", "express-session": "^1.18.0" }),
      "src/app.ts":
        'import session from "express-session";\napp.use(session({ secret: process.env.SESSION_SECRET!, resave: false, saveUninitialized: false, cookie: { secure: true } }));\n',
    });
    expect(at(s, "svc_session_cookie_flags").status).toBe("WARN");
  });
});

describe("svc_health_endpoint", () => {
  it("recognises a NestJS @Get(\"health\") route (calcom/cal.com apps/api/v2)", () => {
    const s = snap({
      "apps/api/v2/package.json": pkg({ "@nestjs/core": "^10.0.0", "@nestjs/common": "^10.0.0" }),
      "apps/api/v2/src/app.controller.ts":
        'import { Controller, Get } from "@nestjs/common";\n\n@Controller()\nexport class AppController {\n  @Get("health")\n  getHealth(): "OK" {\n    return "OK";\n  }\n}\n',
    });
    expect(at(s, "svc_health_endpoint").status).toBe("PASS");
  });

  it("still warns when no health route exists (realworld)", () => {
    expect(at(realworld(), "svc_health_endpoint").status).toBe("WARN");
  });
});

describe("svc_structured_logging", () => {
  it("recognises tslog (calcom/cal.com packages/lib/logger.ts)", () => {
    const s = snap({
      "package.json": pkg({ next: "14.2.0" }),
      "packages/lib/logger.ts":
        'import { Logger, ISettingsParam } from "tslog";\nexport const loggerConfig: ISettingsParam<unknown> = {\n  type: IS_PRODUCTION ? "json" : "pretty",\n};\nconst logger = new Logger(loggerConfig);\nexport default logger;\n',
    });
    expect(at(s, "svc_structured_logging").status).toBe("PASS");
  });

  it("still warns on console-only logging (realworld)", () => {
    expect(at(realworld(), "svc_structured_logging").status).toBe("WARN");
  });
});

describe("svc_express_body_limit", () => {
  it("passes default-capped bodyParser.json()/urlencoded() (realworld)", () => {
    expect(at(realworld(), "svc_express_body_limit").status).toBe("PASS");
  });

  it("passes a Next.js app whose only route reads no body (vercel/commerce)", () => {
    const s = snap({
      "package.json": pkg({ next: "15.3.0", react: "19.0.0" }),
      "app/api/revalidate/route.ts":
        'import { revalidate } from "lib/shopify";\nimport { NextRequest, NextResponse } from "next/server";\n\nexport async function POST(req: NextRequest): Promise<NextResponse> {\n  return revalidate(req);\n}\n',
    });
    expect(at(s, "svc_express_body_limit").status).toBe("PASS");
  });

  it("still warns on an App Router handler reading req.json() with no cap (taxonomy)", () => {
    const s = snap({
      "package.json": pkg({ next: "13.3.2" }),
      "app/api/posts/route.ts":
        "export async function POST(req: Request) {\n  const json = await req.json()\n  const body = postCreateSchema.parse(json)\n}\n",
    });
    expect(at(s, "svc_express_body_limit").status).toBe("WARN");
  });

  it("still warns on multer with no limits", () => {
    const s = snap({
      "package.json": pkg({ express: "^4.19.2", multer: "^1.4.5-lts.1" }),
      "src/upload.ts":
        'import multer from "multer";\nconst upload = multer({ dest: "uploads/" });\nrouter.post("/avatar", upload.single("avatar"), handler);\n',
    });
    expect(at(s, "svc_express_body_limit").status).toBe("WARN");
  });
});

describe("svc_express_helmet", () => {
  it("passes a Next.js app that sets security headers in next.config", () => {
    const s = snap({
      "package.json": pkg({ next: "14.2.0" }),
      "next.config.js":
        'module.exports = {\n  async headers() {\n    return [{ source: "/(.*)", headers: [\n      { key: "X-Content-Type-Options", value: "nosniff" },\n      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },\n    ] }];\n  },\n};\n',
    });
    expect(at(s, "svc_express_helmet").status).toBe("PASS");
  });

  it("still warns on a Next.js app with no header config, and says Next.js rather than only Express (vercel/commerce)", () => {
    const s = snap({
      "package.json": pkg({ next: "15.3.0" }),
      "next.config.ts":
        'export default {\n  experimental: { ppr: true, inlineCss: true, useCache: true },\n  images: { formats: ["image/avif", "image/webp"] },\n};\n',
    });
    const c = at(s, "svc_express_helmet");
    expect(c.status).toBe("WARN");
    expect(c.detail).toMatch(/Next\.js/);
  });

  it("still warns on Express without helmet (realworld)", () => {
    expect(at(realworld(), "svc_express_helmet").status).toBe("WARN");
  });
});

// Reviewer follow-ups: each revision above narrowed a PASS, so each needs a case that
// must still fail.
describe("revisions keep their negative cases", () => {
  const nodeApp = (src: string, deps: Record<string, string> = { express: "^4.18.2" }) =>
    snap({ "package.json": pkg(deps), "src/server.ts": src });

  it("svc_structured_logging: tslog in its default pretty mode is free text (WARN)", () => {
    const pretty = nodeApp('import { Logger } from "tslog";\nexport const log = new Logger({ type: "pretty" });', {
      express: "^4.18.2",
      tslog: "^4.9.0",
    });
    const unset = nodeApp('import { Logger } from "tslog";\nexport const log = new Logger();', {
      express: "^4.18.2",
      tslog: "^4.9.0",
    });
    expect(at(pretty, "svc_structured_logging").status).toBe("WARN");
    expect(at(unset, "svc_structured_logging").status).toBe("WARN");
  });

  it("svc_structured_logging: tslog configured for json in production PASSes (cal.com)", () => {
    const json = nodeApp(
      'import { Logger } from "tslog";\nexport const log = new Logger({ type: IS_PRODUCTION ? "json" : "pretty" });',
      { express: "^4.18.2", tslog: "^4.9.0" },
    );
    expect(at(json, "svc_structured_logging").status).toBe("PASS");
  });

  // A Sinatra service: root Gemfile (which buildCtx reads as "rails"), no Rails::Application.
  const sinatra = (dbFile?: string) =>
    snap({
      Gemfile: "source 'https://rubygems.org'\ngem 'sinatra'\ngem 'pg'\n",
      "Gemfile.lock": "GEM\n  specs:\n    sinatra (3.1.0)\n",
      "app.rb": "require 'sinatra'\nget '/' do\n  'hi'\nend\n",
      ...(dbFile ? { "config/database.rb": dbFile } : {}),
    });

  it("svc_request_id: a Sinatra app (Gemfile, no Rails::Application) still WARNs", () => {
    expect(at(sinatra(), "svc_request_id").status).toBe("WARN");
  });

  it("svc_db_connection_pool: a Sinatra app opening a raw PG connection still WARNs", () => {
    const s = sinatra("# database configuration\nDB = PG.connect(ENV.fetch('DATABASE_URL'))\n");
    expect(at(s, "svc_db_connection_pool").status).toBe("WARN");
  });

  it("svc_db_connection_pool: a camelCase databaseUrl with a raw pg Client WARNs, not SKIPPED", () => {
    const s = nodeApp(
      'import { Client } from "pg";\nconst client = new Client({ connectionString: config.databaseUrl });\nawait client.connect();',
      { express: "^4.18.2", pg: "^8.11.0" },
    );
    expect(at(s, "svc_db_connection_pool").status).toBe("WARN");
  });

  it("svc_db_connection_pool: kb.dataSources (Bedrock) is not a database (SKIPPED)", () => {
    const s = nodeApp("const sources = await kb.dataSources.list();");
    expect(at(s, "svc_db_connection_pool").status).toBe("SKIPPED");
  });

  it("svc_dependency_lockfile: a requirements/base.txt manifest with no lockfile WARNs, not SKIPPED", () => {
    const s = snap({
      "requirements/base.txt": "Django==5.0\npsycopg==3.1\n",
      "manage.py": "import django\n",
      "app/views.py": "def index(request):\n    return None\n",
    });
    expect(at(s, "svc_dependency_lockfile").status).toBe("WARN");
  });

  it("svc_dependency_lockfile: a static site with no manifest SKIPs", () => {
    const s = snap({ "index.html": "<h1>hi</h1>", "styles.css": "h1{}", "README.md": "# demo" });
    expect(at(s, "svc_dependency_lockfile").status).toBe("SKIPPED");
  });

  it("svc_express_body_limit: piping or blob-reading the raw request with no cap WARNs", () => {
    const pipe = nodeApp('export async function POST(req) { req.pipe(s3UploadStream(key)); return new Response("ok"); }', {
      next: "14.0.0",
    });
    const blob = nodeApp("export async function POST(request: Request) { const b = await request.blob(); return save(b); }", {
      next: "14.0.0",
    });
    expect(at(pipe, "svc_express_body_limit").status).toBe("WARN");
    expect(at(blob, "svc_express_body_limit").status).toBe("WARN");
  });

  it("svc_express_helmet: a header named only in a comment is not a header being set (WARN)", () => {
    const s = nodeApp("// TODO add X-Content-Type-Options and Content-Security-Policy\napp.get('/', (q, r) => r.send('ok'));");
    expect(at(s, "svc_express_helmet").status).toBe("WARN");
  });

  it("svc_express_helmet: headers set as quoted keys in next.config PASS", () => {
    const s = snap({
      "package.json": pkg({ next: "14.0.0" }),
      "next.config.js":
        "module.exports = { async headers() { return [{ source: '/(.*)', headers: [{ key: 'X-Content-Type-Options', value: 'nosniff' }] }]; } };",
    });
    expect(at(s, "svc_express_helmet").status).toBe("PASS");
  });
});
