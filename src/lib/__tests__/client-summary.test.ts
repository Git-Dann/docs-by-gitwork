/**
 * The client summary board's triage.
 *
 * The board exists so Harry can drop in and see how every client is doing in one pass,
 * so the ordering IS the feature: if the one that needs him is third from the bottom,
 * the page has failed even though every number on it is correct.
 */
import { describe, expect, it } from "vitest";
import {
  assessClient,
  buildSummaryBoard,
  NOTE_STALE_DAYS,
  type SummaryClientInput,
} from "@/lib/client-summary";

const NOW = new Date("2026-09-23T12:00:00.000Z");
const ago = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

function client(p: Partial<SummaryClientInput> & Pick<SummaryClientInput, "id">): SummaryClientInput {
  return {
    slug: p.id,
    name: p.id,
    hidden: false,
    health: null,
    devCount: 1,
    waitingOnClient: 0,
    awaitingReply: 0,
    deliveredThisWeek: 0,
    inFlight: 0,
    planned: 0,
    note: null,
  detail: null,
    noteAt: null,
    ...p,
  };
}

describe("a typed note carries its age", () => {
  it("reports how old it is", () => {
    const c = assessClient(client({ id: "a", note: "All on track", noteAt: ago(3) }), NOW);
    expect(c.noteAgeDays).toBe(3);
    expect(c.noteStale).toBe(false);
  });

  it("marks a note past the threshold as stale", () => {
    // ⚠️ THE rule. Prose written three weeks ago sitting beside a figure that updated
    // this morning reads as current, which is the most misleading thing here.
    const c = assessClient(
      client({ id: "a", note: "All on track", noteAt: ago(NOTE_STALE_DAYS + 1) }),
      NOW,
    );
    expect(c.noteStale).toBe(true);
  });

  it("treats an unparseable stamp as unknown age, not as written today", () => {
    const c = assessClient(client({ id: "a", note: "x", noteAt: "not-a-date" }), NOW);
    expect(c.noteAgeDays).toBeNull();
    expect(c.noteStale).toBe(true);
  });

  it("does not call an absent note stale — there is nothing to go stale", () => {
    const c = assessClient(client({ id: "a", note: null, noteAt: null }), NOW);
    expect(c.noteStale).toBe(false);
  });
});

describe("silence is not health", () => {
  it("a client with nothing to measure is unmeasured, not ok", () => {
    // ⚠️ Colouring this green tells Harry it is fine when nobody has checked.
    expect(assessClient(client({ id: "quiet" }), NOW).attention).toBe("unmeasured");
  });

  it("a client with work and no problems is ok", () => {
    const c = assessClient(client({ id: "good", deliveredThisWeek: 4, inFlight: 2 }), NOW);
    expect(c.attention).toBe("ok");
    expect(c.reasons).toEqual([]);
  });

  it("does not flag 'nothing shipped' on a client with no tasks at all", () => {
    // Not a finding — it is the absence of a board, not a stall.
    expect(assessClient(client({ id: "quiet" }), NOW).reasons).not.toContain(
      "Stalled",
    );
  });

  it("says WHY an unmeasured card is blank instead of showing four zeros", () => {
    // Four zeros and no sentence reads as "quiet". It is "we cannot see this".
    expect(assessClient(client({ id: "quiet" }), NOW).reasons).toEqual([
      "Nothing to read",
    ]);
  });

  it("does not put that sentence on a client we CAN read", () => {
    const c = assessClient(client({ id: "fine", deliveredThisWeek: 3, health: "green" }), NOW);
    expect(c.reasons).toEqual([]);
  });

  it("does flag a stalled client that HAS work", () => {
    const c = assessClient(client({ id: "stalled", planned: 8 }), NOW);
    expect(c.reasons).toContain("Stalled");
  });
});

describe("what counts as needing attention", () => {
  it("red health is critical", () => {
    expect(assessClient(client({ id: "a", health: "red" }), NOW).attention).toBe("critical");
  });

  it("an unanswered client message is critical — someone is waiting on us", () => {
    expect(assessClient(client({ id: "a", awaitingReply: 2 }), NOW).attention).toBe("critical");
  });

  it("amber health is a watch, not a crisis", () => {
    expect(assessClient(client({ id: "a", health: "amber", inFlight: 1 }), NOW).attention).toBe(
      "watch",
    );
  });

  it("names the reasons in the order they would be acted on", () => {
    const c = assessClient(
      client({ id: "a", health: "red", awaitingReply: 1, waitingOnClient: 2, planned: 3 }),
      NOW,
    );
    // The fourth fires too: 3 planned with nothing delivered or in flight IS stalled.
    // My first expectation left it out, which would have passed a version that dropped
    // the stall check entirely.
    expect(c.reasons).toEqual([
      "Health red",
      "1 awaiting reply",
      "2 blocked on client",
      "Stalled",
    ]);
  });
});

describe("the board puts the exceptions first", () => {
  const board = buildSummaryBoard(
    [
      client({ id: "fine", name: "Fine", deliveredThisWeek: 5, inFlight: 1 }),
      client({ id: "quiet", name: "Quiet" }),
      client({ id: "bad", name: "Bad", health: "red" }),
      client({ id: "watch", name: "Watch", health: "amber", inFlight: 1 }),
    ],
    NOW,
  );

  it("orders critical → watch → unmeasured → ok", () => {
    expect(board.cards.map((c) => c.name)).toEqual(["Bad", "Watch", "Quiet", "Fine"]);
  });

  it("puts unmeasured ABOVE ok, because it needs a person", () => {
    const names = board.cards.map((c) => c.name);
    expect(names.indexOf("Quiet")).toBeLessThan(names.indexOf("Fine"));
  });

  it("counts each bucket for the header", () => {
    expect(board.counts).toEqual({ critical: 1, watch: 1, unmeasured: 1, ok: 1 });
  });
});

describe("toggling a client off", () => {
  const board = buildSummaryBoard(
    [client({ id: "a", name: "A" }), client({ id: "b", name: "B", hidden: true })],
    NOW,
  );

  it("keeps it off the board", () => {
    expect(board.cards.map((c) => c.name)).toEqual(["A"]);
  });

  it("still SAYS how many are hidden, so the board is not silently partial", () => {
    // A board that quietly shows 9 of 13 looks complete and is not.
    expect(board.hidden).toBe(1);
  });
});

describe("hidden clients can be put back", () => {
  /**
   * ⚠️ The board first reported only a COUNT of hidden clients, and the UI's "manage in
   * Portal" link called nothing — an unreachable state (§40.1) that looked like a
   * feature. Returning them is what makes restoring possible at all.
   */
  const board = buildSummaryBoard(
    [
      client({ id: "a", name: "Visible" }),
      client({ id: "z", name: "Zed", hidden: true }),
      client({ id: "b", name: "Bee", hidden: true }),
    ],
    NOW,
  );

  it("returns the hidden ones, not just how many", () => {
    expect(board.hiddenCards.map((c) => c.name)).toEqual(["Bee", "Zed"]);
  });

  it("keeps the count and the list in agreement", () => {
    expect(board.hidden).toBe(board.hiddenCards.length);
  });

  it("still keeps them off the board itself", () => {
    expect(board.cards.map((c) => c.name)).toEqual(["Visible"]);
  });
});
