import { describe, it, expect, vi, beforeEach } from "vitest";

let files: Record<string, string> = {};

vi.mock("@/lib/github", () => ({
  safeGithubRequest: vi.fn(async (path: string) => {
    if (path.includes("/git/trees/")) {
      return {
        tree: Object.keys(files).map((p) => ({ path: p, type: "blob", size: files[p].length })),
      };
    }
    const m = path.match(/\/contents\/(.+)$/);
    const p = m ? decodeURIComponent(m[1]) : "";
    if (p in files) {
      return { content: Buffer.from(files[p], "utf-8").toString("base64"), encoding: "base64" };
    }
    return {};
  }),
}));

const { scanRepoSecrets } = await import("@/server/pulse-agents/secret-scanner");

async function envCheck() {
  const { checks } = await scanRepoSecrets("o", "r");
  return checks.find((c) => c.checkKey === "repo_env_committed")!;
}

describe("repo_env_committed (audit repo-secret-scanner-1)", () => {
  beforeEach(() => {
    files = {};
  });

  it("does not FAIL an env file holding only 1Password references (immich deployment/.env)", async () => {
    files = {
      "README.md": "# immich",
      "deployment/.env":
        'export CLOUDFLARE_ACCOUNT_ID="op://tf/cloudflare/account_id"\nexport CLOUDFLARE_API_TOKEN="op://tf/cloudflare/api_token"\nexport TF_STATE_POSTGRES_CONN_STR="op://tf/tf_state/postgres_conn_str"\nexport TF_VAR_env=$ENVIRONMENT\n',
    };
    const c = await envCheck();
    expect(c.status).toBe("WARN");
    expect(c.detail).not.toMatch(/must be git-ignored/);
    expect(c.evidence).toBe("deployment/.env");
  });

  it("does not FAIL non-secret defaults (mattermost fastlane/.env.default, cal.com .env.test)", async () => {
    files = {
      "fastlane/.env.default":
        '## This is loaded by default for all fastlane executions\nBABEL_ENV="production"\nNODE_ENV="production"\nNODE_OPTIONS="--max_old_space_size=12000"',
      "packages/lib/test/.env.test": "NEXT_PUBLIC_WEBAPP_URL=http://localhost:3000\n",
      "packages/prisma/.env": "../../.env",
    };
    const c = await envCheck();
    expect(c.status).toBe("WARN");
  });

  it("still FAILs a committed .env that holds a real secret", async () => {
    files = {
      ".env":
        "DATABASE_URL=postgres://app:s3cr3tP4ssw0rd@db.internal:5432/app\nJWT_SECRET=9f8a7c6b5d4e3f2a1b0c9d8e7f6a5b4c\n",
    };
    const c = await envCheck();
    expect(c.status).toBe("FAIL");
    expect(c.evidence).toBe(".env");
  });

  it("still FAILs a committed .env.production with a live Stripe key", async () => {
    files = {
      "apps/web/.env.production": "STRIPE_KEY=" + "sk_" + "live_51HxQ2bCdEfGhIjKlMnOpQrStUv\n",
    };
    const c = await envCheck();
    expect(c.status).toBe("FAIL");
  });

  // The content test must not let secret-named variables that match no vendor
  // pattern slide from FAIL to WARN.
  it("FAILs a Laravel .env with a literal APP_KEY", async () => {
    files = {
      ".env": "APP_NAME=Laravel\nAPP_KEY=base64:Zm9vYmFyYmF6cXV4MTIzNDU2Nzg5MGFiY2RlZg==\nDB_PASSWORD=\n",
    };
    const c = await envCheck();
    expect(c.status).toBe("FAIL");
  });

  it("FAILs a .env.production with a Supabase service-role JWT", async () => {
    files = {
      ".env.production":
        "SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.abc123\n",
    };
    const c = await envCheck();
    expect(c.status).toBe("FAIL");
  });

  it("FAILs a .env whose only secret is a password in a username-less redis URL", async () => {
    files = { ".env": "REDIS_URL=redis://:hunter2pw@cache.internal:6379\n" };
    const c = await envCheck();
    expect(c.status).toBe("FAIL");
  });

  it("WARNs (not FAILs) a .env that holds only variable and vault references", async () => {
    files = {
      ".env": "SESSION_SECRET=${SESSION_SECRET}\nDB_PASSWORD=vault:secret/data/db#password\nAPI_TOKEN=$API_TOKEN\nPORT=3000\n",
    };
    const c = await envCheck();
    expect(c.status).toBe("WARN");
    expect(c.detail).toContain("recognised no credential values");
  });

  it("PASSes when no env file is committed", async () => {
    files = { "README.md": "# fiddle", ".env.example": "API_KEY=your_key_here\n" };
    const c = await envCheck();
    expect(c.status).toBe("PASS");
  });
});
