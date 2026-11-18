import { describe, expect, it } from "vitest";
import { stageHistoryOf } from "../wiki-board-stage-history";

describe("a card's stage history from the client's planning tool", () => {
  it("lists each stage with its date, oldest first, in the client's own words", () => {
    // Forge #247, as imported: entered Scoping on 18 May, Future Idea on 21 May.
    const meta = { forge: { id: "247", stageDates: { "future-idea": "2026-05-21", scoping: "2026-05-18" } } };
    expect(stageHistoryOf(meta)).toEqual([
      { label: "Scoping", date: "2026-05-18" },
      { label: "Future Idea", date: "2026-05-21" },
    ]);
  });

  it("gives an unknown stage a readable name and drops anything that isn't a date", () => {
    const meta = { forge: { stageDates: { "qa-sign-off": "2026-06-01T09:00:00Z", triage: "soon", constructor: "2026-06-02" } } };
    expect(stageHistoryOf(meta)).toEqual([
      { label: "Qa Sign Off", date: "2026-06-01" },
      { label: "Constructor", date: "2026-06-02" },
    ]);
  });

  it("is empty for a card that didn't come from the planning tool", () => {
    expect(stageHistoryOf(null)).toEqual([]);
    expect(stageHistoryOf({ createdByClient: { name: "Luke" } })).toEqual([]);
    expect(stageHistoryOf({ forge: { stageDates: ["2026-05-18"] } })).toEqual([]);
  });
});
