import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

/**
 * "Documents" → "Resources" is a LABEL change in eight files. The section id stays
 * `documents`, because changing it would touch all twelve allow-lists (§43.1), the
 * `documentsEnabled` column and every share link already sent, for no user-visible
 * gain. Label ≠ id is already the norm here: `intake` → "Requests", `insights` →
 * "Charts", `ia` → "Info Architecture".
 *
 * ⚠️ The first cut of this sweep listed five files and matched only the exact
 * quoted word `"Documents"`. That is three separate ways to miss a label: the
 * widget header writes `// DOCUMENTS`, the toolbar writes a placeholder, and the
 * two client-facing label maps live outside the wiki component directory. All
 * four forms are matched now, and the section's own file is in the list.
 *
 * ⚠️ These two run against RAW source, not `strip`ped source: the widget header
 * is literally `{" // DOCUMENTS"}`, so stripping line comments would delete the
 * very string being looked for and the alternative could never match.
 */
const LABEL_SITES = [
  "src/components/clients/wiki/wiki-workspace.tsx",
  "src/components/clients/wiki/wiki-sidebar.tsx",
  "src/components/clients/wiki/wiki-public-view.tsx",
  "src/components/clients/wiki/wiki-dashboard.tsx",
  "src/components/clients/wiki/wiki-access-settings.tsx",
  // The section itself — its own header, toolbar and empty states.
  "src/components/clients/wiki/documents-section.tsx",
  // Client-facing: the share page's section heading, and the OG card's label.
  "src/app/wiki/[slug]/[token]/page.tsx",
  "src/lib/og/load-entity.ts",
];

/**
 * Every shape a user-visible "Documents" label takes here. Deliberately does NOT
 * match copy about Foundry *documents* — the add-from-Docs modal genuinely refers
 * to `Document` records and must keep saying so.
 */
const OLD_LABEL = /"Documents"|\/\/ DOCUMENTS|Search documents|No documents (yet|match)/;
const NEW_LABEL = /"Resources"|\/\/ RESOURCES|Search resources|No resources (yet|match)/;

/**
 * The two label maps live in files the Docs module also uses, where the SINGULAR
 * `"Document"` is the `DocumentType.OTHER` label and must not change — which is
 * why the sweep above is plural-only. This pins the one key that matters, exactly,
 * so plural-only cannot become a hole.
 */
const SECTION_LABEL_MAPS = [
  "src/app/wiki/[slug]/[token]/page.tsx",
  "src/lib/og/load-entity.ts",
];

describe("wiki Resources — the rename", () => {
  it("no label site still says Documents", () => {
    const missed = LABEL_SITES.filter((f) => OLD_LABEL.test(read(f)));
    expect(missed, `still labelled "Documents":\n${missed.join("\n")}`).toEqual([]);
  });

  it("every label site actually says Resources, so the sweep means something", () => {
    // Without this, deleting a label entirely would pass the test above.
    for (const f of LABEL_SITES) {
      expect(read(f), f).toMatch(NEW_LABEL);
    }
  });

  it("the client-facing label maps point `documents` at Resources", () => {
    for (const f of SECTION_LABEL_MAPS) {
      expect(read(f), f).toMatch(/^ {2}documents: "Resources",$/m);
    }
  });

  it("the section ID is untouched", () => {
    // A renamed id would break `documentsEnabled`, twelve allow-lists and every
    // share link already sent.
    const sidebar = strip(read("src/components/clients/wiki/wiki-sidebar.tsx"));
    expect(sidebar).toMatch(/navItem\("documents", "Resources"/);
    // The column keeps the old name too — it is the id, not the label.
    expect(read("prisma/schema.prisma")).toContain("documentsEnabled");
  });
});

describe("wiki Resources — the preview", () => {
  const card = strip(read("src/components/clients/wiki/documents-section.tsx"));

  it("resolves an embed per card, and previews any kind, not only video", () => {
    expect(card).toMatch(/const embed = embedFor\(doc\.url\)/);
    expect(card).toMatch(/const previewable = Boolean\(embed\)/);
  });

  it("keeps the client's share-token URL out of a third party's referrer log", () => {
    expect(card).toContain('referrerPolicy="no-referrer"');
  });

  it("does not fetch the URL server-side", () => {
    // §40.1: a caller-supplied URL is stored and linked, never fetched — that is
    // an SSRF vector. The embed is derived from the URL's shape, not from oEmbed.
    const embed = strip(read("src/lib/wiki/embed.ts"));
    expect(embed).not.toMatch(/\bfetch\(/);
    expect(embed).not.toContain("oembed");
  });

  it("gives a previewable card a play affordance instead of an inline frame", () => {
    // Replaces the original "collapse the cover when a preview sits above it"
    // rule: there is no longer anything above it, because the frame moved into
    // the dialog. See "the card grid" below for why.
    expect(card).toMatch(/onPlay\(doc\)/);
    expect(card).toMatch(/PlayIcon/);
  });
});

describe("wiki Resources — the card grid", () => {
  const card = strip(read("src/components/clients/wiki/documents-section.tsx"));

  it("shows 12 a page", () => {
    expect(card).toMatch(/const PAGE_SIZE = 12;/);
  });

  /**
   * ⚠️ Every card must be the same height whatever its title does. The cover used
   * to size itself to the title (`min-h-[128px]` + a 3-line clamp), so a 2-line
   * and a 3-line title made visibly different bands of colour side by side —
   * which is what Dan reported. Measured after the fix: one card height and one
   * cover height across a 12-card grid of 1-to-4-line titles.
   */
  it("gives the cover a fixed height, not a minimum", () => {
    expect(card).toMatch(/const COVER_H = \d+;/);
    expect(card).not.toContain("min-h-[128px]");
    // ⚠️ Assert the USE, not just the declaration. Swapping `height: COVER_H`
    // for `minHeight: 128` leaves the const declared and this test green while
    // the cards go ragged again — which is exactly what a sabotage run showed.
    expect([...card.matchAll(/height: COVER_H,/g)]).toHaveLength(2);
    expect(card).not.toMatch(/minHeight:/);
  });

  it("reserves a fixed two-line box for the title, and keeps the full text reachable", () => {
    expect(card).toMatch(/h-\[44px\]/);
    expect(card).toMatch(/WebkitLineClamp: 2/);
    // A clamped title with no tooltip is a TRUNCATED finding under
    // audit:clipping — the text is on screen nowhere and unreachable.
    const title = card.slice(card.indexOf("data-resource-title"));
    expect(title.slice(0, 600)).toMatch(/title=\{doc\.title\}/);
  });

  it("sets the clamp inline rather than with the utility class", () => {
    // `line-clamp-2` works by setting `display:-webkit-box`, and in this subtree
    // something else wins the display, so the class silently stops clamping and
    // the title is hard-cut mid-word with no ellipsis.
    expect(card).not.toMatch(/line-clamp-\d/);
  });

  /**
   * ⚠️ The single most important rule here. Twelve third-party iframes racing on
   * one page is what made previews load only some of the time, and the losers
   * rendered an empty box that read as a broken card. The grid must request
   * nothing from a third party until someone asks to watch.
   */
  it("mounts no iframe in the grid — only in the player dialog", () => {
    const iframes = [...card.matchAll(/<iframe/g)];
    expect(iframes).toHaveLength(1);
    const playerStart = card.indexOf("function ResourcePlayer");
    const playerEnd = card.indexOf("function ResourceEditor");
    expect(playerStart).toBeGreaterThan(-1);
    expect(card.indexOf("<iframe")).toBeGreaterThan(playerStart);
    expect(card.indexOf("<iframe")).toBeLessThan(playerEnd);
  });

  it("keeps the share-token URL out of the provider's referrer log", () => {
    expect(card).toContain('referrerPolicy="no-referrer"');
  });

  it("can rename a resource and repoint a link", () => {
    expect(card).toContain("function ResourceEditor");
    expect(card).toMatch(/useUpdateWikiDoc/);
    // A FILE has no URL to edit — its bytes are the resource.
    expect(card).toMatch(/canEditUrl/);
  });

  it("the demo carries the shape the defect appears in", () => {
    // A fixture where every title is the same length cannot show ragged cards,
    // and one with no Loom links cannot show the preview at all.
    const demo = read("src/lib/demo/dev-demo-data.ts");
    const block = demo.slice(demo.indexOf("documents: {"), demo.indexOf("codeHandover:"));
    expect(block).toContain("loom.com/share/");
    expect(block).toContain('kind: "FILE"');
    expect(block).toContain('kind: "FOUNDRY"');
    // More than one page's worth, so the pager is exercised.
    expect([...block.matchAll(/id: "wd\d+"/g)].length).toBeGreaterThan(12);
  });
});
