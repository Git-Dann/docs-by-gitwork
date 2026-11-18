import { describe, expect, it } from "vitest";
import {
  cardDescription,
  clientMayActOn,
  clientCanAddToStage,
  clientMoveRefusal,
  deriveSignOff,
  feedbackRefusal,
  shortPersonName,
} from "../wiki-board";
import { groupByRelease, layoutBoard } from "../wiki-board-layout";
import type { BoardColumnDef } from "../tasks/board-columns";
import type { WikiBoardCard } from "@/types/wiki-board";

describe("sign-off is derived from the latest Approved / Changes needed", () => {
  it("is null with no sign-off entries, whatever comments there are", () => {
    expect(deriveSignOff([])).toBeNull();
    expect(deriveSignOff([{ kind: "comment", createdAt: "2026-11-01" }])).toBeNull();
  });

  it("a later Changes needed replaces an earlier Approved, and the other way round", () => {
    expect(
      deriveSignOff([
        { kind: "approved", createdAt: "2026-11-01" },
        { kind: "changes_requested", createdAt: "2026-11-02" },
      ]),
    ).toBe("changes_requested");
    expect(
      deriveSignOff([
        { kind: "changes_requested", createdAt: "2026-11-01" },
        { kind: "approved", createdAt: "2026-11-02" },
      ]),
    ).toBe("approved");
  });

  it("a comment after approving doesn't un-approve it", () => {
    expect(
      deriveSignOff([
        { kind: "approved", createdAt: "2026-11-01" },
        { kind: "comment", createdAt: "2026-11-03" },
      ]),
    ).toBe("approved");
  });

  it("reads by date, not by the order the entries arrive in", () => {
    expect(
      deriveSignOff([
        { kind: "approved", createdAt: "2026-11-05" },
        { kind: "changes_requested", createdAt: "2026-11-02" },
      ]),
    ).toBe("approved");
  });
});

describe("what a client may do on the board", () => {
  it("adds cards only to Backlog and To do columns", () => {
    expect(clientCanAddToStage("BACKLOG")).toBe(true);
    expect(clientCanAddToStage("TODO")).toBe(true);
    expect(clientCanAddToStage("DOING")).toBe(false);
    expect(clientCanAddToStage("IN_REVIEW")).toBe(false);
    expect(clientCanAddToStage("DONE")).toBe(false);
  });

  it("moves between any columns except into or out of Done", () => {
    expect(clientMoveRefusal("BACKLOG", "TODO")).toBeNull();
    expect(clientMoveRefusal("DOING", "IN_REVIEW")).toBeNull();
    expect(clientMoveRefusal("IN_REVIEW", "BACKLOG")).toBeNull();
    // A live card isn't the client's to rearrange, even within Done.
    expect(clientMoveRefusal("DONE", "DONE")).toMatch(/live/);
    expect(clientMoveRefusal("IN_REVIEW", "DONE")).toMatch(/Only Gitwork/);
    expect(clientMoveRefusal("DONE", "TODO")).toMatch(/live/);
  });

  it("acts only on product cards and cards the client added, never the team's dev tasks", () => {
    expect(clientMayActOn({ isCard: true, addedByClient: false })).toBe(true);
    expect(clientMayActOn({ isCard: false, addedByClient: true })).toBe(true);
    expect(clientMayActOn({ isCard: false, addedByClient: false })).toBe(false);
  });

  it("feedback: a comment needs words, Changes needed needs to say what, Approve can stand alone", () => {
    expect(feedbackRefusal("comment", "  ")).toMatch(/Write something/);
    expect(feedbackRefusal("changes_requested", "")).toMatch(/what needs changing/);
    expect(feedbackRefusal("approved", "")).toBeNull();
    expect(feedbackRefusal("comment", "Looks good")).toBeNull();
    expect(feedbackRefusal("comment", "x".repeat(5000))).toMatch(/under/);
  });

  it("shows people as first name and initial, never more", () => {
    expect(shortPersonName("Hassaan Bin Sajjad")).toBe("Hassaan S.");
    expect(shortPersonName("Abdullah")).toBe("Abdullah");
    expect(shortPersonName("  ")).toBeNull();
    expect(shortPersonName(null)).toBeNull();
  });

  it("stores links as markdown the shared renderer can draw, with ) and spaces encoded", () => {
    const out = cardDescription("Spec", ["https://example.com/a(1) b"]);
    expect(out).toBe("Spec\n\nLinks:\n- [example.com/a1 b](https://example.com/a%281%29%20b)");
    expect(cardDescription("  ", [])).toBeNull();
    expect(cardDescription(null, ["https://x.dev"])).toBe("Links:\n- [x.dev](https://x.dev)");
  });
});

function card(id: string, over: Partial<WikiBoardCard> = {}): WikiBoardCard {
  return {
    id,
    title: id,
    itemType: "feature",
    tier: null,
    area: null,
    priority: "MEDIUM",
    status: "BACKLOG",
    laneKey: "BACKLOG",
    orderKey: 1,
    release: null,
    progress: null,
    dueDate: null,
    people: [],
    signOff: null,
    feedbackCount: 0,
    description: null,
    subtasks: [],
    isCard: true,
    addedByClient: false,
    updatedAt: "2026-11-01T00:00:00.000Z",
    ...over,
  };
}

describe("the board's layout", () => {
  const releases = [
    { id: "r2", label: "v2.0.0", startDate: null, endDate: null },
    { id: "r1", label: "v1.0.0", startDate: null, endDate: null },
  ];

  it("groups cards under releases in the releases' order, with No release last", () => {
    const groups = groupByRelease(
      [card("a", { release: { id: "r1", label: "v1.0.0" } }), card("b"), card("c", { release: { id: "r2", label: "v2.0.0" } })],
      releases,
    );
    expect(groups.map((g) => g.label)).toEqual(["v2.0.0", "v1.0.0", "No release"]);
  });

  it("a card whose release has gone sits under No release rather than vanishing", () => {
    const groups = groupByRelease([card("a", { release: { id: "gone", label: "v0" } })], releases);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe("No release");
  });

  it("a default column stands in for its status, and the status column isn't drawn", () => {
    const columns: BoardColumnDef[] = [{ id: "col_ideas000", name: "Ideas", stage: "BACKLOG", isDefault: true }];
    const board = layoutBoard({ cards: [card("a", { laneKey: "col_ideas000" })], columns, releases: [], completedAt: new Map() });
    expect(board.lanes.map((l) => l.key)).not.toContain("BACKLOG");
    expect(board.lanes[0]).toMatchObject({ key: "col_ideas000", canAdd: true });
    expect(board.lanes[0].total.cards).toBe(1);
  });

  it("caps a Done column at the newest 50 cards and 50 other tasks, separately, and counts the rest", () => {
    const done = (id: string, i: number, isCard: boolean) =>
      card(id, { status: "DONE", laneKey: "DONE", isCard, itemType: isCard ? "feature" : null });
    const cards = [
      ...Array.from({ length: 60 }, (_, i) => done(`c${i}`, i, true)),
      ...Array.from({ length: 55 }, (_, i) => done(`t${i}`, i, false)),
    ];
    const completedAt = new Map(cards.map((c, i) => [c.id, new Date(Date.UTC(2026, 0, 1 + i)).toISOString()]));
    const board = layoutBoard({ cards, columns: [], releases: [], completedAt });
    const lane = board.lanes.find((l) => l.key === "DONE")!;
    expect(lane.total).toEqual({ cards: 60, other: 55 });
    expect(lane.hidden).toEqual({ cards: 10, other: 5 });
    const shown = lane.groups.flatMap((g) => g.cards);
    // The newest are kept: the oldest card (c0) is the one left out.
    expect(shown.map((c) => c.id)).not.toContain("c0");
    expect(shown.map((c) => c.id)).toContain("c59");
  });

  it("other columns are never capped", () => {
    const cards = Array.from({ length: 80 }, (_, i) => card(`x${i}`));
    const lane = layoutBoard({ cards, columns: [], releases: [], completedAt: new Map() }).lanes.find((l) => l.key === "BACKLOG")!;
    expect(lane.hidden).toEqual({ cards: 0, other: 0 });
    expect(lane.groups.flatMap((g) => g.cards)).toHaveLength(80);
  });
});
