import { describe, expect, it } from "vitest";
import {
  expiryTier,
  shouldAnnounceTier,
  mostSevereTier,
  expiryPhrase,
  rdapExpiry,
  inMaintenance,
  heartbeatStatus,
  heartbeatCheckDue,
  heartbeatDeadline,
} from "../monitor-expiry";

const NOW = new Date("2026-10-30T12:00:00Z");
const inDays = (d: number) => new Date(NOW.getTime() + d * 86_400_000);
const MIN = 60_000;

describe("expiry tiers", () => {
  it("puts a certificate in 30 / 14 / 3 / expired", () => {
    expect(expiryTier("ssl", inDays(60), NOW)).toBeNull();
    expect(expiryTier("ssl", inDays(29.5), NOW)).toBe("30d");
    expect(expiryTier("ssl", inDays(13.5), NOW)).toBe("14d");
    expect(expiryTier("ssl", inDays(2.5), NOW)).toBe("3d");
    expect(expiryTier("ssl", inDays(-1), NOW)).toBe("expired");
    expect(expiryTier("ssl", null, NOW)).toBeNull();
  });
  it("puts a domain in 30 / 7 / expired", () => {
    expect(expiryTier("domain", inDays(45), NOW)).toBeNull();
    expect(expiryTier("domain", inDays(20), NOW)).toBe("30d");
    expect(expiryTier("domain", inDays(5), NOW)).toBe("7d");
    expect(expiryTier("domain", NOW, NOW)).toBe("expired");
  });
  it("announces each tier once, and only as it gets worse", () => {
    expect(shouldAnnounceTier("ssl", null, "30d")).toBe(true);
    expect(shouldAnnounceTier("ssl", "30d", "30d")).toBe(false);
    expect(shouldAnnounceTier("ssl", "30d", "14d")).toBe(true);
    expect(shouldAnnounceTier("ssl", "14d", "30d")).toBe(false);
    expect(shouldAnnounceTier("ssl", "3d", null)).toBe(false);
    expect(shouldAnnounceTier("domain", "7d", "expired")).toBe(true);
  });
  it("takes the worst stored tier across a shared domain", () => {
    expect(mostSevereTier("domain", [null, "30d", "7d"])).toBe("7d");
    expect(mostSevereTier("domain", [null, null])).toBeNull();
  });
  it("words the time left", () => {
    expect(expiryPhrase(inDays(12.5), NOW)).toBe("expires in 12 days");
    expect(expiryPhrase(inDays(1.2), NOW)).toBe("expires in 1 day");
    expect(expiryPhrase(inDays(0.4), NOW)).toBe("expires today");
    expect(expiryPhrase(inDays(-0.5), NOW)).toBe("expired today");
    expect(expiryPhrase(inDays(-3.5), NOW)).toBe("expired 3 days ago");
  });
  it("reads the expiration event from an RDAP response", () => {
    const body = {
      events: [
        { eventAction: "registration", eventDate: "2015-01-01T00:00:00Z" },
        { eventAction: "expiration", eventDate: "2027-03-04T10:00:00Z" },
      ],
    };
    expect(rdapExpiry(body)?.toISOString()).toBe("2027-03-04T10:00:00.000Z");
    expect(rdapExpiry({ events: [{ eventAction: "registration", eventDate: "2015-01-01" }] })).toBeNull();
    expect(rdapExpiry(null)).toBeNull();
    expect(rdapExpiry({ events: "nope" })).toBeNull();
  });
});

describe("maintenance", () => {
  it("is open only until its end time", () => {
    expect(inMaintenance({ maintenanceUntil: new Date(NOW.getTime() + MIN) }, NOW)).toBe(true);
    expect(inMaintenance({ maintenanceUntil: new Date(NOW.getTime() - MIN) }, NOW)).toBe(false);
    expect(inMaintenance({ maintenanceUntil: null }, NOW)).toBe(false);
  });
});

describe("heartbeats", () => {
  const base = { intervalMinutes: 60, graceMinutes: 10, lastPingOk: true, createdAt: new Date(NOW.getTime() - 10 * 60 * MIN) };

  it("is up while pings arrive on time", () => {
    expect(heartbeatStatus({ ...base, lastPingAt: new Date(NOW.getTime() - 30 * MIN) }, NOW).status).toBe("UP");
  });
  it("goes down once the interval plus grace has passed", () => {
    expect(heartbeatStatus({ ...base, lastPingAt: new Date(NOW.getTime() - 69 * MIN) }, NOW).status).toBe("UP");
    const late = heartbeatStatus({ ...base, lastPingAt: new Date(NOW.getTime() - 71 * MIN) }, NOW);
    expect(late.status).toBe("DOWN");
    expect(late.error).toMatch(/No ping/);
  });
  it("goes down at once when the job reports a failure", () => {
    const r = heartbeatStatus({ ...base, lastPingAt: new Date(NOW.getTime() - MIN), lastPingOk: false }, NOW);
    expect(r).toEqual({ status: "DOWN", error: "The job reported a failure" });
  });
  it("waits for the first ping, then counts from creation", () => {
    const fresh = { ...base, createdAt: new Date(NOW.getTime() - 5 * MIN), lastPingAt: null, lastPingOk: null };
    expect(heartbeatStatus(fresh, NOW).status).toBe("UNKNOWN");
    expect(heartbeatStatus({ ...fresh, createdAt: new Date(NOW.getTime() - 2 * 60 * MIN) }, NOW).error).toBe("Never pinged");
  });
  it("defaults grace to a fifth of the interval, between 5 and 60 minutes", () => {
    const at = new Date("2026-10-30T00:00:00Z");
    const d = (interval: number) =>
      (heartbeatDeadline({ intervalMinutes: interval, graceMinutes: null, lastPingAt: at, lastPingOk: true, createdAt: at }).getTime() - at.getTime()) / MIN - interval;
    expect(d(5)).toBe(5);
    expect(d(60)).toBe(12);
    expect(d(1440)).toBe(60);
  });
  it("is checked the minute its deadline passes, not a whole period later", () => {
    const lastPingAt = new Date(NOW.getTime() - 71 * MIN);
    // Checked 30 min ago (before the deadline) — due now, though the interval has not elapsed.
    expect(heartbeatCheckDue({ ...base, lastPingAt, lastCheckedAt: new Date(NOW.getTime() - 30 * MIN) }, NOW)).toBe(true);
    // Already checked after the deadline — not due again until its interval.
    expect(heartbeatCheckDue({ ...base, lastPingAt, lastCheckedAt: new Date(NOW.getTime() - 0.5 * MIN) }, NOW)).toBe(false);
    // On time and recently checked — not due.
    expect(heartbeatCheckDue({ ...base, lastPingAt: new Date(NOW.getTime() - 10 * MIN), lastCheckedAt: new Date(NOW.getTime() - 5 * MIN) }, NOW)).toBe(false);
  });
});
