/**
 * deploy/install-crontab.sh, run against a fake `crontab` command and fixture crontabs. The deploy
 * runs it on production, so the cases that matter are the real box's: hand-installed duplicates,
 * the weekly db-backup line, comments, an empty crontab, and a second run changing nothing.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SCRIPT = join(ROOT, "deploy/install-crontab.sh");
const MANAGED = join(ROOT, "deploy/crontab");

const BACKUP = "30 1 * * 0 /opt/apps/foundry/deploy/db-backup.sh >> /opt/apps/foundry/backups/backup.log 2>&1";
const LIVE = [
  "0 2 * * *  /opt/apps/foundry/run-cron.sh docs-gdrive-backup   >> /tmp/foundry-cron.log 2>&1",
  "0 8 * * *  /opt/apps/foundry/run-cron.sh support-sync         >> /tmp/foundry-cron.log 2>&1",
  "0 13 * * * /opt/apps/foundry/run-cron.sh support-sync >> /tmp/foundry-cron.log 2>&1",
  "# Foreman — daily delivery-risk digest. Enqueues FOREMAN_RUN; the jobs worker executes it.",
  "0 9 * * * /opt/apps/foundry/run-cron.sh foreman >> /tmp/foundry-cron.log 2>&1",
  "# Weekly DB backup (Sunday 01:30) — separate script, its own log",
  BACKUP,
  "* * * * *  /opt/apps/foundry/run-cron.sh jobs                 >> /tmp/foundry-cron.log 2>&1",
  "*/10 * * * * /usr/local/bin/someone-elses-thing",
].join("\n");

let dir: string;
let live: string;

function env(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  // The test environment plus the fakes; the script reads only these four variables.
  return { ...process.env, PATH: process.env.PATH ?? "/usr/bin:/bin", CRONTAB_CMD: join(dir, "fakecron"), RUN_CRON: join(dir, "run-cron.sh"), FAKE_CRONTAB_FILE: live, ...extra };
}

function install(extra: Record<string, string> = {}) {
  return spawnSync("bash", [SCRIPT, MANAGED], { env: env(extra), encoding: "utf8" });
}

function installed(): string[] {
  return readFileSync(live, "utf8").split("\n");
}

function managedLines(): string[] {
  return readFileSync(MANAGED, "utf8")
    .split("\n")
    .filter((l) => l.trim() && !l.startsWith("#"));
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "crontab-test-"));
  live = join(dir, "live");
  writeFileSync(
    join(dir, "fakecron"),
    '#!/usr/bin/env bash\nF="${FAKE_CRONTAB_FILE:?}"\nif [ "$1" = "-l" ]; then [ -f "$F" ] && cat "$F" || { echo "no crontab for user" >&2; exit 1; }; elif [ "$1" = "-" ]; then cat > "$F"; fi\n',
  );
  chmodSync(join(dir, "fakecron"), 0o755);
  writeFileSync(join(dir, "run-cron.sh"), '#!/usr/bin/env bash\ncurl "http://127.0.0.1:3000/api/cron/$1"\n');
  chmodSync(join(dir, "run-cron.sh"), 0o755);
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

// Each case spawns bash (and the fake crontab) a few times; give a slow CI box room.
describe("install-crontab.sh", { timeout: 30_000 }, () => {
  it("parses as bash", () => {
    expect(() => execFileSync("bash", ["-n", SCRIPT])).not.toThrow();
  });

  it("installs every managed line exactly once and keeps everything else", () => {
    writeFileSync(live, LIVE + "\n");
    const run = install();
    expect(run.status, run.stdout + run.stderr).toBe(0);

    const lines = installed();
    for (const line of managedLines()) expect(lines.filter((l) => l === line)).toHaveLength(1);
    expect(lines).toContain(BACKUP);
    expect(lines).toContain("# Weekly DB backup (Sunday 01:30) — separate script, its own log");
    expect(lines).toContain("*/10 * * * * /usr/local/bin/someone-elses-thing");
    expect(lines.filter((l) => l === "# BEGIN foundry-managed")).toHaveLength(1);
    expect(lines.filter((l) => l === "# END foundry-managed")).toHaveLength(1);
  });

  it("removes hand-installed duplicates of managed jobs, with their comment, and says so", () => {
    writeFileSync(live, LIVE + "\n");
    const run = install();
    const text = readFileSync(live, "utf8");
    // support-sync was installed twice by hand; now it runs once, from the managed block.
    expect(text.match(/run-cron\.sh support-sync/g)).toHaveLength(1);
    expect(text).not.toContain("0 13 * * * /opt/apps/foundry/run-cron.sh support-sync");
    expect(text).not.toContain("# Foreman — daily delivery-risk digest");
    expect(run.stdout).toContain("removed un-marked duplicates");
    expect(run.stdout).toContain("    0 8 * * *  /opt/apps/foundry/run-cron.sh support-sync");
  });

  it("is idempotent: a second run changes nothing", () => {
    writeFileSync(live, LIVE + "\n");
    install();
    const first = readFileSync(live, "utf8");
    const again = install();
    expect(again.status).toBe(0);
    expect(readFileSync(live, "utf8")).toBe(first);
  });

  it("replaces an older managed block rather than adding a second", () => {
    writeFileSync(
      live,
      [BACKUP, "", "# BEGIN foundry-managed", "0 4 * * * /opt/apps/foundry/run-cron.sh pulse-reconcile >> /tmp/foundry-cron.log 2>&1", "# END foundry-managed"].join("\n") + "\n",
    );
    expect(install().status).toBe(0);
    const text = readFileSync(live, "utf8");
    expect(text).not.toContain("0 4 * * * /opt/apps/foundry/run-cron.sh pulse-reconcile");
    expect(text.match(/# BEGIN foundry-managed/g)).toHaveLength(1);
  });

  it("works on a user with no crontab, and warns that the backup is not scheduled", () => {
    expect(existsSync(live)).toBe(false);
    const run = install();
    expect(run.status, run.stdout + run.stderr).toBe(0);
    for (const line of managedLines()) expect(installed()).toContain(line);
    expect(run.stdout).toContain("No db-backup.sh line");
  });

  it("refuses, changing nothing, when run-cron.sh is missing", () => {
    writeFileSync(live, LIVE + "\n");
    const run = install({ RUN_CRON: join(dir, "missing.sh") });
    expect(run.status).not.toBe(0);
    expect(readFileSync(live, "utf8")).toBe(LIVE + "\n");
  });

  it("refuses, changing nothing, when run-cron.sh is EMPTY (every job silently did nothing, Nov 2026)", () => {
    writeFileSync(live, LIVE + "\n");
    writeFileSync(join(dir, "run-cron.sh"), "");
    const run = install();
    expect(run.status).not.toBe(0);
    expect(run.stdout + run.stderr).toContain("empty or not a cron runner");
    expect(readFileSync(live, "utf8")).toBe(LIVE + "\n");
  });

  it("fails the deploy when the installed crontab does not hold the managed lines", () => {
    // A crontab command that accepts the write and then reads back the OLD file.
    writeFileSync(
      join(dir, "fakecron"),
      '#!/usr/bin/env bash\nF="${FAKE_CRONTAB_FILE:?}"\nif [ "$1" = "-l" ]; then cat "$F"; elif [ "$1" = "-" ]; then cat > /dev/null; fi\n',
    );
    writeFileSync(live, LIVE + "\n");
    const run = install();
    expect(run.status).not.toBe(0);
    expect(run.stdout).toContain("NOT installed correctly");
  });
});
