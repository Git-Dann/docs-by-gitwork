import { existsSync } from "node:fs";
import { join } from "node:path";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SECTION_REGISTRY, allSectionKeys } from "@/lib/sections/registry";
import {
  BLOCK_GALLERY_COSTS,
  BLOCK_GALLERY_PHASES,
  buildBlockGallery,
  galleryKeys,
} from "@/server/documents/block-gallery";

/**
 * The guard that makes the gallery worth having.
 *
 * A gallery that quietly falls behind the registry is WORSE than none: it looks complete, so the
 * three blocks it is missing are the ones that get reviewed by nobody and ship wrong. This asserts
 * the gallery against the live registry, so adding a block and forgetting the gallery fails here
 * rather than six weeks later on a client document.
 *
 * Same idea as `categories.reconcile.test.ts` for the Pulse check catalogue — the drift guard is
 * the point, not the fixture.
 */

describe("block gallery covers the registry", () => {
  it("contains every registered block", () => {
    const registered = [...allSectionKeys()].sort();
    const covered = [...galleryKeys()].sort();

    // Named difference rather than a bare length check: the failure should tell you WHICH block
    // to go and write example content for.
    expect(registered.filter((key) => !covered.includes(key))).toEqual([]);
  });

  it("contains no block the registry does not have", () => {
    const registered = new Set<string>(allSectionKeys());

    expect(galleryKeys().filter((key) => !registered.has(key))).toEqual([]);
  });

  it("uses each block exactly once", () => {
    const keys = galleryKeys();

    expect(new Set(keys).size).toBe(keys.length);
  });
});

/**
 * The document the gallery's sections live in. It carries the gallery's cost items and timeline
 * phases because `costing` and `timeline` render THOSE, not their own data — a document without
 * them renders both blocks blank.
 */
function galleryDocument(sections: ReturnType<typeof buildBlockGallery>) {
  return {
    id: "gallery",
    workspaceId: "ws",
    ownerId: "owner",
    documentType: "PROPOSAL",
    status: "DRAFT",
    title: "Block gallery",
    version: "1",
    isShared: false,
    labels: [],
    metadata: {},
    exportSettings: {},
    updatedAt: "2026-08-05T00:00:00.000Z",
    createdAt: "2026-08-05T00:00:00.000Z",
    sections,
    costLineItems: BLOCK_GALLERY_COSTS,
    timelinePhases: BLOCK_GALLERY_PHASES,
    assets: [],
    links: [],
    ctas: [],
  } as unknown as Record<string, unknown>;
}

/**
 * Every string in a block's data that a renderer would pass through UNCHANGED — long enough to be
 * distinctive, free of HTML-escapable characters (so the check can run against stripped markup),
 * and free of markdown markers (which the renderer legitimately consumes: `**bold**` reaches the
 * page as `bold`). Split per line, because a prose block is one string holding several.
 */
function plainStrings(value: unknown, found: string[] = []): string[] {
  if (typeof value === "string") {
    for (const line of value.split("\n")) {
      const plain = line.trim();
      if (plain.length > 12 && !/["'&<>*`\[\]]/.test(plain)) found.push(plain);
    }
    return found;
  }
  if (Array.isArray(value)) {
    for (const item of value) plainStrings(item, found);
    return found;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) plainStrings(item, found);
  }
  return found;
}

/**
 * Blocks that legitimately hold no text of their own. Keep this list short and justified — every
 * entry is a block the content assertion cannot cover.
 *
 *  · `divider` — draws a rule; its data is a variant and a spacing.
 *  · `timeline` — its data is a view mode; the phases it renders live on the document, and are
 *    covered by the dedicated test at the end of this file instead.
 */
const NO_TEXT_OF_ITS_OWN = new Set(["divider", "timeline"]);

describe("the gallery is a valid document", () => {
  const sections = buildBlockGallery();

  it("opens on the cover", () => {
    // A document whose first block is not the cover paginates wrong from page one.
    expect(sections[0]?.key).toBe("cover");
  });

  it("numbers sortOrder contiguously from zero", () => {
    expect(sections.map((section) => section.sortOrder)).toEqual(sections.map((_, i) => i));
  });

  it("makes every block visible", () => {
    // A hidden block in a gallery is a block nobody looks at.
    expect(sections.every((section) => section.isVisible)).toBe(true);
  });

  it("labels each section with its registry key, so a defect is traceable to a file", () => {
    for (const section of sections) {
      expect(section.description, section.title).toBe(section.key);
    }
  });

  it("actually renders every block, with its example content on the page", () => {
    // Genuinely rendered, not "has a Preview function". This is what catches the commonest
    // fixture mistake by far — data shaped for the WRONG block, which type-checks any time two
    // blocks share a field name and then renders an empty section nobody notices.
    for (const section of sections) {
      const type = SECTION_REGISTRY[section.key];
      expect(type, section.key).toBeDefined();

      // Some previews (the cover) read workspace branding through React Query, so they need a
      // client even though nothing here fetches — the provider is scaffolding, not a network call.
      const html = renderToStaticMarkup(
        createElement(
          QueryClientProvider,
          { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
          createElement(type.Preview as unknown as ComponentType<Record<string, unknown>>, {
            data: section.data,
            section,
            proposal: galleryDocument(sections),
          }),
        ),
      );

      // NOT "rendered something" — that is satisfied by an empty-state message, which is exactly
      // how a block with no example content would sneak through (kpi_strip does precisely this,
      // and passed an earlier, weaker version of this assertion with `items: []`).
      const text = html.replace(/<[^>]*>/g, " ");
      const candidates = plainStrings(section.data);

      // A block with NO example content must fail here rather than be skipped — "no candidates"
      // is the signature of exactly the omission this test exists to catch, and an earlier
      // version of it treated that as a pass.
      if (NO_TEXT_OF_ITS_OWN.has(section.key)) {
        expect(candidates, `${section.key} is on the no-text list but has content`).toEqual([]);
        continue;
      }
      expect(candidates.length, `${section.key} has no example content at all`).toBeGreaterThan(0);

      // "At least one" rather than "all": some fields are editor-only or feed another block —
      // `costing.supportingNarrative` is real data the Preview genuinely doesn't draw.
      expect(
        candidates.some((candidate) => text.includes(candidate)),
        `${section.key} rendered none of its own example content`,
      ).toBe(true);
    }
  });

  it("gives costing and timeline the document-level data they render", () => {
    // Neither block draws its own `data` — costing renders `proposal.costLineItems` and timeline
    // renders `proposal.timelinePhases`. Seed the gallery without them and both come out blank
    // while every other assertion here still passes, which is how a half-empty gallery ships.
    expect(BLOCK_GALLERY_COSTS.length, "costing would render an empty table").toBeGreaterThan(0);
    expect(BLOCK_GALLERY_PHASES.length, "timeline would render nothing").toBeGreaterThan(0);

    const costing = sections.find((section) => section.key === "costing")!;
    const html = renderToStaticMarkup(
      createElement(
        QueryClientProvider,
        { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
        createElement(
          SECTION_REGISTRY.costing.Preview as unknown as ComponentType<Record<string, unknown>>,
          { data: costing.data, section: costing, proposal: galleryDocument(sections) },
        ),
      ),
    );

    expect(html).toContain(BLOCK_GALLERY_COSTS[0].category);
  });

  it("only references images that actually exist in public/", () => {
    // The gallery shipped pointing at `/gitwork-header.png`, which CLAUDE.md still lists but which
    // was deleted — so the image block rendered a broken-image icon. A fixture referencing a
    // missing asset is invisible to every other check here: the block renders, and its alt text
    // even satisfies the content assertion.
    const urls: string[] = [];
    const collect = (value: unknown) => {
      if (typeof value === "string" && value.startsWith("/") && /\.(png|jpe?g|svg|webp|gif)$/i.test(value)) {
        urls.push(value);
      } else if (Array.isArray(value)) value.forEach(collect);
      else if (value && typeof value === "object") Object.values(value).forEach(collect);
    };
    sections.forEach((section) => collect(section.data));

    expect(urls.length, "no image asset referenced at all — has the image block lost its url?")
      .toBeGreaterThan(0);
    for (const url of urls) {
      expect(existsSync(join(process.cwd(), "public", url)), `public${url} does not exist`).toBe(true);
    }
  });
});
