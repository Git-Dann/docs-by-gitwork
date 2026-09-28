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

describe("wiki links — the merge says whose work is whose", () => {
  it("every borrowed row carries its source", () => {
    // A merged timeline that does not label the rows reads as one project, which
    // is worse than showing two.
    const merged = wiki.slice(wiki.indexOf("async function loadWikiTimelineMerged"));
    const body = merged.slice(0, merged.indexOf("async function loadWikiTimeline("));
    for (const list of ["blocks", "milestones", "unassigned"]) {
      expect(body, `${list} must be tagged`).toMatch(new RegExp(`${list}: t\\.${list}\\.map`));
    }
    expect(body).toMatch(/tasks: b\.tasks\.map\(\(task\) => \(\{ \.\.\.task, source \}\)\)/);
  });

  it("the client's OWN rows are left untagged", () => {
    // A wiki with no links has to render exactly as it did before this existed —
    // tagging own work would put a chip on every row of every wiki in the app.
    const merged = wiki.slice(wiki.indexOf("async function loadWikiTimelineMerged"));
    expect(merged.slice(0, 400)).toMatch(/if \(links\.length === 0\) return own;/);
  });

  it("the label is shown in the Gantt rail, where the reader is looking", () => {
    expect(section).toMatch(/b\.source \? `\$\{b\.source\.name\} · \$\{b\.name\}` : b\.name/);
    expect(section).toMatch(/m\.source \? `\$\{m\.source\.name\} · \$\{m\.name\}` : m\.name/);
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

  it("the timeline is loaded through the MERGED loader", () => {
    // ⚠️ Scope to the CALL. `toContain("loadWikiTimelineMerged(")` matches the
    // DECLARATION too, so it passed with the call site renamed — caught by
    // sabotage, and the same ambiguity that has bitten several of these guards.
    const from = wiki.indexOf('settle(\n      "timeline",');
    expect(from, "the timeline settle() block moved").toBeGreaterThan(-1);
    const call = wiki.slice(from, from + 500);
    expect(call).toContain("loadWikiTimelineMerged(");
    expect(call).toMatch(/wiki\.linkedClients/);
  });
});
