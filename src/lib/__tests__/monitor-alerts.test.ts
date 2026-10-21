/**
 * When an uptime monitor tells someone. Written after Fellas Loaded went down with Google Cloud
 * and the client told us first — the rules here decide who gets messaged, so each one is pinned.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ALERT_AFTER_FAILURES,
  alertMessage,
  formatDuration,
  isStale,
  nextAlertState,
  staleMessage,
  type AlertState,
  type ProbeStatus,
} from "@/lib/monitor-alerts";
import { normaliseTarget, suggestMonitors } from "@/lib/monitor-suggestions";
import { DEFAULT_EVENT_ROUTING } from "@/server/notification-events";

const t = (min: number) => new Date(Date.UTC(2026, 9, 20, 14, min));
const fresh: AlertState = { failStreak: 0, downSince: null, alertedDownAt: null };

/** Run a sequence of check results, collecting the alerts it produced. */
function run(statuses: ProbeStatus[]) {
  let state = fresh;
  const alerts: string[] = [];
  statuses.forEach((st, i) => {
    const r = nextAlertState(state, st, t(i * 5));
    state = r.state;
    if (r.alert) alerts.push(r.alert.kind === "down" ? `down@${i}` : `recovered@${i}:${Math.round(r.alert.downForMs / 60000)}m`);
  });
  return { alerts, state };
}

describe("down and recovered", () => {
  it("⚠️ one failed check is a blip — no alert, and no 'back up' afterwards", () => {
    expect(run(["UP", "DOWN", "UP"]).alerts).toEqual([]);
  });

  it(`alerts on the ${ALERT_AFTER_FAILURES}nd failure in a row, from when it FIRST failed`, () => {
    let s = fresh;
    s = nextAlertState(s, "DOWN", t(0)).state;
    const second = nextAlertState(s, "DOWN", t(5));
    expect(second.alert).toEqual({ kind: "down", since: t(0), failures: 2 });
  });

  it("⚠️ ONCE per outage — an hour down is one message, not twelve", () => {
    expect(run(["DOWN", "DOWN", "DOWN", "DOWN", "DOWN", "DOWN"]).alerts).toEqual(["down@1"]);
  });

  it("says when it's back, with how long it was down", () => {
    expect(run(["DOWN", "DOWN", "DOWN", "UP"]).alerts).toEqual(["down@1", "recovered@3:15m"]);
  });

  it("a second outage after recovering alerts again", () => {
    expect(run(["DOWN", "DOWN", "UP", "DOWN", "DOWN"]).alerts).toEqual(["down@1", "recovered@2:10m", "down@4"]);
  });

  it("slow (DEGRADED) is not down, and 'could not tell' (UNKNOWN) changes nothing", () => {
    expect(run(["DEGRADED", "DEGRADED", "DEGRADED"]).alerts).toEqual([]);
    const { state } = run(["DOWN", "UNKNOWN"]);
    expect(state.failStreak).toBe(1);
    expect(run(["DOWN", "UNKNOWN", "DOWN"]).alerts).toEqual(["down@2"]);
  });

  it("DEGRADED counts as recovered — the service answered", () => {
    expect(run(["DOWN", "DOWN", "DEGRADED"]).alerts).toEqual(["down@1", "recovered@2:10m"]);
  });
});

describe("the messages", () => {
  const ctx = { clientName: "Fellas Loaded", monitorName: "Production API", target: "https://api.fellasloaded.com/api/feed/categories/" };

  it("down names the client, the service, when it started and why", () => {
    const m = alertMessage(ctx, { kind: "down", since: t(5), failures: 2 }, { statusCode: 503, error: null });
    expect(m.title).toBe("🔴 Fellas Loaded — Production API is down");
    expect(m.body).toContain("Failing since 14:05 UTC (2 checks in a row) · HTTP 503");
    const noCode = alertMessage(ctx, { kind: "down", since: t(5), failures: 2 }, { statusCode: null, error: "ECONNREFUSED" });
    expect(noCode.body).toContain("ECONNREFUSED");
  });

  it("recovered says how long", () => {
    const m = alertMessage(ctx, { kind: "recovered", since: t(0), downForMs: 125 * 60000 }, { statusCode: 200, error: null });
    expect(m.title).toBe("🟢 Fellas Loaded — Production API is back up");
    expect(m.body).toContain("Down for 2 h 5 min, from 14:00 UTC");
  });

  it("durations read like a person wrote them", () => {
    expect(formatDuration(20_000)).toBe("under a minute");
    expect(formatDuration(4 * 60000)).toBe("4 min");
    expect(formatDuration(120 * 60000)).toBe("2 h");
    expect(formatDuration(78 * 86400000)).toBe("78 days");
  });
});

describe("the watchdog — the failure we actually had", () => {
  const base = { enabled: true, createdAt: t(0), intervalMinutes: 5 };

  it("⚠️ a monitor last checked 4 August is stale, whatever it last said", () => {
    expect(isStale({ ...base, lastCheckedAt: new Date("2026-08-04T10:02:00Z") }, new Date("2026-10-21T10:00:00Z"))).toBe(true);
  });

  it("is not stale inside its window (3 intervals, at least 30 min)", () => {
    expect(isStale({ ...base, lastCheckedAt: t(0) }, t(29))).toBe(false);
    expect(isStale({ ...base, lastCheckedAt: t(0) }, t(31))).toBe(true);
    expect(isStale({ ...base, intervalMinutes: 60, lastCheckedAt: t(0) }, new Date(t(0).getTime() + 170 * 60000))).toBe(false);
  });

  it("a brand-new monitor waits for its first run; a paused one is never stale", () => {
    expect(isStale({ ...base, lastCheckedAt: null }, t(10))).toBe(false);
    expect(isStale({ ...base, lastCheckedAt: null }, t(45))).toBe(true);
    expect(isStale({ ...base, enabled: false, lastCheckedAt: null }, t(500))).toBe(false);
  });

  it("the message lists what stopped and when it was last checked", () => {
    const m = staleMessage([{ clientName: "Wedge", monitorName: "Big Wedge Golf", lastCheckedAt: t(0) }], new Date(t(0).getTime() + 3 * 86400000));
    expect(m.title).toContain("(1)");
    expect(m.body).toContain("• Wedge — Big Wedge Golf: last checked 3 days ago");
  });

  it("⚠️ runs from the every-minute jobs worker — not from the cron it watches", () => {
    const jobs = readFileSync(join(process.cwd(), "src/app/api/cron/jobs/route.ts"), "utf8");
    expect(jobs).toContain("checkMonitorsWatchdog()");
    const own = readFileSync(join(process.cwd(), "src/app/api/cron/wiki-monitors/route.ts"), "utf8");
    expect(own).not.toContain("checkMonitorsWatchdog");
  });
});

describe("where alerts go", () => {
  it("posts to Slack (channelRoutes) as well as admins' devices", () => {
    expect(DEFAULT_EVENT_ROUTING["clients.monitor_alert"]).toEqual(["inApp", "push", "slack"]);
  });
});

describe("suggestions from Platforms", () => {
  it("offers each platform URL nothing watches, once", () => {
    const out = suggestMonitors(
      [
        { name: "Production API & Admin", url: "https://api.fellasloaded.com/api/schema/swagger/" },
        { name: "Web Live", url: "https://fellasloaded.com" },
        { name: "Web Live (dup)", url: "https://FellasLoaded.com/" },
        { name: "iOS Rebuild", url: null },
        { name: "Repo", url: "git@github.com:x/y.git" },
      ],
      [],
    );
    expect(out.map((s) => s.name)).toEqual(["Production API & Admin", "Web Live"]);
  });

  it("⚠️ watches a site's root, not its admin login — that answers whether or not the site works", () => {
    const [s] = suggestMonitors([{ name: "Fellas Studios Site", url: "https://fellasstudios.com/wp-admin" }], []);
    expect(s.target).toBe("https://fellasstudios.com/");
  });

  it("skips what's already monitored, however the URL was written", () => {
    expect(suggestMonitors([{ name: "Web", url: "https://fellasloaded.com" }], ["https://fellasloaded.com/"])).toEqual([]);
    expect(normaliseTarget("https://Example.com/a/")).toBe(normaliseTarget("https://example.com/a"));
  });
});
