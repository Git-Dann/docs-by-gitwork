import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Linking a second client's work into a wiki.
 *
 * Source assertions: the merge and the gates are the parts that break silently,
 * and both are facts about the source rather than behaviour a node test can drive
 * without a database.
 */
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const server = stripComments(read("src/server/wiki-links.ts"));
const wiki = stripComments(read("src/server/wiki.ts"));
const section = stripComments(read("src/components/clients/wiki/wiki-timeline-section.tsx"));

describe("wiki links — linked work is kept SEPARATE, and is not Gantt-shaped", () => {
  /**
   * ⚠️ The first cut merged linked blocks into the Gantt and labelled them. It
   * rendered NOTHING for the case it was built for: YG intelligence has four
   * blocks, 66 tasks and not one date between them, and `loadWikiTimeline` drops
   * every block it cannot give a span to — correctly, since it feeds a chart.
   * Undated is the normal shape for a workstream that is tracked but not
   * scheduled, so linked work is loaded its own way and shown as a table.
   */
  it("does not run linked clients through the Gantt loader", () => {
    const fn = wiki.slice(wiki.indexOf("async function loadLinkedWork"));
    const body = fn.slice(0, fn.indexOf("async function loadWikiTimelineWithLinks"));
    expect(body).toContain("prisma.featureBlock.findMany");
    // Dates are selected because a table can show them; they must not be a filter.
    expect(body).not.toContain("loadWikiTimeline(");
  });

  it("keeps every block, dated or not", () => {
    const fn = wiki.slice(wiki.indexOf("async function loadLinkedWork"));
    const body = fn.slice(0, fn.indexOf("async function loadWikiTimelineWithLinks"));
    const where = body.slice(body.indexOf("where:"), body.indexOf("orderBy:"));
    expect(where).toContain("clientId: source.clientId");
    expect(where).not.toMatch(/startDate|endDate|dueDate/);
  });

  it("counts only top-level live tasks, like every other progress figure", () => {
    const fn = wiki.slice(wiki.indexOf("async function loadLinkedWork"));
    expect(fn.slice(0, 2000)).toMatch(/where: \{ parentId: null, archivedAt: null \}/);
  });

  it("linked work never joins this client's own blocks", () => {
    // Everything that reports "how much of THIS client is done" reads `blocks` +
    // `unassigned`. Folding another client's board into those would silently
    // rewrite this client's progress on the dashboard, Delivery and RoundUp.
    const fn = wiki.slice(wiki.indexOf("async function loadWikiTimelineWithLinks"));
    const body = fn.slice(0, fn.indexOf("async function loadWikiTimeline("));
    expect(body).toMatch(/return \{ \.\.\.own, linked \}/);
    expect(body).not.toMatch(/blocks: \[/);
  });

  it("a wiki with no links is byte-identical to before", () => {
    const fn = wiki.slice(wiki.indexOf("async function loadWikiTimelineWithLinks"));
    expect(fn.slice(0, 400)).toMatch(/if \(links\.length === 0\) return own;/);
  });

  it("the section renders under the client's own timeline, as the SAME chart", () => {
    expect(section).toContain("<LinkedWorkCard");
    expect(section).toMatch(/\{\(timeline\.linked \?\? \[\]\)\.map/);
    // The same component as the client's own plan, not a second widget that merely
    // shows the same numbers.
    expect(section).toMatch(/<GanttChart blocks=\{blocks\} milestones=\{\[\]\} \/>/);
  });

  it("owns its own spacing, because a parent renders it as the whole section", () => {
    // `wiki-public-view` returns this component directly, so a bare fragment left
    // card 01 and card 02 touching with no gap at all.
    expect(section).toMatch(/<div className="space-y-\d">\s*\n?\s*<section className="widget-card">/);
    expect(section).not.toMatch(/return \(\s*\n?\s*<>/);
  });

  it("says plainly when a linked board has no dates", () => {
    // A Gantt with no bars is otherwise indistinguishable from a broken one.
    expect(section).toMatch(/const undated = work\.blocks\.every\(\(b\) => !b\.startDate\)/);
    expect(section).toContain("These phases have no dates yet");
  });

  it("shows NO TASKS YET rather than 0% on an empty board", () => {
    // "0% complete" reads as failure; nothing-yet is a different fact.
    expect(section).toMatch(/pct === null \? "NO TASKS YET"/);
    expect(section).toMatch(/work\.total === 0 \? null/);
  });
});

describe("the Gantt tolerates a block with no dates", () => {
  const gantt = stripComments(read("src/components/tasks/gantt-chart.tsx"));

  /**
   * ⚠️ `FeatureBlock.startDate` is optional in the schema, and a workstream that is
   * tracked but not scheduled is the normal case. Callers used to filter undated
   * blocks out before they reached the chart, so they vanished from the plan
   * entirely rather than appearing as work with no date yet.
   */
  it("accepts nullable dates", () => {
    expect(gantt).toMatch(/startDate: string \| null;\s*\n\s*endDate: string \| null;/);
  });

  it("an undated block contributes no stamp to the axis", () => {
    // `new Date(null)` is the EPOCH — finite, so a `Number.isFinite` filter does not
    // catch it, and it would drag the whole domain back to 1970.
    expect(gantt).toMatch(/if \(b\.startDate\) stamps\.push/);
    expect(gantt).toMatch(/b\.startDate \? \[new Date\(b\.startDate\)\.getTime\(\)\] : \[\]/);
  });

  it("undated blocks sort LAST, not to 1970", () => {
    // ⚠️ Anchored on CODE. The first version sliced from the string "Rail order",
    // which is a COMMENT — and `gantt` is comment-stripped, so indexOf returned -1
    // and the slice silently started from the end of the file.
    const sort = gantt.slice(gantt.indexOf("const ordered = useMemo"), gantt.indexOf("const allOpen"));
    expect(sort.length, "the sort block moved").toBeGreaterThan(50);
    // ⚠️ All FOUR sides, not "an Infinity appears somewhere". Sabotaging one of
    // them left the other three and the assertion passed — and one unguarded side
    // is all it takes to sort that block to 1970.
    for (const v of ["a.startDate", "z.startDate", "a.endDate", "z.endDate"]) {
      expect(sort, `${v} needs the Infinity fallback`).toMatch(
        new RegExp(`${v.replace(".", "\\.")} \\? new Date\\(${v.replace(".", "\\.")}\\)\\.getTime\\(\\) : Infinity`),
      );
    }
    expect((sort.match(/: Infinity/g) ?? []).length).toBe(4);
  });

  it("draws the rail row but NOT a bar", () => {
    // A zero-width bar still paints its rounded background and hover target — a
    // smudge at the left edge claiming the work starts there.
    expect(gantt).toMatch(/const dated = Boolean\(b\.startDate && b\.endDate\)/);
    expect(gantt).toMatch(/display: dated \? undefined : "none"/);
  });

  /**
   * ⚠️ Found by rendering, not by reading. Slippage is measured from the bar's
   * RIGHT EDGE to today, and an undated block has its edge at x=0 — so every row
   * came out with a full-width red hatched band claiming work with no deadline was
   * months overdue. Nothing can be late against a date that does not exist.
   */
  it("never marks an undated block as slipping", () => {
    expect(gantt).toMatch(/const isSlipping = dated && slippage/);
  });

  it("the due column and tooltip say there is no date rather than inventing one", () => {
    expect(gantt).toMatch(/b\.endDate \? fmtShort\(b\.endDate\) : "—"/);
    expect(gantt).toContain("No dates set");
  });
});

describe("wiki links — the gates", () => {
  it("a wiki cannot link its own client", () => {
    // It would double every block, task and milestone on its own timeline, and the
    // numbers would look merely wrong rather than obviously broken.
    expect(server).toMatch(/input\.linkedClientId === clientId/);
    expect(server).toMatch(/throw new ForbiddenError\("A client can't be linked to its own wiki\."\)/);
  });

  it("the linked client must be in the caller's workspace", () => {
    expect(server).toMatch(/workspaceId: user\.workspaceId/);
  });

  it("unlinking is scoped by wiki, not by id alone", () => {
    // An id alone would let one client's wiki unlink another's.
    const fn = server.slice(server.indexOf("export async function removeWikiLink"));
    expect(fn).toMatch(/findFirst\(\{\s*where: \{ id, wikiId \}/);
  });

  it("writes need canManageClients; reading a link list does not", () => {
    const add = server.slice(server.indexOf("export async function addWikiLink"));
    expect(add.slice(0, 300)).toContain("assertCan(user, canManageClients");
    const list = server.slice(
      server.indexOf("export async function listWikiLinks"),
      server.indexOf("export async function addWikiLink"),
    );
    expect(list).not.toContain("assertCan");
  });

  /**
   * ⚠️ One-way by design. A symmetric link would put a client's whole plan in
   * front of anyone holding the OTHER client's public share token — a disclosure
   * change, not a tidiness one, and not something to arrive at by accident.
   */
  it("is one-way — nothing writes the reverse link", () => {
    expect(server).not.toMatch(/wikiId: .*linked/i);
    const creates = server.match(/clientWikiLink\.create/g) ?? [];
    expect(creates).toHaveLength(1);
  });
});

describe("wiki links — a second include cannot silently drop them", () => {
  it("WIKI_INCLUDE carries the links", () => {
    // `buildDTO` takes them as OPTIONAL so existing callers compile, which means a
    // caller that forgets gets a wiki with no linked work rather than an error —
    // §47.3's defect exactly. This is the one place that must carry it.
    expect(wiki).toMatch(/const WIKI_INCLUDE = \{\s*\n\s*linkedClients: \{/);
    expect(wiki).toMatch(/linkedClient: \{ select: \{ id: true, name: true \} \}/);
  });

  it("the timeline is loaded through the link-aware loader", () => {
    // ⚠️ Scope to the CALL. `toContain("loadWikiTimelineMerged(")` matches the
    // DECLARATION too, so it passed with the call site renamed — caught by
    // sabotage, and the same ambiguity that has bitten several of these guards.
    const from = wiki.indexOf('settle(\n      "timeline",');
    expect(from, "the timeline settle() block moved").toBeGreaterThan(-1);
    const call = wiki.slice(from, from + 500);
    expect(call).toContain("loadWikiTimelineWithLinks(");
    expect(call).toMatch(/wiki\.linkedClients/);
  });
});
