/**
 * When an uptime monitor tells someone. Written after Fellas Loaded went down with Google Cloud
 * and the client told us first — the rules here decide who gets messaged, so each one is pinned.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ALERT_AFTER_FAILURES,
  alertBlocks,
  checkEveryMs,
  incidentHeading,
  shouldConfirm,
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
const fresh: AlertState = { failStreak: 0, downSince: null, alertedDownAt: null, alertKind: null, alertClearedAt: null };

/**
 * Run a sequence of check results the way the server does — each check sees the statuses since
 * the last alert cleared — collecting the alerts it produced.
 */
function run(statuses: ProbeStatus[]) {
  let state = fresh;
  let sinceClear: ProbeStatus[] = [];
  const alerts: string[] = [];
  statuses.forEach((st, i) => {
    const r = nextAlertState(state, st, t(i * 5), sinceClear);
    state = r.state;
    sinceClear = r.state.alertClearedAt && r.alert && (r.alert.kind === "recovered" || r.alert.kind === "stable") ? [] : [...sinceClear, st];
    const a = r.alert;
    if (a) alerts.push(a.kind === "recovered" || a.kind === "stable" ? `${a.kind}@${i}:${Math.round(a.downForMs / 60000)}m` : `${a.kind}@${i}`);
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
    expect(second.state.alertKind).toBe("down");
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

describe("unstable — the shape Google's London outage took", () => {
  it("⚠️ a service failing every other check alerts as unstable, which two-in-a-row never would", () => {
    expect(run(["DOWN", "UP", "DOWN", "UP", "DOWN"]).alerts).toEqual(["flaky@4"]);
  });

  it("⚠️ ONE unstable and ONE stable-again, however long it flaps — not a message every check", () => {
    const flap = ["DOWN", "UP", "DOWN", "UP", "DOWN", "UP", "DOWN", "UP", "DOWN", "UP"] as ProbeStatus[];
    const settle = ["UP", "UP", "UP", "UP", "UP", "UP"] as ProbeStatus[];
    expect(run([...flap, ...settle]).alerts).toEqual(["flaky@4", "stable@14:70m"]);
  });

  it("stays open until a whole window passes", () => {
    expect(run(["DOWN", "UP", "DOWN", "UP", "DOWN", "UP", "UP", "UP", "UP", "UP"]).alerts).toEqual(["flaky@4"]);
  });

  it("escalates once to down if an unstable service then fails twice in a row", () => {
    expect(run(["DOWN", "UP", "DOWN", "UP", "DOWN", "DOWN", "DOWN", "UP"]).alerts).toEqual([
      "flaky@4",
      "down@5",
      "recovered@7:35m",
    ]);
  });

  it("⚠️ failures already reported and recovered are not re-counted into a new 'unstable'", () => {
    // Hard down, back up, then ONE blip — the old failures must not make that a flaky alert.
    expect(run(["DOWN", "DOWN", "DOWN", "UP", "DOWN", "UP"]).alerts).toEqual(["down@1", "recovered@3:15m"]);
  });

  it("two failures in six is not unstable", () => {
    expect(run(["DOWN", "UP", "UP", "DOWN", "UP", "UP"]).alerts).toEqual([]);
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

  it("unstable says how many of how many", () => {
    const m = alertMessage(ctx, { kind: "flaky", since: t(0), failures: 3, of: 6 }, { statusCode: 502, error: null });
    expect(m.title).toBe("🟠 Fellas Loaded — Production API is unstable");
    expect(m.body).toContain("3 of the last 6 checks failed, since 14:00 UTC · latest: HTTP 502");
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

describe("checking faster while something is failing", () => {
  const healthy = { intervalMinutes: 5, lastStatus: "UP", failStreak: 0, alertKind: null };

  it("a healthy monitor keeps its own interval", () => {
    expect(checkEveryMs(healthy)).toBe(5 * 60000);
    expect(checkEveryMs({ ...healthy, intervalMinutes: 15 })).toBe(15 * 60000);
  });

  it("⚠️ every minute from the first failure, until any open alert has cleared", () => {
    expect(checkEveryMs({ ...healthy, lastStatus: "DOWN", failStreak: 1 })).toBe(60000);
    // Passing again but an 'unstable' alert is still open — keep watching closely.
    expect(checkEveryMs({ ...healthy, alertKind: "flaky" })).toBe(60000);
  });

  it("the cron runs every minute, so a failing monitor really is re-checked that often", () => {
    const crons = readFileSync(join(process.cwd(), "docs/vps-crons.md"), "utf8");
    expect(crons).toMatch(/^\* \* \* \* \* \/opt\/apps\/foundry\/run-cron\.sh wiki-monitors/m);
  });
});

describe("the Slack post — laid out like GitHub Status", () => {
  const blocks = alertBlocks({
    heading: incidentHeading("down"),
    title: "Fellas Loaded — Production API is down",
    url: "https://foundry.gitwork.co.uk/app/portal/fellas-loaded/wiki#monitors",
    description: "Failing since 14:05 UTC (2 checks in a row) · HTTP 503",
    services: [
      { name: "Production API", state: "down" },
      { name: "Website", state: "up" },
      { name: "Analytics <beta>", state: "slow" },
    ],
    footer: "Foundry uptime monitoring",
  }) as { type: string; text?: { text: string }; elements?: { text?: string; url?: string; type: string }[] }[];

  it("leads with the incident line, then the title as a link", () => {
    expect(blocks[0].text?.text).toBe("*Incident: Down*");
    expect(blocks[1].text?.text).toBe("*<https://foundry.gitwork.co.uk/app/portal/fellas-loaded/wiki#monitors|Fellas Loaded — Production API is down>*");
  });

  it("lists every service on the client with its status, like GitHub's components", () => {
    const rows = blocks.filter((b) => b.type === "context").map((b) => b.elements?.[0].text);
    expect(rows).toContain(":red_circle:  Production API — down");
    expect(rows).toContain(":white_check_mark:  Website");
    // Escaped, so a monitor name can't inject Slack markup.
    expect(rows).toContain(":large_yellow_circle:  Analytics &lt;beta&gt; — slow");
  });

  it("has an Open in Foundry button and a footer", () => {
    const actions = blocks.find((b) => b.type === "actions");
    expect(actions?.elements?.[0].url).toContain("/app/portal/fellas-loaded/wiki#monitors");
    expect(blocks.at(-1)?.elements?.[0].text).toBe("Foundry uptime monitoring");
  });

  it("the button can point somewhere else, like GitHub's 'View all updates'", () => {
    const withButton = alertBlocks({
      heading: "x", title: "x", url: "https://foundry.gitwork.co.uk/app/portal/fellas-loaded/wiki#monitors",
      description: "x", footer: "x", services: [],
      button: { label: "View all monitors", url: "https://foundry.gitwork.co.uk/app/portal/gitwork/wiki#monitors" },
    }) as { type: string; text?: { text: string }; elements?: { text?: { text: string } | string; url?: string }[] }[];
    const button = withButton.find((b) => b.type === "actions")?.elements?.[0];
    expect(button?.url).toBe("https://foundry.gitwork.co.uk/app/portal/gitwork/wiki#monitors");
    expect(JSON.stringify(button?.text)).toContain("View all monitors");
    // The title still links to the client's own monitors.
    expect(withButton[1].text?.text).toContain("/app/portal/fellas-loaded/wiki#monitors");
  });

  it("headings for every kind of update", () => {
    expect(incidentHeading("flaky")).toBe("Incident: Degraded");
    expect(incidentHeading("recovered")).toBe("Incident: Resolved");
    expect(incidentHeading("stable")).toBe("Incident: Resolved");
    expect(incidentHeading("stalled")).toBe("Monitoring: Stopped");
  });

  it("⚠️ stays under Slack's 50-block cap however many services a client has", () => {
    const many = alertBlocks({
      heading: "x", title: "x", url: "https://x", description: "x", footer: "x",
      services: Array.from({ length: 80 }, (_, i) => ({ name: `svc ${i}`, state: "up" as const })),
    });
    expect(many.length).toBeLessThanOrEqual(50);
    expect(JSON.stringify(many)).toContain("+60 more");
  });
});

describe("a first failure is confirmed straight away", () => {
  it("re-checks only the first failure in a row, with nothing open", () => {
    expect(shouldConfirm("DOWN", { failStreak: 1, alertKind: null })).toBe(true);
    // Already confirmed (the alert fires on the second), or an alert is already open.
    expect(shouldConfirm("DOWN", { failStreak: 2, alertKind: "down" })).toBe(false);
    expect(shouldConfirm("DOWN", { failStreak: 1, alertKind: "flaky" })).toBe(false);
    expect(shouldConfirm("UP", { failStreak: 0, alertKind: null })).toBe(false);
    expect(shouldConfirm("DEGRADED", { failStreak: 0, alertKind: null })).toBe(false);
  });

  it("two quick failures alert as down", () => {
    const first = nextAlertState(fresh, "DOWN", t(0));
    expect(shouldConfirm("DOWN", first.state)).toBe(true);
    const second = nextAlertState(first.state, "DOWN", new Date(t(0).getTime() + 20_000), ["DOWN"]);
    expect(second.alert?.kind).toBe("down");
  });
});
