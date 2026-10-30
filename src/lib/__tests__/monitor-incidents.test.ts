import { describe, expect, it } from "vitest";
import { incidentChangeFor, publicIncident, sortIncidents, type IncidentDTO } from "../monitor-incidents";

const since = new Date("2026-10-30T10:00:00Z");

describe("incidents from alerts", () => {
  it("opens on down and on unstable, with an automatic message", () => {
    const d = incidentChangeFor({ kind: "down" }, "API", "Unexpected status 503");
    expect(d).toEqual({ open: { kind: "down", title: "API is down", message: expect.stringContaining("503") } });
    expect(incidentChangeFor({ kind: "flaky" }, "API", null)).toMatchObject({ open: { kind: "flaky", title: "API is unstable" } });
  });
  it("resolves on recovery, with how long it lasted", () => {
    expect(incidentChangeFor({ kind: "recovered", downForMs: 29 * 60000 }, "API", null)).toEqual({
      resolve: { message: "API is responding again after 29 min." },
    });
    expect(incidentChangeFor({ kind: "stable", downForMs: 90 * 60000 }, "API", null)).toEqual({
      resolve: { message: "API has been stable again after 1 h 30 min." },
    });
  });
  it("does nothing without an alert", () => {
    expect(incidentChangeFor(null, "API", null)).toBeNull();
  });
  void since;
});

const incident: IncidentDTO = {
  id: "i1", monitorId: "m1", monitorName: "API", kind: "down", title: "API is down",
  startedAt: "2026-10-30T10:00:00.000Z", resolvedAt: null, acknowledgedAt: "2026-10-30T10:02:00.000Z",
  acknowledgedByName: "Harry Brown", status: "identified",
  updates: [
    { id: "u1", status: "investigating", message: "Detected", isPublic: true, automatic: true, authorName: null, createdAt: "2026-10-30T10:00:00.000Z" },
    { id: "u2", status: "identified", message: "DB restarting", isPublic: true, automatic: false, authorName: "Harry Brown", createdAt: "2026-10-30T10:05:00.000Z" },
    { id: "u3", status: "identified", message: "Ticket 4821 raised", isPublic: false, automatic: false, authorName: "Harry Brown", createdAt: "2026-10-30T10:06:00.000Z" },
  ],
};

describe("the client's copy", () => {
  it("drops team-only updates and every name from our side", () => {
    const p = publicIncident(incident);
    expect(p.updates.map((u) => u.id)).toEqual(["u1", "u2"]);
    expect(p.acknowledgedByName).toBeNull();
    expect(JSON.stringify(p)).not.toContain("Harry");
    expect(JSON.stringify(p)).not.toContain("4821");
    expect(p.acknowledgedAt).toBe(incident.acknowledgedAt);
  });
});

describe("order", () => {
  it("puts open incidents first, newest first within each", () => {
    const list = [
      { id: "a", startedAt: "2026-10-01T00:00:00Z", resolvedAt: "2026-10-01T01:00:00Z" },
      { id: "b", startedAt: "2026-10-02T00:00:00Z", resolvedAt: null },
      { id: "c", startedAt: "2026-10-03T00:00:00Z", resolvedAt: "2026-10-03T01:00:00Z" },
      { id: "d", startedAt: "2026-10-04T00:00:00Z", resolvedAt: null },
    ];
    expect(sortIncidents(list).map((x) => x.id)).toEqual(["d", "b", "c", "a"]);
  });
});
