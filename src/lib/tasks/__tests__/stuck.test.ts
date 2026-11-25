import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_STALE_DAYS, daysInProgress, isStuck } from "../stuck";
import { FOREMAN_DEFAULTS } from "@/server/foreman/types";

const NOW = new Date("2026-11-25T15:00:00Z");

describe("stuck in progress", () => {
  it("counts whole UTC days since the task started", () => {
    expect(daysInProgress({ status: "DOING", startedAt: "2026-11-20T23:59:00Z" }, NOW)).toBe(5);
    expect(daysInProgress({ status: "DOING", startedAt: "2026-11-25T01:00:00Z" }, NOW)).toBe(0);
  });

  it("is stuck from the threshold day on, in Doing, In review or UI done", () => {
    expect(isStuck({ status: "DOING", startedAt: "2026-11-20T09:00:00Z" }, 5, NOW)).toBe(true);
    expect(isStuck({ status: "IN_REVIEW", startedAt: "2026-11-20T09:00:00Z" }, 5, NOW)).toBe(true);
    expect(isStuck({ status: "DOING", startedAt: "2026-11-21T09:00:00Z" }, 5, NOW)).toBe(false);
  });

  it("never calls finished, unstarted or undated work stuck", () => {
    expect(isStuck({ status: "DONE", startedAt: "2026-01-01T00:00:00Z" }, 5, NOW)).toBe(false);
    expect(isStuck({ status: "TODO", startedAt: "2026-01-01T00:00:00Z" }, 5, NOW)).toBe(false);
    expect(isStuck({ status: "DOING", startedAt: null }, 5, NOW)).toBe(false);
    expect(isStuck({ status: "DOING", startedAt: "not a date" }, 5, NOW)).toBe(false);
  });

  it("uses Foreman's default, so the card and Foreman agree", () => {
    expect(DEFAULT_STALE_DAYS).toBe(FOREMAN_DEFAULTS.staleDoingDays);
  });

  it("is the rule Foreman's stalled-work finding uses", () => {
    const scan = readFileSync(join(process.cwd(), "src/server/foreman/scan.ts"), "utf8");
    expect(scan).toContain("isStuck(t, config.staleDoingDays");
  });
});

describe("the follow-up flag reaches the board", () => {
  // Both list responses are explicit allow-lists: a field left out of either never reaches the
  // board, with no error (CLAUDE.md §89).
  it.each([
    ["src/server/tasks.ts", "taskListDTO"],
    ["src/app/api/tasks/route.ts", "taskListResponse"],
  ])("%s keeps the flag in %s", (file, fn) => {
    const src = readFileSync(join(process.cwd(), file), "utf8");
    const body = src.slice(src.indexOf(`function ${fn}(`));
    expect(body.slice(0, body.indexOf("\n}\n"))).toContain("flag: task.flag ?? null");
  });
});
