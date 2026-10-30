/**
 * The all-clients board on the Gitwork wiki. The headline is what someone reads first, so the
 * cases here are the ones where a calmer headline than the truth would be wrong.
 */
import { describe, expect, it } from "vitest";
import {
  monitorState,
  orderBoard,
  summariseBoard,
  type BoardClient,
  type BoardMonitor,
} from "@/lib/monitor-board";

const mon = (over: Partial<BoardMonitor> = {}): BoardMonitor => ({
  id: Math.random().toString(36).slice(2),
  name: "Website",
  target: "https://example.com/",
  status: "UP",
  stale: false,
  alertKind: null,
  latencyMs: 90,
  statusCode: 200,
  error: null,
  checkedAt: "2026-10-30T16:00:00.000Z",
  downSince: null,
  uptime24h: 100,
  ...over,
});
const client = (slug: string, name: string, monitors: BoardMonitor[]): BoardClient => ({
  clientId: slug,
  slug,
  name,
  monitors,
});

describe("one monitor's state", () => {
  it("a stale monitor is 'not checking', never its last result", () => {
    expect(monitorState(mon({ stale: true, status: "UP" }))).toBe("stale");
    expect(monitorState(mon({ stale: true, status: "DOWN" }))).toBe("stale");
  });

  it("down beats an open unstable alert; unstable beats slow", () => {
    expect(monitorState(mon({ status: "DOWN", alertKind: "flaky" }))).toBe("down");
    expect(monitorState(mon({ status: "DEGRADED", alertKind: "flaky" }))).toBe("flaky");
    expect(monitorState(mon({ status: "UP", alertKind: "flaky" }))).toBe("flaky");
    expect(monitorState(mon({ status: "DEGRADED" }))).toBe("slow");
    expect(monitorState(mon({ status: "UNKNOWN" }))).toBe("pending");
  });
});

describe("the headline", () => {
  it("all up reads 'All systems operational' with the count", () => {
    const s = summariseBoard([
      client("gitwork", "Gitwork", [mon(), mon()]),
      client("fellas-loaded", "Fellas Loaded", [mon()]),
    ]);
    expect(s.level).toBe("operational");
    expect(s.headline).toBe("All systems operational");
    expect(s.sub).toBe("3/3 services up · 2 clients");
  });

  it("anything down leads, and names the client", () => {
    const s = summariseBoard([
      client("gitwork", "Gitwork", [mon()]),
      client("fellas-loaded", "Fellas Loaded", [mon({ status: "DOWN" }), mon({ status: "DEGRADED" })]),
      client("wedge", "Wedge", [mon({ stale: true })]),
    ]);
    expect(s.level).toBe("outage");
    expect(s.headline).toBe("1 service down — Fellas Loaded");
    expect(s.down).toBe(1);
    expect(s.degraded).toBe(1);
    expect(s.unchecked).toBe(1);
  });

  it("⚠️ a monitor nobody is checking is never 'operational'", () => {
    const s = summariseBoard([client("wedge", "Wedge", [mon(), mon({ stale: true })])]);
    expect(s.level).toBe("unchecked");
    expect(s.headline).toBe("1 service not being checked");
  });

  it("degraded when something is slow or unstable but nothing is down", () => {
    expect(summariseBoard([client("a", "A", [mon({ status: "DEGRADED" }), mon({ alertKind: "flaky" })])]).headline).toBe(
      "2 services degraded",
    );
  });

  it("no monitors is said plainly, not as operational", () => {
    const s = summariseBoard([client("a", "A", [])]);
    expect(s.level).toBe("empty");
    expect(s.headline).toBe("No monitors yet");
  });

  it("names every client with something down", () => {
    const s = summariseBoard([
      client("a", "After Desk", [mon({ status: "DOWN" })]),
      client("b", "Wedge", [mon({ status: "DOWN" }), mon({ status: "DOWN" })]),
    ]);
    expect(s.headline).toBe("3 services down — After Desk, Wedge");
  });
});

describe("the order", () => {
  it("Gitwork first, then trouble worst-first, then by name; unmonitored apart", () => {
    const { monitored, unmonitored } = orderBoard([
      client("wedge", "Wedge", [mon()]),
      client("after-desk", "After Desk", [mon()]),
      client("fellas-loaded", "Fellas Loaded", [mon({ status: "DOWN" })]),
      client("gitwork", "Gitwork", [mon()]),
      client("polleniq", "PollenIQ", [mon({ status: "DEGRADED" })]),
      client("kernel", "Kernel", []),
      client("campfire", "Campfire", []),
    ]);
    expect(monitored.map((c) => c.slug)).toEqual(["gitwork", "fellas-loaded", "polleniq", "after-desk", "wedge"]);
    expect(unmonitored.map((c) => c.slug)).toEqual(["campfire", "kernel"]);
  });
});
