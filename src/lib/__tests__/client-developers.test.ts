import { describe, expect, it } from "vitest";
import { developerCards, placementAvatarUrl, placementStack } from "../client-developers";
import type { ClientPlacementRecord } from "@/types/client";
import type { CoverAssignmentDTO } from "@/types/backstage";

const pl = (over: Partial<ClientPlacementRecord>): ClientPlacementRecord => ({
  id: "pl",
  candidateId: "c1",
  candidateName: "Alex Rivera",
  candidateJobTitle: "Developer",
  candidateStack: ["Next.js"],
  candidateAvatarUrl: null,
  candidateUserId: "u1",
  clientName: "Northwind",
  projectName: "Web",
  startDate: "2026-03-01T00:00:00.000Z",
  endDate: null,
  allocationPercent: 100,
  notes: null,
  updatedAt: "2026-03-01T00:00:00.000Z",
  ...over,
});

const cover = (over: Partial<CoverAssignmentDTO>): CoverAssignmentDTO => ({
  absenceId: "a1",
  coverUserId: "u2",
  coverUserName: "Marco Bianchi",
  absentUserId: "u1",
  absentUserName: "Alex Rivera",
  endDate: "2026-11-20T00:00:00.000Z",
  ...over,
});

describe("placement stack and avatar", () => {
  it("primary first, de-duplicated ignoring case, at most four", () => {
    expect(placementStack("Swift", ["swift", "SwiftUI", " ", "Kotlin", "Go", "Rust"])).toEqual(["Swift", "SwiftUI", "Kotlin", "Go"]);
    expect(placementStack(null, [])).toEqual([]);
  });

  it("the account photo wins, and a data: URL is never sent", () => {
    expect(placementAvatarUrl("https://a/u.png", "https://a/r.png")).toBe("https://a/u.png");
    expect(placementAvatarUrl("data:image/png;base64,AAAA", "https://a/r.png")).toBe("https://a/r.png");
    expect(placementAvatarUrl("data:image/png;base64,AAAA", null)).toBeNull();
  });
});

describe("developer cards", () => {
  it("two placements on one client are one card", () => {
    const { active } = developerCards(
      [pl({ id: "a", projectName: "Web", allocationPercent: 60, startDate: "2026-04-01T00:00:00.000Z" }), pl({ id: "b", projectName: "Mobile", allocationPercent: 60 })],
      [],
    );
    expect(active).toHaveLength(1);
    expect(active[0]).toMatchObject({ projects: ["Web", "Mobile"], allocationPercent: 100, since: "2026-03-01T00:00:00.000Z" });
  });

  it("leave is matched on the account, never the name", () => {
    const byId = developerCards([pl({})], [cover({})]);
    expect(byId.active[0].onLeave).toEqual({ until: "2026-11-20T00:00:00.000Z", coveredBy: "Marco Bianchi" });
    // Same name, different account: not this person.
    const sameName = developerCards([pl({})], [cover({ absentUserId: "someone-else" })]);
    expect(sameName.active[0].onLeave).toBeNull();
    // No linked account: we can't tell, so don't claim it.
    const unlinked = developerCards([pl({ candidateUserId: null })], [cover({})]);
    expect(unlinked.active[0].onLeave).toBeNull();
  });

  it("a placed dev who covers says who for; an unplaced stand-in is kept apart", () => {
    const placed = developerCards([pl({}), pl({ id: "m", candidateId: "c2", candidateName: "Marco Bianchi", candidateUserId: "u2" })], [cover({})]);
    expect(placed.active.find((c) => c.name === "Marco Bianchi")?.covering).toEqual(["Alex"]);
    expect(placed.standIns).toEqual([]);
    const outsider = developerCards([pl({})], [cover({ coverUserId: "u9", coverUserName: "Sam Torres" })]);
    expect(outsider.standIns.map((c) => c.coverUserName)).toEqual(["Sam Torres"]);
  });

  it("past placements are apart, newest first, and a dev still active isn't also past", () => {
    const { active, past } = developerCards(
      [
        pl({ id: "old", candidateId: "c3", candidateName: "Jamie", endDate: "2026-02-01T00:00:00.000Z" }),
        pl({ id: "older", candidateId: "c4", candidateName: "Sam", endDate: "2026-01-01T00:00:00.000Z" }),
        pl({ id: "now" }),
        pl({ id: "before", endDate: "2026-02-15T00:00:00.000Z" }),
      ],
      [],
    );
    expect(active.map((c) => c.name)).toEqual(["Alex Rivera"]);
    expect(past.map((p) => p.id)).toEqual(["old", "older"]);
  });

  it("longest on the client comes first", () => {
    const { active } = developerCards(
      [pl({ id: "x", candidateId: "c9", candidateName: "Newer", startDate: "2026-09-01T00:00:00.000Z" }), pl({})],
      [],
    );
    expect(active.map((c) => c.name)).toEqual(["Alex Rivera", "Newer"]);
  });
});
