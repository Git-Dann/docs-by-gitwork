import { describe, expect, it } from "vitest";
import { buildClientHistory, timelineMilestones } from "../client-history";
import type { ClientDetailRecord, ClientLifecycleEvent, ClientPlacementRecord } from "@/types/client";

const lc = (id: string, at: string, extra: Partial<ClientLifecycleEvent> = {}): ClientLifecycleEvent => ({
  id,
  label: id,
  detail: `${id} detail`,
  at,
  status: "done",
  ...extra,
});

const placement = (over: Partial<ClientPlacementRecord> = {}): ClientPlacementRecord => ({
  id: "pl1",
  candidateId: "cand1",
  candidateName: "Alex Rivera",
  candidateJobTitle: null,
  candidateStack: [],
  candidateAvatarUrl: null,
  candidateUserId: null,
  clientName: "Northwind",
  projectName: "Web",
  startDate: "2026-03-01T00:00:00.000Z",
  endDate: null,
  allocationPercent: 100,
  notes: null,
  updatedAt: "2026-03-01T00:00:00.000Z",
  ...over,
});

const empty: Pick<
  ClientDetailRecord,
  "lifecycle" | "placements" | "pulseScans" | "studies" | "platforms" | "designs" | "documentLinks" | "touchpoints"
> = { lifecycle: [], placements: [], pulseScans: [], studies: [], platforms: [], designs: [], documentLinks: [], touchpoints: [] };

describe("client history", () => {
  it("puts everything dated in one list, newest first", () => {
    const h = buildClientHistory({
      ...empty,
      lifecycle: [lc("record", "2026-01-01T00:00:00.000Z")],
      placements: [placement()],
      pulseScans: [{ id: "s1", projectName: "northwind.co", healthScore: 86, status: "COMPLETED", createdAt: "2026-05-01T00:00:00.000Z" }],
    });
    expect(h.map((e) => e.id)).toEqual(["pulse:s1", "placement:pl1:start", "lifecycle:record"]);
    expect(h[0]).toMatchObject({ kind: "work", label: "Pulse scan · 86", href: "/app/pulse/s1" });
    expect(h[1]).toMatchObject({ kind: "people", label: "Alex Rivera joined", href: "/app/staff/cand1" });
  });

  it("a developer who left has both a joined and a moved-off entry", () => {
    const h = buildClientHistory({ ...empty, placements: [placement({ endDate: "2026-06-01T00:00:00.000Z" })] });
    expect(h.map((e) => e.label)).toEqual(["Alex Rivera moved off", "Alex Rivera joined"]);
  });

  it("an ongoing state leads the list instead of claiming its last-edit date", () => {
    const h = buildClientHistory({
      ...empty,
      lifecycle: [lc("record", "2026-01-01T00:00:00.000Z"), lc("active", "2026-11-18T00:00:00.000Z", { ongoing: true }), lc("later", "2026-11-17T00:00:00.000Z")],
    });
    expect(h[0]).toMatchObject({ id: "lifecycle:active", ongoing: true });
    // Without the ongoing rule it would still lead here, so check it outranks a NEWER dated event too.
    const h2 = buildClientHistory({
      ...empty,
      lifecycle: [lc("active", "2026-01-01T00:00:00.000Z", { ongoing: true }), lc("newer", "2026-11-17T00:00:00.000Z")],
    });
    expect(h2[0].id).toBe("lifecycle:active");
  });

  it("skips anything without a readable date rather than inventing one", () => {
    const h = buildClientHistory({ ...empty, lifecycle: [lc("bad", "not a date")], placements: [placement({ startDate: "" })] });
    expect(h).toEqual([]);
  });

  it("partial allocation is said in the detail", () => {
    const h = buildClientHistory({ ...empty, placements: [placement({ allocationPercent: 60 })] });
    expect(h[0].detail).toBe("Web · 60% of their time");
  });
});

describe("timeline milestones", () => {
  it("oldest first, ongoing and waiting last", () => {
    const { shown } = timelineMilestones([
      lc("active", "2026-01-05T00:00:00.000Z", { ongoing: true }),
      lc("b", "2026-02-01T00:00:00.000Z"),
      lc("a", "2026-01-01T00:00:00.000Z"),
      lc("w", "2026-01-02T00:00:00.000Z", { status: "waiting" }),
    ]);
    expect(shown.map((e) => e.id)).toEqual(["a", "b", "active", "w"]);
  });

  it("keeps the newest and counts the rest", () => {
    const many = Array.from({ length: 8 }, (_, i) => lc(`m${i}`, `2026-0${i + 1}-01T00:00:00.000Z`));
    const { shown, earlier } = timelineMilestones(many, 6);
    expect(shown).toHaveLength(6);
    expect(shown[0].id).toBe("m2");
    expect(earlier).toBe(2);
  });
});
