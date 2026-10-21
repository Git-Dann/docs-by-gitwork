import { describe, expect, it } from "vitest";
import { clientVisibleSections } from "@/lib/wiki-client-visibility";

/**
 * The client's copy of a wiki carries the list of sections they can see.
 *
 * ⚠️ It exists because a second reader — the iOS app — reimplemented
 * `clientVisibleSections` by hand and drifted from it: a different order, and two
 * predicates that disagreed (`metrics` without its `source` check, `estimates`
 * without `isPlannable`). A client was shown a different set of sections depending
 * on whether they opened the app or the web.
 *
 * These cover the property that makes the field trustworthy: it is computed from
 * the TRIMMED copy, so it can never name a section whose content `forPublic` has
 * just removed.
 */

type AnyWiki = Parameters<typeof clientVisibleSections>[0];

/** A wiki with nothing switched on, as the builder would produce it. */
function bare(): AnyWiki {
  return {
    clientSlug: "northwind",
    hiddenSections: [],
    pages: [],
    changelog: [],
    blockers: [],
    intakeEnabled: false,
    deliveryEnabled: false,
    roundupEnabled: false,
    designSystem: null,
    timeline: { blocks: [], milestones: [] },
    monitors: { enabled: false, monitors: [] },
    documents: { enabled: false, documents: [] },
    launchpad: { enabled: false, assigned: false },
    insights: { enabled: false, boards: [] },
    costs: { enabled: false, items: [] },
    estimates: { enabled: false, estimates: [] },
    comparisons: { enabled: false, comparisons: [] },
    sheets: { enabled: false, sheets: [] },
    support: { enabled: false, linked: false },
    metrics: { enabled: false, source: null, metrics: [] },
    meetings: { enabled: false, meetings: [] },
    clientPlatforms: { enabled: false, platforms: [] },
    codeHandover: { enabled: false, modules: [] },
  } as unknown as AnyWiki;
}

describe("clientVisibleSections", () => {
  it("always offers the dashboard, even on a wiki with nothing in it", () => {
    expect(clientVisibleSections(bare())).toEqual(["dashboard"]);
  });

  /**
   * ⚠️ THE PROPERTY THE FIELD RESTS ON. `forPublic` trims the client's copy —
   * hidden metrics removed, unpublishable comparisons dropped, sheets emptied while
   * the section is off — and the predicates below read exactly those arrays. Computed
   * before the trim, the list would name a section whose content had just gone, which
   * is the blank page the predicates exist to prevent.
   */
  it("drops a section once its content has been trimmed away", () => {
    const withContent = {
      ...bare(),
      metrics: { enabled: true, source: "api", metrics: [{ key: "m", label: "M", value: 1 }] },
      comparisons: {
        enabled: true,
        comparisons: [{ id: "c", title: "T", columns: [{ id: "a", title: "A" }], rows: [{ id: "r", kind: "row", label: "L", cells: {} }] }],
      },
      sheets: { enabled: true, sheets: [{ id: "s", title: "S", columns: [{ id: "c1", title: "C" }], rows: [] }] },
    } as unknown as AnyWiki;
    const before = clientVisibleSections(withContent);
    expect(before).toContain("metrics");
    expect(before).toContain("comparisons");
    expect(before).toContain("sheets");

    // What `forPublic` leaves behind when every one of those is withheld.
    const trimmed = {
      ...withContent,
      metrics: { enabled: true, source: null, metrics: [] },
      comparisons: { enabled: false, comparisons: [] },
      sheets: { enabled: false, sheets: [] },
    } as unknown as AnyWiki;
    const after = clientVisibleSections(trimmed);
    expect(after).not.toContain("metrics");
    expect(after).not.toContain("comparisons");
    expect(after).not.toContain("sheets");
  });

  /**
   * ⚠️ `metrics` needs its SOURCE as well as a figure — one of the two predicates
   * the app had got wrong. Without a source there is nothing behind the numbers.
   */
  it("needs a metrics source, not just a figure", () => {
    const noSource = {
      ...bare(),
      metrics: { enabled: true, source: null, metrics: [{ key: "m", label: "M", value: 1 }] },
    } as unknown as AnyWiki;
    expect(clientVisibleSections(noSource)).not.toContain("metrics");
  });

  /** A section the operator hid from the client stays hidden. */
  it("honours hiddenSections for doc pages", () => {
    const wiki = {
      ...bare(),
      hiddenSections: ["api-docs"],
      pages: [{ id: "p", type: "API_DOCS", title: "API" }],
    } as unknown as AnyWiki;
    expect(clientVisibleSections(wiki)).not.toContain("api-docs");
  });

  /**
   * ⚠️ Golf Data is an internal console and never appears in a client's list, even
   * for the client whose pipeline it is.
   */
  it("never offers the internal Golf Data console to a client", () => {
    const wedge = { ...bare(), clientSlug: "wedge" } as unknown as AnyWiki;
    const sections = clientVisibleSections(wedge);
    expect(sections).toContain("course-requests");
    expect(sections).not.toContain("golf-data");
  });
});
