/**
 * The client summary board's arithmetic and ordering.
 *
 * ⚠️ This file used to be mostly about a derived attention level — red/amber, "needs
 * attention", "unmeasured". That concept was removed from the product (the board is a
 * place to WRITE a summary, not a status dashboard), so those tests went with it rather
 * than being left asserting behaviour nobody can see. What remains is what the page
 * still promises: a note that carries its age, hidden clients that can come back, and a
 * predictable order.
 */
import { describe, expect, it } from "vitest";
import {
  NOTE_STALE_DAYS,
  assessClient,
  buildSummaryBoard,
  type SummaryClientInput,
} from "@/lib/client-summary";

const NOW = new Date("2026-09-23T12:00:00.000Z");

function client(over: Partial<SummaryClientInput> = {}): SummaryClientInput {
  return {
    id: "c1",
    slug: "c1",
    name: "Client One",
    hidden: false,
    devCount: 0,
    deliveredThisWeek: 0,
    inFlight: 0,
    planned: 0,
    note: null,
    detail: null,
    noteAt: null,
    ...over,
  };
}

function daysAgo(n: number): string {
  return new Date(NOW.getTime() - n * 86_400_000).toISOString();
}

describe("a written note carries its age", () => {
  it("reports how old it is", () => {
    const c = assessClient(client({ note: "Fine", noteAt: daysAgo(3) }), NOW);
    expect(c.noteAgeDays).toBe(3);
    expect(c.noteStale).toBe(false);
  });

  it("marks one past the threshold as stale", () => {
    /**
     * ⚠️ The whole point. Prose sitting beside figures that updated this morning reads
     * as current forever — a three-week-old "all on track" is the most misleading
     * thing this page could show.
     */
    const c = assessClient(
      client({ note: "All on track", noteAt: daysAgo(NOTE_STALE_DAYS + 1) }),
      NOW,
    );
    expect(c.noteStale).toBe(true);
  });

  it("does not go stale exactly ON the threshold", () => {
    const c = assessClient(client({ note: "x", noteAt: daysAgo(NOTE_STALE_DAYS) }), NOW);
    expect(c.noteStale).toBe(false);
  });

  it("treats an unparseable stamp as unknown age, never as today", () => {
    // ⚠️ 0 would render as "Updated today" on a note of unknown vintage.
    const c = assessClient(client({ note: "x", noteAt: "not-a-date" }), NOW);
    expect(c.noteAgeDays).toBeNull();
    expect(c.noteStale).toBe(true);
  });

  it("says nothing about the age of a card nobody has written on", () => {
    const c = assessClient(client(), NOW);
    expect(c.noteAgeDays).toBeNull();
    expect(c.noteStale).toBe(false);
  });

  it("counts the FULLER update as having been written about", () => {
    /**
     * ⚠️ A long update with no short line still means someone looked at this client.
     * Marking it stale while that sits underneath, unread, is the same lie in the
     * other direction.
     */
    const fresh = assessClient(client({ detail: "Long account", noteAt: daysAgo(2) }), NOW);
    expect(fresh.noteStale).toBe(false);
    const old = assessClient(
      client({ detail: "Long account", noteAt: daysAgo(NOTE_STALE_DAYS + 5) }),
      NOW,
    );
    expect(old.noteStale).toBe(true);
  });
});

describe("the board", () => {
  const clients = [
    client({ id: "z", name: "Zephyr" }),
    client({ id: "a", name: "Ardent" }),
    client({ id: "m", name: "Midway" }),
    client({ id: "h1", name: "Bygone", hidden: true }),
    client({ id: "h2", name: "Absent", hidden: true }),
  ];
  const board = buildSummaryBoard(clients, NOW);

  it("is alphabetical, so the order is one a person can predict", () => {
    /**
     * ⚠️ It used to sort worst-first off a derived attention level. With that judgement
     * gone from the page, ordering by an invisible signal would mean cards moved for
     * reasons nobody could see.
     */
    expect(board.cards.map((c) => c.name)).toEqual(["Ardent", "Midway", "Zephyr"]);
  });

  it("keeps hidden clients off the board", () => {
    expect(board.cards.map((c) => c.id)).not.toContain("h1");
  });

  it("returns the hidden ones, not just how many", () => {
    // ⚠️ A count with no way back is a dead end — the first UI had a "manage in
    // Portal" link that called nothing.
    expect(board.hiddenCards.map((c) => c.name)).toEqual(["Absent", "Bygone"]);
    expect(board.hidden).toBe(board.hiddenCards.length);
  });

  it("assesses hidden clients the same way, so restoring one is not a surprise", () => {
    const withNote = buildSummaryBoard(
      [client({ id: "h", name: "Held", hidden: true, note: "x", noteAt: daysAgo(30) })],
      NOW,
    );
    expect(withNote.hiddenCards[0].noteStale).toBe(true);
  });

  it("copes with an empty workspace", () => {
    const empty = buildSummaryBoard([], NOW);
    expect(empty.cards).toEqual([]);
    expect(empty.hidden).toBe(0);
  });
});
