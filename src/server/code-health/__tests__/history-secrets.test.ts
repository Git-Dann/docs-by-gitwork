// @vitest-environment node
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  credentialsIn,
  historySecretsCheck,
  isSensitiveHistoryPath,
  parseDeleted,
  scanDeletedSecrets,
} from "../history-secrets";

// Built at runtime so no credential-shaped literal sits in the repository.
const PASSWORD = ["Qz7", "vL2", "pX9", "kR4", "wN8"].join("");

describe("isSensitiveHistoryPath", () => {
  it("names that hold credentials", () => {
    for (const p of [".env", "api/.env.production", "certs/server.key", "deploy/id_ed25519", "gcp/service-account-prod.json", ".npmrc", "config/secrets.yml"]) {
      expect(isSensitiveHistoryPath(p), p).toBe(true);
    }
  });
  it("not examples, fixtures, public keys or ordinary files", () => {
    for (const p of [".env.example", "tests/fixtures/.env", "examples/server.key", "keys/public.pem", "src/config.ts", "docs/credentials.json"]) {
      expect(isSensitiveHistoryPath(p), p).toBe(false);
    }
  });
});

describe("parseDeleted", () => {
  it("keeps the newest deletion of each path", () => {
    const out = "\x1eaaa\x1f200\n.env\nsrc/a.ts\n\x1ebbb\x1f100\n.env\n";
    expect(parseDeleted(out)).toEqual([
      { sha: "aaa", time: 200, path: ".env" },
      { sha: "aaa", time: 200, path: "src/a.ts" },
    ]);
  });
});

describe("credentialsIn", () => {
  it("finds a real env secret and ignores placeholders and references", () => {
    expect(credentialsIn(".env", `DATABASE_PASSWORD=${PASSWORD}\n`)).toContain("Secret in an environment file");
    expect(credentialsIn(".env", "DATABASE_PASSWORD=changeme\nAPI_KEY=${API_KEY}\nPORT=3000\n")).toEqual([]);
  });
});

describe("historySecretsCheck", () => {
  it("FAILs and says to rotate when a deleted file held a credential", () => {
    const c = historySecretsCheck({ candidates: 1, read: 1, findings: [{ path: ".env", sha: "abcdef1234", time: 1_790_000_000, kinds: ["Secret in an environment file"] }] });
    expect(c.status).toBe("FAIL");
    expect(c.detail).toMatch(/Rotate these credentials/);
  });
  it("a file that could not be read leaves it open, never PASS", () => {
    expect(historySecretsCheck({ candidates: 2, read: 1, findings: [] }).status).toBe("INCONCLUSIVE");
    expect(historySecretsCheck(null, "no history").status).toBe("INCONCLUSIVE");
  });
  it("PASSes only when every candidate was read", () => {
    expect(historySecretsCheck({ candidates: 0, read: 0, findings: [] }).status).toBe("PASS");
    expect(historySecretsCheck({ candidates: 2, read: 2, findings: [] }).status).toBe("PASS");
  });
});

describe("scanDeletedSecrets against a real git repository", () => {
  let dir = "";
  // ⚠️ Every inherited GIT_* variable is dropped. Under a git hook (pre-push runs this
  // suite) GIT_DIR points at the REAL repository, and `git init` here then re-initialised
  // it as bare — which broke every checkout of this repo. Never pass process.env through.
  const env: NodeJS.ProcessEnv = {
    ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("GIT_"))),
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: "/dev/null",
    NODE_ENV: process.env.NODE_ENV,
  };
  const git = async (args: string[]) => execFileSync("git", args, { cwd: dir, encoding: "utf8", env });
  const run = (...args: string[]) => execFileSync("git", ["-c", "user.name=T", "-c", "user.email=t@example.com", ...args], { cwd: dir, env });

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "history-secrets-"));
    run("init", "-q");
    mkdirSync(join(dir, "tests"));
    writeFileSync(join(dir, ".env"), `DATABASE_PASSWORD=${PASSWORD}\n`);
    writeFileSync(join(dir, "tests", ".env"), `DATABASE_PASSWORD=${PASSWORD}\n`);
    writeFileSync(join(dir, ".env.production"), "PORT=3000\nAPI_KEY=${API_KEY}\n");
    writeFileSync(join(dir, "app.js"), "console.log(1)\n");
    run("add", "-A");
    run("commit", "-qm", "init");
    unlinkSync(join(dir, ".env"));
    unlinkSync(join(dir, "tests", ".env"));
    unlinkSync(join(dir, ".env.production"));
    run("add", "-A");
    run("commit", "-qm", "remove env files");
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("finds the deleted .env that held a password, and nothing else", async () => {
    const r = await scanDeletedSecrets(git, "2000-01-01");
    expect(r.candidates).toBe(2); // .env and .env.production; tests/.env is a fixture
    expect(r.read).toBe(2);
    expect(r.findings.map((f) => f.path)).toEqual([".env"]);
    expect(historySecretsCheck(r).status).toBe("FAIL");
  });
});
