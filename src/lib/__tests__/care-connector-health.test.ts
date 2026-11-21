import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  connectorCanSend,
  errorRetryMinutes,
  ERROR_RETRY_MAX_MINUTES,
  HEALTH_ERROR_AFTER_FAILURES,
  isSyncDue,
  nextConnectorHealth,
  readHealthState,
  SENDABLE_CONNECTION,
  type ConnectorHealth,
} from "@/lib/care-connector-health";

const at = (iso: string) => new Date(iso);
const run = (previousHealth: ConnectorHealth, consecutiveFailures: number, errors: string[], failingSince: string | null = null) =>
  nextConnectorHealth({ previousHealth, previous: { consecutiveFailures, failingSince }, errors, now: at("2026-11-20T12:00:00Z") });

describe("a connector only goes red once it is really broken", () => {
  it("one failed run is a blip, not a dead mailbox", () => {
    const out = run("CONNECTED", 0, ["auth failed"]);
    expect(out.health).toBe("CONNECTED");
    expect(out.consecutiveFailures).toBe(1);
    expect(out.justFailed).toBe(false);
  });

  it("two in a row is a dead mailbox", () => {
    const out = run("CONNECTED", 1, ["auth failed"], "2026-11-20T11:00:00Z");
    expect(out.health).toBe("ERROR");
    expect(out.justFailed).toBe(true);
    // The outage started when the failures started, not when we noticed.
    expect(out.failingSince).toBe("2026-11-20T11:00:00Z");
  });

  it("stays red without re-announcing itself", () => {
    // One alert per outage: `justFailed` is the transition, not the state.
    expect(run("ERROR", 5, ["still failing"]).justFailed).toBe(false);
  });

  it("the threshold is the one it claims", () => {
    expect(HEALTH_ERROR_AFTER_FAILURES).toBe(2);
    expect(run("CONNECTED", HEALTH_ERROR_AFTER_FAILURES - 2, ["x"]).health).toBe("CONNECTED");
    expect(run("CONNECTED", HEALTH_ERROR_AFTER_FAILURES - 1, ["x"]).health).toBe("ERROR");
  });
});

describe("recovery", () => {
  it("one good run clears everything", () => {
    const out = run("ERROR", 9, []);
    expect(out).toMatchObject({ health: "CONNECTED", consecutiveFailures: 0, failingSince: null, justRecovered: true });
  });

  it("a good run on an already-healthy connector is not a recovery", () => {
    expect(run("CONNECTED", 0, []).justRecovered).toBe(false);
  });

  it("a connector nobody set up is never called broken", () => {
    // "Never connected" and "this broke" are different facts with different fixes, and only one
    // of them is anybody's fault. But it still can't be left looking fine, so it stays as it was.
    expect(run("NEEDS_SETUP", 0, ["no credentials"]).health).toBe("NEEDS_SETUP");
    expect(run("NEEDS_SETUP", 1, ["no credentials"]).health).toBe("ERROR");
  });
});

describe("the counters survive every shape lastSyncStats has ever had", () => {
  it.each([
    [null, 0],
    [undefined, 0],
    [{}, 0],
    [{ ingested: 3, errors: [] }, 0], // every row written before this existed
    [{ consecutiveFailures: 4 }, 4],
    [{ consecutiveFailures: "4" }, 0], // a string is not a count
    [{ consecutiveFailures: -2 }, 0],
    [{ consecutiveFailures: 2.7 }, 2],
    [{ consecutiveFailures: Number.NaN }, 0],
  ])("%j → %i", (stats, expected) => {
    expect(readHealthState(stats).consecutiveFailures).toBe(expected);
  });

  it("an older row with no counter does not read as mid-outage", () => {
    expect(readHealthState({ ingested: 1 }).failingSince).toBeNull();
  });
});

describe("a failing connector is retried, more slowly", () => {
  it("backs off and then stops backing off", () => {
    expect(errorRetryMinutes(2)).toBe(30);
    expect(errorRetryMinutes(3)).toBe(60);
    expect(errorRetryMinutes(4)).toBe(120);
    expect(errorRetryMinutes(99)).toBe(ERROR_RETRY_MAX_MINUTES);
  });

  it("however long it has been down, it is still retried within the cap", () => {
    expect(
      isSyncDue({
        health: "ERROR",
        intervalMinutes: 60,
        lastSyncedAt: at("2026-11-20T05:00:00Z"), // 7h ago, past the 6h cap
        consecutiveFailures: 50,
        now: at("2026-11-20T12:00:00Z"),
      }),
    ).toBe(true);
  });

  it("a healthy connector keeps its own interval", () => {
    const base = { health: "CONNECTED" as const, intervalMinutes: 60, consecutiveFailures: 0, now: at("2026-11-20T12:00:00Z") };
    expect(isSyncDue({ ...base, lastSyncedAt: at("2026-11-20T11:30:00Z") })).toBe(false);
    expect(isSyncDue({ ...base, lastSyncedAt: at("2026-11-20T10:59:00Z") })).toBe(true);
  });

  it("a failing connector waits longer than its interval would", () => {
    // 30 minutes since the last try, a 15-minute interval: healthy it would be due, failing it
    // is not — that is the whole point of the backoff.
    const base = { intervalMinutes: 15, lastSyncedAt: at("2026-11-20T11:30:00Z"), now: at("2026-11-20T12:00:00Z") };
    expect(isSyncDue({ ...base, health: "CONNECTED", consecutiveFailures: 0 })).toBe(true);
    expect(isSyncDue({ ...base, health: "ERROR", consecutiveFailures: 4 })).toBe(false);
  });

  it("manual-only beats everything, health included", () => {
    // Someone chose that. A connector failing is not a reason to start syncing one that was
    // asked not to be.
    for (const health of ["CONNECTED", "ERROR", "NEEDS_SETUP"] as const) {
      expect(isSyncDue({ health, intervalMinutes: 0, lastSyncedAt: null, consecutiveFailures: 9 })).toBe(false);
    }
  });

  it("a connector that has never synced is due whatever its health", () => {
    for (const health of ["CONNECTED", "ERROR", "NEEDS_SETUP"] as const) {
      expect(isSyncDue({ health, intervalMinutes: 60, lastSyncedAt: null, consecutiveFailures: 0 })).toBe(true);
    }
  });
});

describe("a red connector is still reachable — the part that would strand it", () => {
  it("can still be sent through", () => {
    expect(connectorCanSend("CONNECTED")).toBe(true);
    expect(connectorCanSend("ERROR")).toBe(true);
    expect(connectorCanSend("NEEDS_SETUP")).toBe(false);
  });

  it("the Prisma filter excludes only NEEDS_SETUP", () => {
    expect(SENDABLE_CONNECTION).toEqual({ health: { not: "NEEDS_SETUP" } });
  });

  it("no Care reader filters on CONNECTED alone", () => {
    /*
     * This is the assertion that matters most in the file. Degrading a connector while the cron,
     * "Sync now" and the reply dispatchers still filter `health: "CONNECTED"` would mean a
     * connector that flips to ERROR can never be synced, never be replied through, and therefore
     * never prove itself healthy again — permanently stuck, with no way back short of a database
     * edit. The degrading and the widening are one change, and this is what keeps them one.
     */
    const files = [
      "src/server/support-sync.ts",
      "src/server/support-reply.ts",
      "src/app/api/cron/support-sync/route.ts",
    ];
    for (const f of files) {
      const src = readFileSync(join(process.cwd(), f), "utf8");
      const offenders = src.split("\n").filter((l) => /health:\s*"CONNECTED"/.test(l) && !l.trimStart().startsWith("*"));
      expect(offenders, `${f} still filters on CONNECTED: ${offenders.join(" | ")}`).toEqual([]);
    }
  });
});

describe("the health values match the database", () => {
  it("ConnectorHealth mirrors Prisma's enum", () => {
    // Declared by hand so the rules stay pure, which means it can drift. The DTO type in
    // `types/support.ts` is LOWER-cased ("connected"), so getting these confused produces a
    // comparison that silently never matches.
    const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
    const body = schema.split("enum ConnectionHealth {")[1].split("}")[0];
    const values = body.split("\n").map((l) => l.trim()).filter(Boolean).sort();
    expect(values).toEqual(["CONNECTED", "ERROR", "NEEDS_SETUP"]);
    const mine = readFileSync(join(process.cwd(), "src/lib/care-connector-health.ts"), "utf8");
    const union = mine.split("export type ConnectorHealth =")[1].split(";")[0];
    for (const v of values) expect(union).toContain(`"${v}"`);
  });
});
