import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Adding a Wiki section touches TWELVE parallel allow-lists, and missing one makes
 * the section silently 400, vanish on refresh, or 500 on an exhaustive lookup.
 *
 * Four of the twelve are exhaustive `Record<WikiSection, …>` maps, so `tsc` catches
 * those on its own — and it did, finding two lists (`wiki-dashboard`'s SECTION_META
 * and `wiki-mobile-nav`'s SECTION_ICON) that were not in the original plan's count.
 *
 * The other eight are plain string arrays and object literals with no exhaustiveness
 * checking whatsoever. Those are what this test covers. It reads source rather than
 * importing, because most of these live in `"use client"` components whose imports
 * (`@heroicons`, `createPortal`) pull a React tree into a node test for no benefit —
 * and the thing being asserted is literally "is this string present in this file".
 */

const ROOT = join(process.cwd(), "src");

function read(relative: string): string {
  return readFileSync(join(ROOT, relative), "utf8");
}

/** The eight lists `tsc` cannot see. */
const UNCHECKED_LISTS: Array<{ file: string; needle: string; why: string }> = [
  {
    file: "server/wiki.ts",
    needle: '"launchpad",',
    why: "SHAREABLE_SECTIONS — without it setWikiSectionShare throws 'not shareable'",
  },
  {
    file: "components/clients/wiki/wiki-sidebar.tsx",
    needle: '| "launchpad"',
    why: "the WikiSection union itself",
  },
  {
    file: "components/clients/wiki/wiki-sidebar.tsx",
    needle: 'navItem("launchpad"',
    why: "the nav row — without it the section is unreachable",
  },
  {
    file: "components/clients/wiki/wiki-access-settings.tsx",
    needle: 'launchpad: "Launchpad"',
    why: "SHARE_SECTION_LABELS — the share toggle is filtered out without a label",
  },
  {
    file: "app/wiki/[slug]/[token]/page.tsx",
    needle: 'launchpad: "Launchpad"',
    why: "SECTION_LABELS — a per-section share link would title itself 'Wiki'",
  },
  {
    file: "components/clients/wiki/wiki-workspace.tsx",
    needle: '"launchpad",',
    why: "ALL_WIKI_SECTIONS — a refresh on #launchpad silently bounces to the dashboard",
  },
  {
    file: "components/clients/wiki/wiki-workspace.tsx",
    needle: 'launchpad: "LAUNCHPAD"',
    why: "SECTION_WIDGET_LABELS",
  },
  {
    file: "components/clients/wiki/wiki-public-view.tsx",
    needle: '"launchpad"',
    why: "the public availableSections + render dispatch",
  },
];

describe("the Launchpad wiki section is wired into every list tsc cannot check", () => {
  it.each(UNCHECKED_LISTS)("$file — $why", ({ file, needle }) => {
    expect(read(file)).toContain(needle);
  });
});

describe("the internal workspace can both add and remove it", () => {
  const workspace = read("components/clients/wiki/wiki-workspace.tsx");

  it("offers it under + ADD NEW when it is off", () => {
    // Without this the operator can never switch it on from the wiki UI — the exact
    // unreachable state §40.1's Requests defect produced.
    expect(workspace).toContain('label: "Launchpad"');
  });

  it("handles it in handleAddSection and handleDeletePage", () => {
    const adds = workspace.match(/if \(section === "launchpad"\)/g) ?? [];
    expect(adds.length).toBeGreaterThanOrEqual(2);
  });

  it("allows it past the confirmDeletePage guard", () => {
    // That guard early-returns for any section it does not name, so a missing entry
    // makes the delete button silently do nothing.
    expect(workspace).toContain('section !== "launchpad"');
  });
});

describe("the public view will not show an empty Launchpad", () => {
  it("requires enabled AND assigned before listing the section", () => {
    // An enabled-but-unassigned kit would land the client on a blank page, which
    // reads as a broken link rather than as work we have not set up yet.
    const publicView = read("components/clients/wiki/wiki-public-view.tsx");
    expect(publicView).toContain("wiki.launchpad?.enabled && wiki.launchpad.assigned");
  });
});

describe("the client-facing routes exist at the paths the fetchers call", () => {
  // A 404 here is invisible to tsc: `apiFetch` builds its URL from a template string,
  // so a route that was never created fails only at runtime, for the client.
  const ROUTES = [
    "app/api/wiki/[token]/launchpad/route.ts",
    "app/api/wiki/[token]/launchpad/items/[itemId]/route.ts",
    "app/api/wiki/[token]/launchpad/docs/[docKey]/route.ts",
    "app/api/clients/[slug]/wiki/launchpad/route.ts",
    "app/api/clients/[slug]/wiki/launchpad/modules/route.ts",
    "app/api/clients/[slug]/wiki/launchpad/answers/route.ts",
    "app/api/clients/[slug]/wiki/launchpad/items/[itemId]/route.ts",
    "app/api/clients/[slug]/wiki/launchpad/docs/[docKey]/route.ts",
    "app/api/launchpad-templates/route.ts",
    "app/api/launchpad-templates/[id]/route.ts",
    "app/api/launchpad-templates/[id]/duplicate/route.ts",
  ];

  it.each(ROUTES)("%s", (route) => {
    expect(() => read(route)).not.toThrow();
  });

  it("gates every INTERNAL route on canManageClients", () => {
    for (const route of ROUTES.filter((r) => !r.includes("[token]"))) {
      expect(read(route), route).toContain("canManageClients");
    }
  });

  it("gates every CLIENT-FACING write on the wiki-access cookie", () => {
    // `resolveLaunchpadWriter` is the only thing standing between a share link and an
    // anonymous write. The GET is deliberately token-only, so it is excluded.
    for (const route of ROUTES.filter((r) => r.includes("[token]"))) {
      const source = read(route);
      const hasWrite = /export async function (PATCH|POST|DELETE)/.test(source);
      if (hasWrite) expect(source, route).toContain("resolveLaunchpadWriter");
    }
  });
});
