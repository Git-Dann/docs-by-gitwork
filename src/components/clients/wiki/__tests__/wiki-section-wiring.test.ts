import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
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
 * This covers the sections listed in SECTIONS below — `insights`, `costs`, `estimates`,
 * `delivery`, `support`, `roundup`, `metrics`, `meetings`, `platforms` and `comparisons` — which share the
 * same twelve lists. The shape-identical lists are parameterised over all three; the
 * places the three genuinely differ (each one's public `availableSections` predicate,
 * and Delivery having no server loader at all) get their own assertions at the bottom.
 *
 * Sibling of `launchpad-section-wiring.test.ts` — same twelve lists, same reasoning.
 * Read that one too when adding a thirteenth list.
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
 * substring of the sidebar's `navItem("insights", "Charts", …)` line, so asserting
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

const SECTIONS = [
  { id: "insights", label: "Charts" },
  { id: "roundup", label: "RoundUp" },
  { id: "costs", label: "Running costs" },
  { id: "estimates", label: "Estimates" },
  { id: "delivery", label: "Delivery" },
  { id: "support", label: "Support" },
  { id: "metrics", label: "Metrics" },
  { id: "meetings", label: "Meetings" },
  { id: "platforms", label: "Platforms" },
  { id: "comparisons", label: "Comparisons" },
  { id: "sheets", label: "Sheets" },
] as const;

/** Sections the CLIENT can write to — they have a token route, under the hardened posture. */
const CLIENT_WRITABLE = new Set<string>(["sheets"]);

describe.each(SECTIONS)("$label — the twelve parallel allow-lists", ({ id, label }) => {
  const sidebar = read("components/clients/wiki/wiki-sidebar.tsx");
  const mobileNav = read("components/clients/wiki/wiki-mobile-nav.tsx");
  const dashboard = read("components/clients/wiki/wiki-dashboard.tsx");
  const workspace = read("components/clients/wiki/wiki-workspace.tsx");
  const publicView = read("components/clients/wiki/wiki-public-view.tsx");

  it("is declared in the WikiSection union", () => {
    expect(sidebar).toContain(`| "${id}"`);
  });

  it("has a sidebar nav row — without one the section is unreachable", () => {
    expect(sidebar).toContain(`navItem("${id}", "${label}"`);
  });

  it("is in the sidebar's default visibleSections fallback", () => {
    // That fallback is what a caller passing no `availableSections` gets. Omitted here,
    // the nav row above renders and then is filtered straight back out again.
    expect(declBlock(sidebar, "const visibleSections = new Set<WikiSection>(")).toContain(
      `"${id}",`,
    );
  });

  it("is in wiki-mobile-nav's SECTION_ICON, so the mobile nav can draw the row", () => {
    expect(declBlock(mobileNav, "const SECTION_ICON")).toContain(`${id}:`);
  });

  it("is in wiki-dashboard's SECTION_META — the dashboard card's label and icon", () => {
    expect(declBlock(dashboard, "const SECTION_META")).toContain(`${id}:`);
  });

  it("is in wiki-workspace's SECTION_TITLES — the internal page heading", () => {
    expect(declBlock(workspace, "const SECTION_TITLES")).toContain(`${id}: "${label}"`);
  });

  it("is in wiki-public-view's SECTION_TITLES — the client-facing page heading", () => {
    expect(declBlock(publicView, "const SECTION_TITLES")).toContain(`${id}: "${label}"`);
  });

  it("is in SHAREABLE_SECTIONS, else setWikiSectionShare throws 'not shareable'", () => {
    expect(declBlock(read("server/wiki.ts"), "const SHAREABLE_SECTIONS = [")).toContain(`"${id}",`);
  });

  it("is in SHARE_SECTION_LABELS, else the share toggle is filtered out of Access", () => {
    expect(
      declBlock(
        read("components/clients/wiki/wiki-access-settings.tsx"),
        "const SHARE_SECTION_LABELS",
      ),
    ).toContain(`${id}: "${label}"`);
  });

  it("is in the public share page's SECTION_LABELS, else the link titles itself 'Wiki'", () => {
    expect(declBlock(read("app/wiki/[slug]/[token]/page.tsx"), "const SECTION_LABELS")).toContain(
      `${id}: "${label}"`,
    );
  });

  it("is in SECTION_WIDGET_LABELS", () => {
    expect(declBlock(workspace, "const SECTION_WIDGET_LABELS")).toContain(
      `${id}: "${label.toUpperCase()}"`,
    );
  });

  it("is in ALL_WIKI_SECTIONS — else a refresh on the hash bounces to the dashboard", () => {
    // That list is what validates a section restored from the URL hash, so a missing
    // entry loses the operator's place on every reload and on every shared deep link.
    expect(declBlock(workspace, "const ALL_WIKI_SECTIONS")).toContain(`"${id}",`);
  });

  it("is offered under + ADD NEW when it is off", () => {
    // Without this the operator can never switch it on from the wiki UI — the exact
    // unreachable state §40.1's Requests defect produced.
    expect(workspace).toContain(`{ section: "${id}" as WikiSection, label: "${label}" }`);
  });

  it("is handled in BOTH handleAddSection and handleDeletePage", () => {
    const branches = workspace.match(new RegExp(`if \\(section === "${id}"\\)`, "g")) ?? [];
    expect(branches.length).toBeGreaterThanOrEqual(2);
  });

  it("gets past the confirmDeletePage guard", () => {
    // That guard early-returns for any section it does not name, so a missing entry
    // makes the delete button silently do nothing at all.
    expect(workspace).toContain(`section !== "${id}"`);
  });

  it("is in deletableSections — else the delete control never renders", () => {
    expect(workspace).toContain(`s === "${id}"`);
  });

  it("is dispatched for render in the client-facing view", () => {
    expect(publicView).toContain(`activeSection === "${id}"`);
  });
});

describe("wiki-dashboard.tsx — the card says something true about each section", () => {
  const dashboard = read("components/clients/wiki/wiki-dashboard.tsx");

  // A section with no case falls through to the markdown-doc default and the card
  // reads "Documentation." — a defect that has actually shipped here (§40.1), and one
  // tsc cannot see because the switch has a legitimate default.
  it.each(SECTIONS)("$label has a real `case` in the widgetBody switch", ({ id }) => {
    expect(dashboard).toContain(`case "${id}":`);
  });
});

describe("wiki-public-view.tsx — each availableSections predicate has its OWN second condition", () => {
  // All three are gated on more than their enabled flag, and each one's second half is
  // the load-bearing part: enabled-alone would land a client on a page that reads as a
  // broken link. They are asserted separately because the conditions genuinely differ —
  // parameterising them would only pin the flag they share.
  const available = declBlock(
    read("components/clients/wiki/wiki-public-view.tsx"),
    "const availableSections",
  );

  it("costs — enabled AND at least one priced line", () => {
    // Enabled-and-empty would state a cost per user of £0.00 — a confident figure
    // derived from nothing, which is worse than the blank page it would replace.
    expect(available).toContain("wiki.costs.enabled");
    expect(available).toContain("wiki.costs.items.length");
  });

  it("estimates — enabled AND an estimate with effort in it", () => {
    // Enabled-and-empty would promise a timeline and show none, and "0 weeks" stated
    // for an estimate nobody has filled in is worse than the blank page it replaces.
    expect(available).toContain("wiki.estimates.enabled");
    expect(available).toContain("wiki.estimates.estimates.some(isPlannable)");
  });

  it("roundup — enabled AND a timeline to summarise", () => {
    // Enabled-and-empty would land a client on "nothing to report", which reads as a
    // broken link rather than as work that has not started.
    expect(available).toContain("wiki.roundupEnabled");
    expect(available).toContain("wiki.timeline.blocks.length");
  });

  it("insights — enabled AND at least one board", () => {
    expect(available).toContain("wiki.insights.enabled");
    expect(available).toContain("wiki.insights.boards.length");
  });

  it("delivery — enabled AND a timeline to describe", () => {
    // A client following a link that promised progress must not land on "no plan yet".
    expect(available).toContain("wiki.deliveryEnabled");
    expect(available).toContain("wiki.timeline.blocks.length");
  });

  it("metrics — enabled, connected, AND at least one metric the client may see", () => {
    // `wiki.metrics.metrics` is the client's copy, hidden ones already removed server-side,
    // so "at least one" means at least one they are allowed to see.
    expect(available).toContain("wiki.metrics.enabled");
    expect(available).toContain("wiki.metrics.source");
    expect(available).toContain("wiki.metrics.metrics.length > 0");
  });

  it("meetings — enabled AND at least one SHARED meeting", () => {
    // Enabling shares nothing; a client must not land on an empty page that reads as
    // "we have not talked to you".
    expect(available).toContain("wiki.meetings.enabled");
    expect(available).toContain("wiki.meetings.meetings.length > 0");
  });

  it("comparisons — enabled AND a table with columns and a feature row", () => {
    // Enabled-and-empty would promise a comparison and land the client on a blank grid.
    expect(available).toContain("wiki.comparisons.enabled");
    expect(available).toContain("wiki.comparisons.comparisons.some(isPublishableComparison)");
  });

  it("sheets — enabled AND a sheet with at least one column", () => {
    // Enabled-and-empty would invite the client to edit a grid with nothing in it.
    expect(available).toContain("wiki.sheets.enabled");
    expect(available).toContain("wiki.sheets.sheets.some((s) => s.columns.length > 0)");
  });

  it("platforms — enabled AND at least one platform", () => {
    expect(available).toContain("wiki.clientPlatforms.enabled");
    expect(available).toContain("wiki.clientPlatforms.platforms.length > 0");
  });

  it("support — enabled AND a LINKED Care record, not merely the flag", () => {
    // An unlinked section shows "not connected", which is our problem to fix, not
    // theirs to read.
    expect(available).toContain("wiki.support.enabled");
    expect(available).toContain("wiki.support.linked");
  });
});

describe("there is no client-facing write route, and there must not be one", () => {
  it("has no app/api/wiki/[token]/ directory for any of the three", () => {
    // All three are READ-ONLY for the client: boards and figures ride down inside the
    // wiki DTO that `/api/wiki/[token]` already returns, so a token route here would be
    // dead surface with a live attack surface. If a future change needs one, it needs
    // the full `resolvePublicWiki` → cookie → belongs → rate-limit posture first, not a
    // quiet `route.ts`.
    for (const { id } of SECTIONS) {
      if (CLIENT_WRITABLE.has(id)) continue;
      expect(existsSync(join(ROOT, `app/api/wiki/[token]/${id}`)), `${id} route exists`).toBe(
        false,
      );
    }
  });
});

describe("delivery has no server loader and no DTO object of its own", () => {
  it("server/wiki.ts exposes `deliveryEnabled: boolean` on the DTO", () => {
    // Delivery is pure presentation over `wiki.timeline` and `wiki.blockers`, both of
    // which the DTO already carries — so the only thing the section needs from the
    // server is the on/off flag.
    expect(read("server/wiki.ts")).toContain("deliveryEnabled: boolean;");
  });

  it("there is no loadWikiDelivery anywhere in src/server", () => {
    // A loader here would be a second copy of data the DTO already carries, and two
    // copies of a timeline can disagree — which is exactly what the client would read.
    const hits = grepServer("loadWikiDelivery");
    expect(hits, `loadWikiDelivery found in: ${hits.join(", ")}`).toEqual([]);
  });
});

/** Files under `src/server` whose text contains `needle`. */
function grepServer(needle: string): string[] {
  const dir = join(ROOT, "server");
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((rel) => /\.tsx?$/.test(rel))
    .filter((rel) => readFileSync(join(dir, rel), "utf8").includes(needle));
}

describe("comparisons — the client's copy carries no drafts", () => {
  it("forPublic strips every table while the section is off, and unpublishable ones while on", () => {
    // A table drafted with the section off, or one with no columns or features yet, is
    // Gitwork's work in progress; the public view filters too, but the DTO must not even
    // carry it to the browser.
    const wiki = read("server/wiki.ts");
    const fn = wiki.slice(wiki.indexOf("function forPublic("), wiki.indexOf("export async function resolvePublicWiki"));
    expect(fn).toContain("dto.comparisons.enabled");
    expect(fn).toContain("filter(isPublishableComparison)");
    expect(fn).toContain("{ enabled: false, comparisons: [] }");
  });

  it("the section is loaded through settle(), so one bad table cannot take the wiki down (§50.2)", () => {
    expect(read("server/wiki.ts")).toContain(
      'settle("comparisons", () => loadWikiComparisons(wiki.clientId), EMPTY_COMPARISONS)',
    );
  });
});

describe("sheets — the one section the client writes to, and how", () => {
  // Unlike every other section above, a client edits Sheets, so it DOES have a token route —
  // and that route must carry the full hardened posture, not a quiet `route.ts`.
  const routes = [
    "app/api/wiki/[token]/sheets/[sheetId]/rows/route.ts",
    "app/api/wiki/[token]/sheets/[sheetId]/rows/[rowId]/route.ts",
  ];

  it.each(routes)("%s exists and resolves the writer + rate-limits before any write", (rel) => {
    const src = read(rel);
    expect(src).toContain("resolveSheetsWriter(req, token)");
    expect(src).toContain("assertSheetsWriteRate(req)");
    // The resolve and the rate limit come before the body is even parsed.
    expect(src.indexOf("resolveSheetsWriter(")).toBeLessThan(src.indexOf("await req.json()"));
    expect(src.indexOf("assertSheetsWriteRate(")).toBeLessThan(src.indexOf("await req.json()"));
  });

  it("there is no client route for structure (columns or sheets)", () => {
    expect(existsSync(join(ROOT, "app/api/wiki/[token]/sheets/[sheetId]/columns"))).toBe(false);
    expect(existsSync(join(ROOT, "app/api/wiki/[token]/sheets/route.ts"))).toBe(false);
    expect(existsSync(join(ROOT, "app/api/wiki/[token]/sheets/[sheetId]/route.ts"))).toBe(false);
  });

  it("the writer resolver checks the cookie, the section flag and the share link's section", () => {
    const src = read("server/wiki-sheets-access.ts");
    expect(src).toContain("resolvePublicWiki(token)");
    expect(src).toContain("resolveWikiAccessUser(wiki.id, cookieValue)");
    expect(src).toContain("sheetsEnabled");
    expect(src).toContain('onlySection !== "sheets"');
  });

  it("the client's copy is cut down by forPublicSheets, and the section loads through settle()", () => {
    const wiki = read("server/wiki.ts");
    const fn = wiki.slice(wiki.indexOf("function forPublic("), wiki.indexOf("export async function resolvePublicWiki"));
    expect(fn).toContain("sheets: forPublicSheets(dto.sheets)");
    expect(wiki).toContain('settle("sheets", () => loadWikiSheets(wiki.clientId), EMPTY_SHEETS)');
  });

  it("the internal routes all go through resolveInternalSheets (Manage clients + client access)", () => {
    const dir = join(ROOT, "app/api/clients/[slug]/wiki/sheets");
    const files = readdirSync(dir, { recursive: true, encoding: "utf8" }).filter((f) => f.endsWith("route.ts"));
    expect(files.length).toBeGreaterThanOrEqual(6);
    for (const f of files) {
      const src = readFileSync(join(dir, f), "utf8");
      const handlers = src.match(/export async function (GET|POST|PATCH|PUT|DELETE)/g) ?? [];
      const gates = src.match(/await resolveInternalSheets\(req, slug,/g) ?? [];
      expect(gates.length, `${f}: every handler must resolve the internal writer`).toBe(handlers.length);
    }
    const access = read("server/wiki-sheets-access.ts");
    expect(access).toContain("assertCan(user, canManageClients, action)");
    expect(access).toContain("assertClientAccessBySlug(user, slug)");
  });
});
