import { describe, expect, it } from "vitest";
import { visibleIntakeItems } from "../wiki-intake-section";

/**
 * Dealt-with requests drop out of the Requests list.
 *
 * "Mark dealt with" sets status CLOSED. Until now those rows stayed forever, so
 * the list only ever grew and the outstanding work got harder to see with every
 * item you resolved.
 *
 * The rule is hide-by-default, never delete: the toggle beside the category tabs
 * brings them back, and its label always states how many are hidden.
 */

const item = (id: string, status: string) => ({ id, status });

const MIXED = [
  item("a", "NEW"),
  item("b", "CLOSED"),
  item("c", "TRIAGED"),
  item("d", "CLOSED"),
  item("e", "PROMOTED"),
];

describe("visibleIntakeItems", () => {
  it("hides dealt-with requests by default", () => {
    expect(visibleIntakeItems(MIXED, false).map((i) => i.id)).toEqual(["a", "c", "e"]);
  });

  it("reveals them when the toggle is on", () => {
    expect(visibleIntakeItems(MIXED, true).map((i) => i.id)).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("keeps PROMOTED visible — a request that became a task is still live work", () => {
    // Only CLOSED means dealt with. Promoted work is in flight, not finished.
    expect(visibleIntakeItems([item("p", "PROMOTED")], false)).toHaveLength(1);
  });

  it("never mutates or reorders the input", () => {
    const input = [...MIXED];
    const out = visibleIntakeItems(input, true);
    expect(input).toEqual(MIXED);
    expect(out).not.toBe(input);
    expect(out.map((i) => i.id)).toEqual(input.map((i) => i.id));
  });

  it("hides nothing when nothing is closed", () => {
    const open = [item("a", "NEW"), item("b", "TRIAGED")];
    expect(visibleIntakeItems(open, false)).toHaveLength(2);
  });

  it("hides everything when all are closed — the list is empty, not wrong", () => {
    // The UI shows "Nothing outstanding — N dealt with" for this case rather than
    // "No requests yet", which would read as though the work never existed.
    const allClosed = [item("a", "CLOSED"), item("b", "CLOSED")];
    expect(visibleIntakeItems(allClosed, false)).toEqual([]);
    expect(visibleIntakeItems(allClosed, true)).toHaveLength(2);
  });

  it("copes with an empty list", () => {
    expect(visibleIntakeItems([], false)).toEqual([]);
    expect(visibleIntakeItems([], true)).toEqual([]);
  });
});
