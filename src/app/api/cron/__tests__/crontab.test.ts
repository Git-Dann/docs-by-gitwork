/**
 * deploy/crontab is the VPS schedule (installed by .github/workflows/deploy.yml). This keeps it and
 * the cron routes in step: a route nobody schedules never runs, and nothing else notices. That is
 * how Foreman, the Curator and the retention sweep went months without running (docs/vps-crons.md).
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CRON_MAX_GAP } from "@/lib/cron-watch";

const ROOT = process.cwd();
const CRON_DIR = join(ROOT, "src/app/api/cron");
const CRONTAB = join(ROOT, "deploy/crontab");

/**
 * Routes that exist but are deliberately NOT scheduled, each with the reason. Adding a route
 * without scheduling it means adding it here, on purpose.
 */
const UNSCHEDULED_CRONS: Record<string, string> = {};

function cronRoutes(): string[] {
  return readdirSync(CRON_DIR)
    .filter((name) => !name.startsWith("_"))
    .filter((name) => statSync(join(CRON_DIR, name)).isDirectory())
    .filter((name) => {
      try {
        return statSync(join(CRON_DIR, name, "route.ts")).isFile();
      } catch {
        return false;
      }
    })
    .sort();
}

type Line = { schedule: string; job: string; raw: string };

function scheduledLines(): Line[] {
  return readFileSync(CRONTAB, "utf8")
    .split("\n")
    .filter((l) => l.trim() && !l.trim().startsWith("#"))
    .map((raw) => {
      const m = raw.match(/^(\S+\s+\S+\s+\S+\s+\S+\s+\S+)\s+\/opt\/apps\/foundry\/run-cron\.sh\s+([a-z0-9-]+)\s+>> \/tmp\/foundry-cron\.log 2>&1$/);
      return { schedule: m?.[1] ?? "", job: m?.[2] ?? "", raw };
    });
}

const FIELD = /^(\*|\*\/\d+|\d+(-\d+)?(,\d+(-\d+)?)*)$/;

describe("deploy/crontab", () => {
  it("every line is a five-field schedule running one job through run-cron.sh", () => {
    for (const line of scheduledLines()) {
      expect(line.job, `not a run-cron.sh line: ${line.raw}`).not.toBe("");
      for (const field of line.schedule.split(/\s+/)) {
        expect(field, `bad cron field in: ${line.raw}`).toMatch(FIELD);
      }
    }
  });

  it("names only routes that exist", () => {
    const routes = new Set(cronRoutes());
    for (const line of scheduledLines()) {
      expect(routes.has(line.job), `deploy/crontab schedules "${line.job}", which has no route`).toBe(true);
    }
  });

  it("schedules each job once", () => {
    const jobs = scheduledLines().map((l) => l.job);
    expect(jobs.filter((j, i) => jobs.indexOf(j) !== i)).toEqual([]);
  });

  it("schedules every cron route, or lists it in UNSCHEDULED_CRONS with a reason", () => {
    const scheduled = new Set(scheduledLines().map((l) => l.job));
    const unaccounted = cronRoutes().filter((r) => !scheduled.has(r) && !UNSCHEDULED_CRONS[r]);
    expect(unaccounted, "cron routes nobody schedules").toEqual([]);
  });

  it("UNSCHEDULED_CRONS only names real routes that are really unscheduled", () => {
    const routes = new Set(cronRoutes());
    const scheduled = new Set(scheduledLines().map((l) => l.job));
    for (const [name, reason] of Object.entries(UNSCHEDULED_CRONS)) {
      expect(routes.has(name), `UNSCHEDULED_CRONS names "${name}", which has no route`).toBe(true);
      expect(scheduled.has(name), `"${name}" is both scheduled and listed as unscheduled`).toBe(false);
      expect(reason.length).toBeGreaterThan(20);
    }
  });

  it("there is no vercel.json: Vercel was retired (Nov 2026), and its crons ran against Neon", () => {
    expect(existsSync(join(ROOT, "vercel.json"))).toBe(false);
  });

  it("the deploy installs deploy/crontab", () => {
    const deploy = readFileSync(join(ROOT, ".github/workflows/deploy.yml"), "utf8");
    expect(deploy).toContain("deploy/install-crontab.sh");
    expect(deploy).toContain("base64 -w0 deploy/crontab");
  });

  it("gives every scheduled job a longest gap for the watchdog, and watches nothing unscheduled", () => {
    const jobs = scheduledLines().map((l) => l.job).sort();
    expect(Object.keys(CRON_MAX_GAP).sort()).toEqual(jobs);
  });
});
