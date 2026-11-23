/**
 * The release scripts the deploy runs on production (deploy/health-check.sh, rollback.sh,
 * sync-compose.sh), against fake `curl` and `docker` commands, plus the guards that keep the
 * compose file and deploy.yml in step with them. Nothing here touches Docker or the network.
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const ROOT = process.cwd();
const HEALTH = join(ROOT, "deploy/health-check.sh");
const ROLLBACK = join(ROOT, "deploy/rollback.sh");
const SYNC = join(ROOT, "deploy/sync-compose.sh");
const RUN_CRON = join(ROOT, "deploy/run-cron.sh");
const SHA = "0123456789abcdef0123456789abcdef01234567";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "deploy-scripts-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function fake(name: string, body: string): string {
  const p = join(dir, name);
  writeFileSync(p, `#!/usr/bin/env bash\n${body}\n`);
  chmodSync(p, 0o755);
  return p;
}

function run(script: string, args: string[], env: Record<string, string>, cwd = dir) {
  return spawnSync("bash", [script, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, HEALTH_TIMEOUT: "1", HEALTH_INTERVAL: "0", ...env },
  });
}

describe("health-check.sh", () => {
  const curlSaying = (body: string, code = 0) => fake("curl", `echo '${body}'; exit ${code}`);

  it("passes when the app answers with the expected commit", () => {
    const r = run(HEALTH, [SHA], { CURL_CMD: curlSaying(`{"ok":true,"commit":"${SHA}","database":"ok"}`) });
    expect(r.status, r.stdout + r.stderr).toBe(0);
  });

  it("fails while the old release is still answering", () => {
    const r = run(HEALTH, [SHA], { CURL_CMD: curlSaying('{"ok":true,"commit":"ffffffffffffffffffffffffffffffffffffffff"}') });
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("not running");
  });

  it("fails when the app does not answer healthily (e.g. 503, database unreachable)", () => {
    const r = run(HEALTH, [SHA], { CURL_CMD: curlSaying("curl: (22) The requested URL returned error: 503", 22) });
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("no healthy answer");
  });

  it("with no sha, any healthy answer will do", () => {
    const r = run(HEALTH, [], { CURL_CMD: curlSaying('{"ok":true,"commit":"anything"}') });
    expect(r.status).toBe(0);
  });

  it("falls back to asking from inside the container when the box has no curl", () => {
    const log = join(dir, "docker.log");
    const docker = fake("docker", `echo "$*" >> ${log}; echo '{"ok":true,"commit":"${SHA}"}'`);
    const r = run(HEALTH, [SHA], { CURL_CMD: "no-such-curl-here", DOCKER_CMD: docker });
    expect(r.status, r.stdout).toBe(0);
    expect(readFileSync(log, "utf8")).toContain("exec foundry wget");
  });
});

describe("rollback.sh", () => {
  const log = () => join(dir, "docker.log");
  const docker = (opts: { hasPrevious?: boolean } = {}) =>
    fake(
      "docker",
      `echo "$*" >> ${log()}
case "$1 $2" in
  "image inspect") ${opts.hasPrevious === false ? "exit 1" : "exit 0"} ;;
  "inspect foundry") echo "sha256:running" ;;
esac
exit 0`,
    );
  const health = (ok: boolean) => fake("health.sh", `echo "health $*" >> ${log()}; exit ${ok ? 0 : 1}`);

  it("refuses a target that is neither 'previous' nor a full sha", () => {
    const r = run(ROLLBACK, ["abc123"], { DOCKER_CMD: docker(), HEALTH_CHECK: health(true) });
    expect(r.status).toBe(1);
    expect(existsSync(log())).toBe(false);
  });

  it("refuses 'previous' when there is no previous image", () => {
    const r = run(ROLLBACK, ["previous"], { DOCKER_CMD: docker({ hasPrevious: false }), HEALTH_CHECK: health(true) });
    expect(r.status).toBe(1);
    expect(readFileSync(log(), "utf8")).not.toContain("compose up");
  });

  it("puts a commit's image back and checks it is that commit", () => {
    const r = run(ROLLBACK, [SHA], { DOCKER_CMD: docker(), HEALTH_CHECK: health(true) });
    expect(r.status, r.stdout + r.stderr).toBe(0);
    const calls = readFileSync(log(), "utf8");
    expect(calls).toContain(`pull ghcr.io/git-dann/docs-by-gitwork:${SHA}`);
    expect(calls).toContain(`tag ghcr.io/git-dann/docs-by-gitwork:${SHA} ghcr.io/git-dann/docs-by-gitwork:latest`);
    expect(calls).toContain("compose up -d --no-deps --force-recreate app");
    expect(calls).toContain(`health ${SHA}`);
  });

  it("puts the running image back when the rollback target is not healthy", () => {
    const r = run(ROLLBACK, ["previous"], { DOCKER_CMD: docker(), HEALTH_CHECK: health(false) });
    expect(r.status).toBe(1);
    const calls = readFileSync(log(), "utf8");
    expect(calls).toContain("tag sha256:running ghcr.io/git-dann/docs-by-gitwork:before-rollback");
    expect(calls).toContain("tag ghcr.io/git-dann/docs-by-gitwork:before-rollback ghcr.io/git-dann/docs-by-gitwork:latest");
    expect(calls.match(/compose up -d --no-deps --force-recreate app/g)).toHaveLength(2);
  });
});

describe("sync-compose.sh", () => {
  const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
  const OLD = "services: {old: 1}\n";
  const NEW = "services: {new: 1}\n";
  let history: string;
  let incoming: string;
  beforeEach(() => {
    history = join(dir, "history");
    writeFileSync(history, `${sha256(OLD)}  old\n${sha256(NEW)}  new\n`);
    incoming = join(dir, "incoming.yml");
    writeFileSync(incoming, NEW);
  });
  const live = () => join(dir, "docker-compose.yml");
  const dockerOk = () => fake("docker", "exit 0");

  it("replaces a version the repo shipped, keeping the old one", () => {
    writeFileSync(live(), OLD);
    const r = run(SYNC, [incoming, history], { DOCKER_CMD: dockerOk() });
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(readFileSync(live(), "utf8")).toBe(NEW);
    expect(readFileSync(`${live()}.before-deploy`, "utf8")).toBe(OLD);
  });

  it("leaves a hand-edited box file alone and says so", () => {
    writeFileSync(live(), "services: {edited: 1}\n");
    const r = run(SYNC, [incoming, history], { DOCKER_CMD: dockerOk() });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("::warning::");
    expect(readFileSync(live(), "utf8")).toBe("services: {edited: 1}\n");
  });

  it("changes nothing when the box already has the repo's version", () => {
    writeFileSync(live(), NEW);
    const r = run(SYNC, [incoming, history], { DOCKER_CMD: fake("docker", "exit 9") });
    expect(r.status).toBe(0);
    expect(existsSync(`${live()}.before-deploy`)).toBe(false);
  });

  it("refuses a file docker compose cannot read, and changes nothing", () => {
    writeFileSync(live(), OLD);
    const r = run(SYNC, [incoming, history], { DOCKER_CMD: fake("docker", "exit 1") });
    expect(r.status).toBe(1);
    expect(readFileSync(live(), "utf8")).toBe(OLD);
    expect(existsSync(`${live()}.next`)).toBe(false);
  });
});

describe("run-cron.sh", () => {
  // A fake curl that records its arguments and its stdin (where the header must go) and answers
  // with the status code in $CODE.
  function cronEnv(envFile: string, code = "200") {
    const bin = join(dir, "bin");
    spawnSync("mkdir", ["-p", bin]);
    writeFileSync(
      join(bin, "curl"),
      `#!/usr/bin/env bash\necho "$@" > "${dir}/argv"\ncat > "${dir}/stdin"\nprintf '{"ok":true}\\n%s' "${code}"\n`,
    );
    chmodSync(join(bin, "curl"), 0o755);
    return { PATH: `${bin}:${process.env.PATH}`, FOUNDRY_ENV_FILE: envFile };
  }

  it("calls the job with the secret from .env, never on the command line", () => {
    const env = join(dir, ".env");
    writeFileSync(env, 'OTHER=1\nCRON_SECRET="topsecret"\n');
    const r = run(RUN_CRON, ["jobs"], cronEnv(env));
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("jobs HTTP 200");
    const argv = readFileSync(join(dir, "argv"), "utf8");
    expect(argv).toContain("http://127.0.0.1:3000/api/cron/jobs");
    expect(argv).not.toContain("topsecret");
    expect(readFileSync(join(dir, "stdin"), "utf8")).toContain('header = "Authorization: Bearer topsecret"');
  });

  it("exits non-zero when the job answers an error, so the deploy keeps the old copy", () => {
    const env = join(dir, ".env");
    writeFileSync(env, "CRON_SECRET=x\n");
    expect(run(RUN_CRON, ["jobs"], cronEnv(env, "401")).status).toBe(1);
  });

  it("refuses a missing secret and a job name that isn't one", () => {
    const env = join(dir, ".env");
    writeFileSync(env, "OTHER=1\n");
    expect(run(RUN_CRON, ["jobs"], cronEnv(env)).status).toBe(3);
    expect(run(RUN_CRON, ["../../etc"], cronEnv(env)).status).toBe(2);
  });
});

describe("the repo's own files", () => {
  const compose = readFileSync(join(ROOT, "docker-compose.yml"), "utf8");

  it("lists the current docker-compose.yml in compose-history, so the deploy may install it", () => {
    const hash = createHash("sha256").update(compose).digest("hex");
    const history = readFileSync(join(ROOT, "deploy/compose-history.sha256"), "utf8");
    expect(history, "Changed docker-compose.yml? Append its sha256 to deploy/compose-history.sha256").toContain(hash);
  });

  it("publishes the app on localhost only, and rotates both services' logs", () => {
    expect(compose).toContain('- "127.0.0.1:3000:3000"');
    expect(compose).not.toMatch(/-\s*"3000:3000"/);
    expect(compose.match(/max-size: "50m"/g)).toHaveLength(2);
  });

  it("deploy.yml checks health before pruning, and only after the restart", () => {
    const wf = readFileSync(join(ROOT, ".github/workflows/deploy.yml"), "utf8");
    const restart = wf.lastIndexOf("docker compose up -d --no-deps --force-recreate app\n\n");
    const check = wf.indexOf('bash deploy/health-check.sh "$DEPLOY_SHA"');
    const prune = wf.indexOf("docker image prune -f");
    expect(restart).toBeGreaterThan(-1);
    expect(check).toBeGreaterThan(restart);
    expect(prune).toBeGreaterThan(check);
    expect(wf).toContain("docker-compose.yml");
    expect(wf.indexOf("sync-compose.sh")).toBeLessThan(wf.indexOf("docker compose pull app"));
  });

  // 20–23 Nov 2026: deploy/run-cron.sh was encoded but not checked out, so an EMPTY runner was
  // shipped, passed its exit-code-only smoke test, and every scheduled job ran a 0-byte script.
  it("deploy.yml checks out every file it encodes, and refuses an empty one", () => {
    const wf = readFileSync(join(ROOT, ".github/workflows/deploy.yml"), "utf8");
    const sparse = [...wf.matchAll(/sparse-checkout: \|\n([\s\S]*?)\n\s*sparse-checkout-cone-mode/g)]
      .flatMap((m) => m[1].split("\n").map((l) => l.trim()).filter(Boolean));
    const encoded = [...wf.matchAll(/base64 -w0 ([\w./-]+)\)/g)].map((m) => m[1]);
    expect(encoded).toEqual(expect.arrayContaining(["deploy/crontab", "deploy/install-crontab.sh", "deploy/run-cron.sh"]));
    for (const f of encoded) expect(sparse, `${f} is encoded but not checked out`).toContain(f);
    expect(wf).toMatch(/\[ -s "\$f" \] \|\| \{/);
  });

  it("deploy.yml's runner smoke test needs the runner's own 'jobs HTTP 2xx' line, not just exit 0", () => {
    const wf = readFileSync(join(ROOT, ".github/workflows/deploy.yml"), "utf8");
    expect(wf).toContain("grep -qE ' jobs HTTP 2[0-9][0-9]:' \"$SMOKE\" || SMOKE_OK=0");
    expect(wf).not.toContain('if bash "$WORK/run-cron.sh" jobs >> /tmp/foundry-cron.log 2>&1; then');
    // and the line it looks for is the one run-cron.sh really prints
    expect(readFileSync(join(ROOT, "deploy/run-cron.sh"), "utf8")).toContain('echo "$(date -u +%FT%TZ) $name HTTP ${code}: ${body}"');
  });
});
