import { describe, expect, it } from "vitest";
import { partitionActiveClients } from "../client-management";

/**
 * Portal's Active fetch feeds two tabs.
 *
 * SUGGESTED is a `source`, not a status, so suggested clients come back inside the ACTIVE
 * list. They used to render mixed into the Active grid, which made the "Active 13" badge a
 * count of two different things — twelve confirmed clients and one suggestion.
 *
 * The rule worth pinning is that the split is by source and nothing else, so the two tab
 * badges always sum to the fetch and never double-count. The count bug this replaced was
 * the opposite shape: `suggestedCount` was derived from the *currently displayed* list, so
 * it read 0 from every tab except Active.
 */

const c = (slug: string, source?: string | null) => ({ slug, source });

describe("partitionActiveClients", () => {
  it("puts SUGGESTED on one side and everything else on the other", () => {
    const { active, suggested } = partitionActiveClients([
      c("ace-grading", "MANUAL"),
      c("northwind-labs", "SUGGESTED"),
      c("wedge", "MANUAL"),
    ]);
    expect(active.map((x) => x.slug)).toEqual(["ace-grading", "wedge"]);
    expect(suggested.map((x) => x.slug)).toEqual(["northwind-labs"]);
  });

  it("treats a missing or null source as a real client, never as a suggestion", () => {
    // Getting this backwards would hide confirmed clients behind a Suggested tab.
    const { active, suggested } = partitionActiveClients([c("no-source"), c("null-source", null)]);
    expect(active).toHaveLength(2);
    expect(suggested).toHaveLength(0);
  });

  it("is exhaustive — the two sides always account for every client", () => {
    const all = [
      c("a", "MANUAL"),
      c("b", "SUGGESTED"),
      c("c"),
      c("d", "IMPORT"),
      c("e", "SUGGESTED"),
    ];
    const { active, suggested } = partitionActiveClients(all);
    expect(active.length + suggested.length).toBe(all.length);
    // No client may appear on both sides.
    const overlap = active.filter((x) => suggested.includes(x));
    expect(overlap).toHaveLength(0);
  });

  it("matches the source exactly, so a lookalike is not swept in", () => {
    const { active, suggested } = partitionActiveClients([
      c("lower", "suggested"),
      c("prefixed", "AUTO_SUGGESTED"),
      c("real", "SUGGESTED"),
    ]);
    expect(suggested.map((x) => x.slug)).toEqual(["real"]);
    expect(active.map((x) => x.slug)).toEqual(["lower", "prefixed"]);
  });

  it("handles an empty list without inventing entries", () => {
    expect(partitionActiveClients([])).toEqual({ active: [], suggested: [] });
  });
});
