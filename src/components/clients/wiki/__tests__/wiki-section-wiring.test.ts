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
  { id: "board", label: "Board" },
] as const;

/** Sections the CLIENT can write to — they have a token route, under the hardened posture. */
const CLIENT_WRITABLE = new Set<string>(["board"]);

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

// The rule moved out of wiki-public-view.tsx into a shared module (Oct 2026) so the internal
// wiki can mark what the client can't see with the SAME predicates. The share page calls it.
describe("wiki-client-visibility.ts — each availableSections predicate has its OWN second condition", () => {
  it("the share page builds its nav from this rule, not its own copy", () => {
    expect(read("components/clients/wiki/wiki-public-view.tsx")).toContain("clientVisibleSections(wiki)");
  });

  // All three are gated on more than their enabled flag, and each one's second half is
  // the load-bearing part: enabled-alone would land a client on a page that reads as a
  // broken link. They are asserted separately because the conditions genuinely differ —
  // parameterising them would only pin the flag they share.
  const available = declBlock(read("lib/wiki-client-visibility.ts"), "const availableSections");

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

  it("board — enabled AND at least one card on it", () => {
    // Enabled-and-empty would show the client a board of empty columns, which reads as
    // "nothing is planned".
    expect(available).toContain("wiki.board.enabled");
    expect(available).toContain("wiki.board.lanes.some((l) => l.total.cards + l.total.other > 0)");
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

describe("Sheets is retired into the Board (CLAUDE.md §127)", () => {
  // Its rows became Board cards. "sheets" must not come back as a selectable section by the
  // back door: a list entry here, an Add New option there, a route the client can still write to.
  const files = [
    "components/clients/wiki/wiki-sidebar.tsx",
    "components/clients/wiki/wiki-mobile-nav.tsx",
    "components/clients/wiki/wiki-dashboard.tsx",
    "components/clients/wiki/wiki-public-view.tsx",
    "components/clients/wiki/wiki-access-settings.tsx",
    "lib/wiki-section-groups.ts",
    "lib/wiki-client-visibility.ts",
    "app/wiki/[slug]/[token]/page.tsx",
  ];

  it.each(files)("%s doesn't offer a Sheets section", (rel) => {
    expect(read(rel)).not.toMatch(/["']sheets["']|\bsheets:\s/);
  });

  it("the workspace neither lists nor adds it, and an old #sheets link lands on the Board", () => {
    const src = read("components/clients/wiki/wiki-workspace.tsx");
    const all = src.slice(src.indexOf("const ALL_WIKI_SECTIONS"), src.indexOf("];", src.indexOf("const ALL_WIKI_SECTIONS")));
    expect(all).not.toContain('"sheets"');
    expect(src).not.toContain('section: "sheets"');
    expect(src).not.toContain('activeSection === "sheets"');
    expect(src).toContain('hash === "sheets" ? "board" : hash');
  });

  it("there is no Sheets route left for anyone to write to, and the server can't share it", () => {
    expect(existsSync(join(ROOT, "app/api/wiki/[token]/sheets"))).toBe(false);
    expect(existsSync(join(ROOT, "app/api/clients/[slug]/wiki/sheets"))).toBe(false);
    expect(existsSync(join(ROOT, "app/api/wiki/sheet-upload"))).toBe(false);
    const wiki = read("server/wiki.ts");
    const shareable = wiki.slice(wiki.indexOf("const SHAREABLE_SECTIONS"), wiki.indexOf("] as const;", wiki.indexOf("const SHAREABLE_SECTIONS")));
    expect(shareable).not.toContain('"sheets"');
    expect(wiki).not.toContain("loadWikiSheets");
  });

  it("old uploaded images still load: the file route stays", () => {
    expect(existsSync(join(ROOT, "app/api/wiki/files/[key]/[name]/route.ts"))).toBe(true);
  });
});

describe("board — the client moves, adds and signs off cards, and how", () => {
  const routes = [
    "app/api/wiki/[token]/board/tasks/route.ts",
    "app/api/wiki/[token]/board/tasks/[taskId]/move/route.ts",
    "app/api/wiki/[token]/board/tasks/[taskId]/feedback/route.ts",
    "app/api/wiki/[token]/board/tasks/[taskId]/route.ts",
    // Key dates on the Schedule (§128).
    "app/api/wiki/[token]/board/key-dates/route.ts",
    "app/api/wiki/[token]/board/key-dates/[keyDateId]/route.ts",
  ];
  /** Multipart writes: the form is read only after the writer and rate limit. */
  const uploadRoutes = ["app/api/wiki/[token]/board/tasks/[taskId]/images/route.ts"];
  /** Read-only: a card's image. Same access check as the writes, but no body and nothing written. */
  const readRoutes = ["app/api/wiki/[token]/board/tasks/[taskId]/images/[attachmentId]/route.ts"];

  it.each(readRoutes)("%s only reads (GET), behind the same access check", (rel) => {
    const src = read(rel);
    expect(src).toMatch(/export async function GET/);
    expect(src).not.toMatch(/export async function (POST|PATCH|PUT|DELETE)/);
    expect(src).toContain("resolveBoardWriter(req, token)");
  });

  it.each(routes)("%s resolves the writer + rate-limits before reading the body", (rel) => {
    const src = read(rel);
    expect(src).toContain("resolveBoardWriter(req, token)");
    expect(src).toContain("assertBoardWriteRate(req)");
    expect(src.indexOf("resolveBoardWriter(")).toBeLessThan(src.indexOf("await req.json()"));
    expect(src.indexOf("assertBoardWriteRate(")).toBeLessThan(src.indexOf("await req.json()"));
  });

  it.each(uploadRoutes)("%s resolves the writer + rate-limits before reading the upload", (rel) => {
    const src = read(rel);
    expect(src.indexOf("resolveBoardWriter(req, token)")).toBeGreaterThan(-1);
    expect(src.indexOf("assertBoardWriteRate(req)")).toBeLessThan(src.indexOf("readBoardImageForm(req)"));
    expect(src.indexOf("resolveBoardWriter(")).toBeLessThan(src.indexOf("readBoardImageForm(req)"));
  });

  it("only a signed-in client user deletes from the client's link; the team deletes in Foundry", () => {
    const src = read("app/api/wiki/[token]/board/tasks/[taskId]/route.ts");
    const del = src.slice(src.indexOf("export async function DELETE"));
    expect(del).toContain("if (!access.writer.wikiUserId)");
    expect(del.indexOf("if (!access.writer.wikiUserId)")).toBeLessThan(del.indexOf("deleteBoardCard("));
  });

  it("a key date is deleted from the client's link only by a signed-in client user (§128)", () => {
    const src = read("app/api/wiki/[token]/board/key-dates/[keyDateId]/route.ts");
    const del = src.slice(src.indexOf("export async function DELETE"));
    expect(del.indexOf("if (!access.writer.wikiUserId)")).toBeGreaterThan(-1);
    expect(del.indexOf("if (!access.writer.wikiUserId)")).toBeLessThan(del.indexOf("deleteKeyDate("));
  });

  it("every internal key-date route resolves the team writer; delete needs Manage clients (§128)", () => {
    const dir = join(ROOT, "app/api/clients/[slug]/wiki/board/key-dates");
    const files = readdirSync(dir, { recursive: true, encoding: "utf8" }).filter((f) => f.endsWith("route.ts"));
    expect(files.length).toBe(2);
    for (const f of files) {
      const src = readFileSync(join(dir, f), "utf8");
      const handlers = src.match(/export async function (GET|POST|PATCH|PUT|DELETE)/g) ?? [];
      const gates = src.match(/await resolveInternalBoardWriter\(req, slug, "(write|manage)"\)/g) ?? [];
      expect(gates.length, `${f}: every handler must resolve the team writer`).toBe(handlers.length);
    }
    const one = read("app/api/clients/[slug]/wiki/board/key-dates/[keyDateId]/route.ts");
    expect(one.slice(one.indexOf("export async function DELETE"))).toContain('resolveInternalBoardWriter(req, slug, "manage")');
  });

  it("every internal card route resolves the team writer; delete and restore need Manage clients", () => {
    const dir = join(ROOT, "app/api/clients/[slug]/wiki/board/cards");
    const files = readdirSync(dir, { recursive: true, encoding: "utf8" }).filter((f) => f.endsWith("route.ts"));
    expect(files.length).toBe(4);
    for (const f of files) {
      const src = readFileSync(join(dir, f), "utf8");
      const handlers = src.match(/export async function (GET|POST|PATCH|PUT|DELETE)/g) ?? [];
      const gates = src.match(/await resolveInternalBoardWriter\(req, slug, "(write|manage)"\)/g) ?? [];
      expect(gates.length, `${f}: every handler must resolve the team writer`).toBe(handlers.length);
    }
    const one = read("app/api/clients/[slug]/wiki/board/cards/[taskId]/route.ts");
    expect(one.slice(one.indexOf("export async function DELETE"))).toContain('resolveInternalBoardWriter(req, slug, "manage")');
    expect(read("app/api/clients/[slug]/wiki/board/cards/[taskId]/restore/route.ts")).toContain('resolveInternalBoardWriter(req, slug, "manage")');
    const access = read("server/wiki-board-access.ts");
    const fn = access.slice(access.indexOf("export async function resolveInternalBoardWriter"));
    expect(fn).toContain("requireAuthedUser(req)");
    expect(fn).toContain("assertCan(user, canManageClients");
    expect(fn).toContain("assertClientInScope(user, client.id)");
  });

  it("every handler under the board's token routes resolves the writer first", () => {
    const dir = join(ROOT, "app/api/wiki/[token]/board");
    const files = readdirSync(dir, { recursive: true, encoding: "utf8" }).filter((f) => f.endsWith("route.ts"));
    expect(files.length).toBe(routes.length + readRoutes.length + uploadRoutes.length);
    for (const f of files) {
      const src = readFileSync(join(dir, f), "utf8");
      const handlers = src.match(/export async function (GET|POST|PATCH|PUT|DELETE)/g) ?? [];
      const gates = src.match(/await resolveBoardWriter\(req, token\)/g) ?? [];
      expect(gates.length, `${f}: every handler must resolve the writer`).toBe(handlers.length);
    }
  });

  it("the writer resolver checks the section flag, the share link's section and the sign-in", () => {
    const src = read("server/wiki-board-access.ts");
    expect(src).toContain("boardEnabled");
    expect(src).toContain('onlySection !== "board"');
    expect(src).toContain("resolveWikiAccessUser(wiki.id, cookieValue)");
  });

  it("every write is scoped to the wiki's own client (a card from another client is a 404)", () => {
    const src = read("server/wiki-board.ts");
    expect(src).toContain("where: { id: taskId, clientId, parentId: null, archivedAt: null }");
  });

  it("a Foundry session only writes as the team if it really is this client's team", () => {
    const src = read("server/wiki-board-access.ts");
    const resolve = src.slice(src.indexOf("export async function resolveBoardWriter"));
    expect(resolve).toContain("teamWriterFor(staff.user.id, wiki.client.workspaceId, wiki.clientId)");
    expect(src).toContain("{ onlyThisWorkspace: true }");
    expect(src).toContain('user.role === "GUEST"');
    expect(src).toContain("assertClientInScope(user, clientId)");
  });

  it("the settings route checks client access, like Sheets' settings", () => {
    const src = read("app/api/clients/[slug]/wiki/board/route.ts");
    expect(src).toContain("resolveInternalSheets(req, slug,");
    expect(src).not.toContain("getEffectiveUserOrNull");
  });

  it("a link shared for another section doesn't carry the board", () => {
    const wiki = read("server/wiki.ts");
    const fn = wiki.slice(wiki.indexOf("export async function resolvePublicWiki"));
    expect(fn).toContain("scopeBoardToSection(withPublicAvatars(forPublic(await buildDTO(bySection)), token), section)");
  });

  it("the client's copy is cut by forPublicBoard, and the section loads through settle()", () => {
    const wiki = read("server/wiki.ts");
    const fn = wiki.slice(wiki.indexOf("function forPublic("), wiki.indexOf("export async function resolvePublicWiki"));
    expect(fn).toContain("board: forPublicBoard(dto.board)");
    expect(wiki).toContain('settle("board", () => loadWikiBoard(wiki.clientId), EMPTY_BOARD)');
  });
});

describe("Drive — the client's Google Drive files, a tab of Resources", () => {
  const routes = [
    "app/api/wiki/[token]/drive/route.ts",
    "app/api/wiki/[token]/drive/thumbnail/[fileId]/route.ts",
    "app/api/wiki/[token]/drive/file/[fileId]/route.ts",
  ];

  it.each(routes)("%s resolves access and rate-limits before it touches Drive", (rel) => {
    const src = read(rel);
    expect(src).toContain("resolveWikiDriveAccess(req, token)");
    expect(src).toContain("assertWikiDriveRate(req,");
    expect(src.indexOf("resolveWikiDriveAccess(")).toBeLessThan(src.indexOf("readerDrive("));
    expect(src.indexOf("assertWikiDriveRate(")).toBeLessThan(src.indexOf("readerDrive("));
  });

  it("the resolver checks the flag, that a per-section link is the Resources one, and the login", () => {
    const src = read("server/wiki-drive.ts");
    expect(src).toContain("driveEnabled");
    expect(src).toContain('onlySection !== "documents"');
    expect(src).toContain("resolveWikiAccessUser(wiki.id, cookieValue)");
  });

  it("an archived teammate's Google account is never used for a client (§57)", () => {
    const src = read("server/wiki-drive.ts");
    expect(src.slice(src.indexOf("export async function readerDrive("))).toContain("...ACTIVE_MEMBER");
  });

  it("the client's copy doesn't say whose Google account reads it, and loads through settle()", () => {
    const wiki = read("server/wiki.ts");
    const fn = wiki.slice(wiki.indexOf("function forPublic("), wiki.indexOf("export async function resolvePublicWiki"));
    expect(fn).toContain("drive: forPublicDrive(dto.drive)");
    expect(read("server/wiki-drive.ts")).toContain("{ enabled: true, linked: true, reader: null }");
    expect(wiki).toContain('settle("drive", () => loadWikiDrive(wiki.clientId), EMPTY_DRIVE)');
  });

  it("switching it on lends the SIGNED-IN person's Google account, never the 'view as' user", () => {
    expect(read("app/api/clients/[slug]/wiki/drive/route.ts")).toContain(
      "setWikiDriveEnabled(client.id, enabled, session?.user?.id ?? null)",
    );
  });

  it("Resources shows the client a Drive tab only once it's shown to them, on a linked folder", () => {
    const available = declBlock(read("lib/wiki-client-visibility.ts"), "const availableSections");
    expect(available).toContain("wiki.drive.enabled && wiki.drive.linked");
    expect(read("components/clients/wiki/wiki-drive-section.tsx")).toContain(
      'audience === "team" ? drive.linked : drive.enabled && drive.linked',
    );
  });
});
