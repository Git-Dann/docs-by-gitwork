import { describe, expect, it } from "vitest";
import { coverContentsEnabled, coverContentsEntries } from "@/lib/sections/cover-contents";
import type { ProposalSection } from "@/types/proposal";

const section = (over: Partial<ProposalSection>): ProposalSection =>
  ({
    key: "prose",
    title: "A block",
    sortOrder: 0,
    isVisible: true,
    data: {},
    ...over,
  }) as ProposalSection;

describe("what goes in the contents list", () => {
  it("lists the reader-facing blocks in document order, numbered from 1", () => {
    expect(
      coverContentsEntries([
        section({ key: "cover", title: "Cover" }),
        section({ key: "prose", title: "What we heard" }),
        section({ key: "timeline", title: "Timeline" }),
      ]),
    ).toEqual([
      { number: 1, title: "What we heard" },
      { number: 2, title: "Timeline" },
    ]);
  });

  it("never lists the cover itself", () => {
    // A contents list that lists itself is a bug, and an obvious one on a client's front page.
    const titles = coverContentsEntries([
      section({ key: "cover", title: "Cover" }),
      section({ key: "prose", title: "Scope" }),
    ]).map((entry) => entry.title);

    expect(titles).not.toContain("Cover");
  });

  it("drops furniture — the divider, in all its variants", () => {
    // A rule, a spacer and a page break are all the ONE `divider` block, so excluding that key
    // covers all three. It carries a title so a builder can find it in the outline; a reader
    // scanning "what is in this document" is not looking for "Divider".
    expect(
      coverContentsEntries([
        section({ key: "prose", title: "Scope" }),
        section({ key: "divider", title: "Divider" }),
        section({ key: "divider", title: "Page break" }),
        section({ key: "costing", title: "Investment" }),
      ]).map((entry) => entry.title),
    ).toEqual(["Scope", "Investment"]);
  });

  it("drops a hidden block, and RENUMBERS rather than leaving a gap", () => {
    // ⚠️ The renumbering is the point. A list running 01, 02, 04 reads as a missing page to
    // anyone who did not author the document — which is exactly who a cover is for.
    expect(
      coverContentsEntries([
        section({ key: "prose", title: "One" }),
        section({ key: "prose", title: "Two" }),
        section({ key: "prose", title: "Hidden", isVisible: false }),
        section({ key: "prose", title: "Four" }),
      ]),
    ).toEqual([
      { number: 1, title: "One" },
      { number: 2, title: "Two" },
      { number: 3, title: "Four" },
    ]);
  });

  it("skips an untitled block rather than printing a placeholder", () => {
    // "Untitled" on a client's cover is worse than the block simply not being listed.
    expect(
      coverContentsEntries([
        section({ key: "prose", title: "  " }),
        section({ key: "prose", title: "Real" }),
      ]),
    ).toEqual([{ number: 1, title: "Real" }]);
  });

  it("follows the document, so a rename is reflected with no second write", () => {
    // This is the property the whole module exists for: nothing is stored, so nothing can go
    // stale. Renaming a block renames its contents entry, with no save and no sync step.
    const before = [section({ key: "prose", title: "Old name" })];
    const after = [section({ key: "prose", title: "New name" })];

    expect(coverContentsEntries(before)[0].title).toBe("Old name");
    expect(coverContentsEntries(after)[0].title).toBe("New name");
  });
});

describe("when it is shown", () => {
  it("defaults on for a proposal and off for everything else", () => {
    // A proposal is read front to back and wants navigating. A one-page NDA listing its own
    // clauses on the front is noise.
    expect(coverContentsEnabled(undefined, "PROPOSAL")).toBe(true);
    for (const type of ["NDA", "CO", "SLA", "MSA", "OTHER", undefined]) {
      expect(coverContentsEnabled(undefined, type), `${type} should default off`).toBe(false);
    }
  });

  it("an explicit choice always wins over the default", () => {
    // Turning it off on a proposal has to stick, or the author fights the default every save.
    expect(coverContentsEnabled(false, "PROPOSAL")).toBe(false);
    expect(coverContentsEnabled(true, "NDA")).toBe(true);
  });
});
