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

  it("renders an iframe only for a resolved embed", () => {
    expect(card).toMatch(/const embed = embedFor\(doc\.url\)/);
    expect(card).toMatch(/\{embed \? \(/);
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

  it("drops the 128px gradient cover when there is a preview above it", () => {
    expect(card).toMatch(/embed \? "min-h-0" : "min-h-\[128px\]"/);
  });
});
