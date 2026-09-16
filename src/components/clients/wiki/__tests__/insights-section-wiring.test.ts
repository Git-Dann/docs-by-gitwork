import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Adding a client-wiki section touches TWELVE parallel allow-lists. Miss one and the
 * section silently 400s, vanishes on refresh, or its delete button does nothing —
 * none of which is a compile error.
 *
 * Four are exhaustive `Record<WikiSection, …>` maps (`SECTION_ICON`, `SECTION_META`,
 * both `SECTION_TITLES`), so `tsc` catches those on its own. The other eight are plain
 * string arrays, object literals and `if` branches with no exhaustiveness checking
 * whatsoever, and those are what this test exists for. It asserts all twelve anyway:
 * the tsc-checked four are cheap to pin and a map can be widened to `Partial<…>` by a
 * future change without anyone noticing the guard went away.
 *
 * Sibling of `launchpad-section-wiring.test.ts` — same section, same twelve lists, same
 * reasoning. Read that one too when adding a thirteenth list.
 *
 * It reads source rather than importing, because most of these live in `"use client"`
 * components whose imports pull a React tree into a node test for no benefit — and the
 * thing being asserted is literally "is this entry present in this list".
 */

const ROOT = join(process.cwd(), "src");

function read(relative: string): string {
  return readFileSync(join(ROOT, relative), "utf8");
}

/**
 * Slice one declaration out of a file, from `marker` to the line-leading `]` or `}`
 * that closes it.
 *
 * Needed wherever a bare `toContain` would not discriminate: `"insights",` is a
 * substring of the sidebar's `navItem("insights", "Insights", …)` line, so asserting
 * it against the whole file would pass with the list entry deleted.
 *
 * The terminator has to be line-leading. Stopping at the first `]` instead cuts
 * `WikiSection[] = [` in half at its own type annotation and yields an empty block —
 * which then fails every assertion regardless of what the list actually contains.
 */
function declBlock(source: string, marker: string): string {
  const start = source.indexOf(marker);
  expect(start, `declaration not found: ${marker}`).toBeGreaterThan(-1);
  const rest = source.slice(start + marker.length);
  const close = /\n[ \t]*[\]}]/.exec(rest);
  expect(close, `unterminated declaration: ${marker}`).not.toBeNull();
  return marker + rest.slice(0, close!.index);
}

describe("wiki-sidebar.tsx — the union, the nav row, and the default section set", () => {
  const sidebar = read("components/clients/wiki/wiki-sidebar.tsx");

  it("declares `insights` in the WikiSection union", () => {
    expect(sidebar).toContain('| "insights"');
  });

  it("renders a nav row for it — without one the section is unreachable", () => {
    expect(sidebar).toContain('navItem("insights", "Insights"');
  });

  it("includes it in the default visibleSections fallback", () => {
    // That fallback is what a caller passing no `availableSections` gets. Omitted here,
    // the nav row above renders and then is filtered straight back out again.
    expect(declBlock(sidebar, "const visibleSections = new Set<WikiSection>(")).toContain(
      '"insights",',
    );
  });
});

describe("the exhaustive Record<WikiSection, …> maps carry it", () => {
  it("wiki-mobile-nav.tsx — SECTION_ICON, so the mobile nav can draw the row", () => {
    const mobileNav = read("components/clients/wiki/wiki-mobile-nav.tsx");
    expect(declBlock(mobileNav, "const SECTION_ICON")).toContain("insights:");
  });

  it("wiki-dashboard.tsx — SECTION_META, the dashboard card's label and icon", () => {
    const dashboard = read("components/clients/wiki/wiki-dashboard.tsx");
    expect(declBlock(dashboard, "const SECTION_META")).toContain("insights:");
  });

  it("wiki-workspace.tsx — SECTION_TITLES, the internal page heading", () => {
    const workspace = read("components/clients/wiki/wiki-workspace.tsx");
    expect(declBlock(workspace, "const SECTION_TITLES")).toContain('insights: "Insights"');
  });

  it("wiki-public-view.tsx — SECTION_TITLES, the client-facing page heading", () => {
    const publicView = read("components/clients/wiki/wiki-public-view.tsx");
    expect(declBlock(publicView, "const SECTION_TITLES")).toContain('insights: "Insights"');
  });
});

describe("wiki-dashboard.tsx — the card says something true about Insights", () => {
  it("has a real `case \"insights\"` in the widgetBody switch", () => {
    // A section with no case falls through to the markdown-doc default and the card
    // reads "Documentation." — a defect that has actually shipped here (§40.1), and one
    // tsc cannot see because the switch has a legitimate default.
    expect(read("components/clients/wiki/wiki-dashboard.tsx")).toContain('case "insights":');
  });
});

describe("the share lists carry it", () => {
  it("server/wiki.ts — SHAREABLE_SECTIONS, else setWikiSectionShare throws 'not shareable'", () => {
    expect(declBlock(read("server/wiki.ts"), "const SHAREABLE_SECTIONS = [")).toContain(
      '"insights",',
    );
  });

  it("wiki-access-settings.tsx — SHARE_SECTION_LABELS, else the toggle is filtered out", () => {
    expect(read("components/clients/wiki/wiki-access-settings.tsx")).toContain(
      'insights: "Insights"',
    );
  });

  it("the public share page — SECTION_LABELS, else the link titles itself 'Wiki'", () => {
    expect(read("app/wiki/[slug]/[token]/page.tsx")).toContain('insights: "Insights"');
  });
});

describe("wiki-workspace.tsx — the operator can reach it, add it and remove it", () => {
  const workspace = read("components/clients/wiki/wiki-workspace.tsx");

  it("is in SECTION_WIDGET_LABELS", () => {
    expect(declBlock(workspace, "const SECTION_WIDGET_LABELS")).toContain('insights: "INSIGHTS"');
  });

  it("is in ALL_WIKI_SECTIONS — else a refresh on #insights bounces to the dashboard", () => {
    // That list is what validates a section restored from the URL hash, so a missing
    // entry loses the operator's place on every reload and on every shared deep link.
    expect(declBlock(workspace, "const ALL_WIKI_SECTIONS")).toContain('"insights",');
  });

  it("is offered under + ADD NEW when it is off", () => {
    // Without this the operator can never switch it on from the wiki UI — the exact
    // unreachable state §40.1's Requests defect produced.
    expect(workspace).toContain('{ section: "insights" as WikiSection, label: "Insights" }');
  });

  it("is handled in BOTH handleAddSection and handleDeletePage", () => {
    const branches = workspace.match(/if \(section === "insights"\)/g) ?? [];
    expect(branches.length).toBeGreaterThanOrEqual(2);
  });

  it("gets past the confirmDeletePage guard", () => {
    // That guard early-returns for any section it does not name, so a missing entry
    // makes the delete button silently do nothing at all.
    expect(workspace).toContain('section !== "insights"');
  });

  it("is in deletableSections — else the delete control never renders", () => {
    expect(workspace).toContain('s === "insights"');
  });
});

describe("wiki-public-view.tsx — the client-facing side", () => {
  const publicView = read("components/clients/wiki/wiki-public-view.tsx");

  it("requires enabled AND at least one board before listing the section", () => {
    // An enabled-but-empty section lands the client on a blank page, which reads as a
    // broken link rather than as work we have not set up yet. Enabled alone is not
    // enough, so the `boards.length` half of this predicate is the load-bearing part.
    const available = declBlock(publicView, "const availableSections");
    expect(available).toContain("wiki.insights.boards.length");
    expect(available).toContain("wiki.insights.enabled");
  });

  it("dispatches a render for it", () => {
    expect(publicView).toContain('activeSection === "insights"');
  });
});

describe("there is no client-facing write route, and there must not be one", () => {
  it("has no app/api/wiki/[token]/insights directory", () => {
    // The client side of Insights is READ-ONLY: boards ride down inside the wiki DTO
    // that `/api/wiki/[token]` already returns, so a token route here would be dead
    // surface with a live attack surface. If a future change needs one, it needs the
    // full `resolvePublicWiki` → cookie → belongs → rate-limit posture first, not a
    // quiet `route.ts`.
    expect(existsSync(join(ROOT, "app/api/wiki/[token]/insights"))).toBe(false);
  });
});
