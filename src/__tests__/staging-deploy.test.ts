/**
 * deploy/staging-deploy.sh (docs/staging.md), against fake `docker` and `curl`: it only ever
 * touches the staging project, refuses a .env that points anywhere but the staging database,
 * refuses a compose file that names production's containers or image, health-checks the release
 * on 127.0.0.1:3001 and seeds only when asked. Plus the workflow's own guards: dispatch only,
 * never production's tags, and every file it ships is in its sparse checkout.
 */
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SCRIPT = join(ROOT, "deploy/staging-deploy.sh");
const SHA = "0123456789abcdef0123456789abcdef01234567";
const GOOD_ENV = "DATABASE_URL=postgresql://foundry:pw@db:5432/foundry_staging?sslmode=disable\nAPI_KEY=staging-key\n";

let dir: string;
let staging: string;
let release: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "staging-deploy-"));
  staging = join(dir, "foundry-staging");
  release = join(dir, "release");
  mkdirSync(staging);
  mkdirSync(join(release, "deploy"), { recursive: true });
  copyFileSync(join(ROOT, "docker-compose-staging.yml"), join(release, "docker-compose-staging.yml"));
  copyFileSync(join(ROOT, "deploy/health-check.sh"), join(release, "deploy/health-check.sh"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function fake(name: string, body: string): string {
  const p = join(dir, name);
  writeFileSync(p, `#!/usr/bin/env bash\n${body}\n`);
  chmodSync(p, 0o755);
  return p;
}

const dockerLog = () => join(dir, "docker.log");
const curlLog = () => join(dir, "curl.log");
const docker = () => fake("docker", `echo "$*" >> ${dockerLog()}; exit 0`);
const curl = (healthy = true) =>
  fake(
    "curl",
    `echo "$* stdin=$(cat 2>/dev/null | tr '\\n' ' ')" >> ${curlLog()}
case "$*" in
  *api/health*) ${healthy ? `echo '{"ok":true,"commit":"${SHA}"}'; exit 0` : "exit 22"} ;;
  *api/dev/*) printf 200 ;;
esac`,
  );

function deploy(opts: { env?: string; seed?: string; stagingDir?: string; healthy?: boolean } = {}) {
  writeFileSync(join(staging, ".env"), opts.env ?? GOOD_ENV);
  return spawnSync("bash", [SCRIPT, release, SHA, opts.seed ?? "0"], {
    encoding: "utf8",
    env: {
      ...process.env,
      STAGING_DIR: opts.stagingDir ?? staging,
      DOCKER_CMD: docker(),
      CURL_CMD: curl(opts.healthy ?? true),
      HEALTH_TIMEOUT: "1",
      HEALTH_INTERVAL: "0",
    },
  });
}

describe("staging-deploy.sh", () => {
  it("deploys, pinned to the foundry-staging project, and health-checks port 3001", () => {
    const r = deploy();
    expect(r.status, r.stdout + r.stderr).toBe(0);
    const calls = readFileSync(dockerLog(), "utf8").trim().split("\n");
    for (const c of calls.filter((l) => l.startsWith("compose"))) expect(c).toContain("-p foundry-staging");
    expect(calls.some((c) => c.includes("db push") && c.includes("--accept-data-loss"))).toBe(true);
    expect(readFileSync(curlLog(), "utf8")).toContain("127.0.0.1:3001/api/health?deep=1");
    expect(readFileSync(join(staging, "docker-compose.yml"), "utf8")).toContain("name: foundry-staging");
  });

  it("never runs a compose command against production's project or containers", () => {
    deploy();
    const log = readFileSync(dockerLog(), "utf8");
    expect(log).not.toMatch(/-p foundry\b(?!-staging)/);
    expect(log).not.toMatch(/\/opt\/apps\/foundry\//);
    expect(log).not.toMatch(/docs-by-gitwork:(latest|previous)/);
  });

  it("refuses a directory that isn't the staging one", () => {
    const prod = join(dir, "foundry");
    mkdirSync(prod);
    const r = deploy({ stagingDir: prod });
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("must be named foundry-staging");
    expect(existsSync(dockerLog())).toBe(false);
  });

  it.each([
    ["production's database", "DATABASE_URL=postgresql://foundry:pw@db:5432/foundry?sslmode=disable\n"],
    ["another host", "DATABASE_URL=postgresql://foundry:pw@foundry-db:5432/foundry_staging\n"],
    ["no DATABASE_URL at all", "API_KEY=x\n"],
    ["a DIRECT_URL elsewhere", `${GOOD_ENV}DIRECT_URL=postgresql://foundry:pw@db:5432/foundry\n`],
  ])("refuses a .env pointing at %s, before running anything", (_what, env) => {
    const r = deploy({ env });
    expect(r.status).toBe(1);
    expect(existsSync(dockerLog())).toBe(false);
  });

  it("accepts a quoted staging DATABASE_URL", () => {
    const r = deploy({ env: 'DATABASE_URL="postgresql://foundry:pw@db:5432/foundry_staging"\n' });
    expect(r.status, r.stdout).toBe(0);
  });

  it("refuses a compose file that names production's container or image", () => {
    const f = join(release, "docker-compose-staging.yml");
    writeFileSync(f, readFileSync(f, "utf8").replace("container_name: foundry-staging-db", "container_name: foundry-db"));
    const r = deploy();
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("production container or image");
  });

  it("fails, without touching anything else, when staging isn't healthy", () => {
    const r = deploy({ healthy: false });
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("Production was not touched");
  });

  it("seeds only when asked, with the key on stdin and never on the command line", () => {
    deploy();
    expect(readFileSync(curlLog(), "utf8")).not.toContain("api/dev/");
    rmSync(curlLog());
    const r = deploy({ seed: "1" });
    expect(r.status, r.stdout).toBe(0);
    const log = readFileSync(curlLog(), "utf8");
    expect(log).toContain("127.0.0.1:3001/api/dev/seed-demo");
    const seedLines = log.split("\n").filter((l) => l.includes("api/dev/"));
    for (const l of seedLines) {
      const [args, stdin] = l.split(" stdin=");
      expect(args).not.toContain("staging-key");
      expect(stdin).toContain("staging-key");
    }
  });
});

describe("deploy-staging.yml", () => {
  const wf = readFileSync(join(ROOT, ".github/workflows/deploy-staging.yml"), "utf8");

  it("only runs when dispatched", () => {
    const on = wf.slice(wf.indexOf("\non:"), wf.indexOf("\nconcurrency:"));
    expect(on).toContain("workflow_dispatch");
    expect(on).not.toMatch(/\n\s+push:|pull_request|schedule/);
  });

  it("never pushes production's tags or joins production's deploy group", () => {
    expect(wf).not.toMatch(/docs-by-gitwork:(latest|previous)\b/);
    expect(wf).toMatch(/\n {2}group: deploy-staging\n/);
    expect(wf).not.toContain("/opt/apps/foundry\n");
  });

  it("checks out every file it ships", () => {
    const sparse = /sparse-checkout: \|\n([\s\S]*?)\n\s*sparse-checkout-cone-mode/.exec(wf)?.[1] ?? "";
    const tar = /tar czf - ([^|]+)\|/.exec(wf)?.[1].trim().split(/\s+/) ?? [];
    expect(tar.length).toBeGreaterThan(0);
    for (const f of tar) expect(sparse, `${f} is shipped but not checked out`).toContain(f);
  });
});
