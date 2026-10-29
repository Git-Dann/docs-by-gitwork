import { describe, expect, it } from "vitest";
import {
  CHAPTERS,
  EDITABLE_FIELDS,
  OVERRIDE_LIMITS,
  PAGES,
  PAGE_COUNT,
  fieldText,
  overrideKey,
  pageNumber,
  parseOverrides,
} from "@/lib/guidelines/content";

describe("the guidelines deck", () => {
  it("gives every page a unique id, because the id is the URL anchor and the edit key", () => {
    const ids = PAGES.map((p) => p.page.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("opens every chapter after the first with its own chapter cover", () => {
    for (const chapter of CHAPTERS.slice(1)) {
      expect(chapter.pages[0]).toMatchObject({ kind: "chapter", id: chapter.id });
      expect(chapter.pages.slice(1).every((p) => p.kind === "content")).toBe(true);
    }
  });

  it("gives every content page a visual and a note", () => {
    for (const { page } of PAGES.filter((p) => p.page.kind === "content")) {
      expect(page.visual, page.id).toBeTruthy();
      expect(page.note, page.id).toBeTruthy();
    }
  });

  it("numbers pages from the cover, and counts them all", () => {
    expect(PAGES.map((p) => p.index)).toEqual([...Array(PAGE_COUNT).keys()]);
    expect(pageNumber(0)).toBe("01");
  });

  it("covers Foundry as a Gitwork product", () => {
    const products = CHAPTERS.find((c) => c.id === "products");
    expect(products?.pages.map((p) => p.id)).toEqual(
      expect.arrayContaining(["foundry", "product-lockup", "foundry-modules", "product-cards"]),
    );
  });
});

describe("the copy keeps the brand's own rules", () => {
  // The guidelines tell everyone else not to do these; the guidelines must not do them either.
  const copy = PAGES.flatMap(({ page }) => [page.title, page.subtitle, page.note].filter(Boolean) as string[]);

  it("has no em dashes", () => {
    expect(copy.filter((t) => t.includes("—"))).toEqual([]);
  });

  it("never says free", () => {
    expect(copy.filter((t) => /\bfree\b/i.test(t))).toEqual([]);
  });

  it("uses UK spelling", () => {
    expect(copy.filter((t) => /\b(color|optimize|organization|license)\b/i.test(t))).toEqual([]);
  });
});

describe("parseOverrides", () => {
  const cover = PAGES[0].page;

  it("keeps known page fields and trims them", () => {
    expect(parseOverrides({ "cover:title": "  New headline.  " })).toEqual({ "cover:title": "New headline." });
  });

  it("drops unknown pages, fields a page cannot edit, empty values and non-strings", () => {
    expect(
      parseOverrides({
        "nope:title": "x",
        "cover:subtitle": "covers have no subtitle",
        "contents:title": "the contents page is not editable",
        "voice:note": "   ",
        "voice:title": 42,
      }),
    ).toEqual({});
    expect(parseOverrides(null)).toEqual({});
    expect(parseOverrides(["cover:title"])).toEqual({});
  });

  it("caps the length of an edit", () => {
    const long = parseOverrides({ "voice:note": "x".repeat(5000) });
    expect(long["voice:note"]).toHaveLength(OVERRIDE_LIMITS.chars);
  });

  it("only offers fields that exist on the page kind", () => {
    expect(EDITABLE_FIELDS.contents).toEqual([]);
    expect(overrideKey("voice", "note")).toBe("voice:note");
  });

  it("shows an edit when there is one, and the default otherwise", () => {
    expect(fieldText({}, cover, "title")).toBe(cover.title);
    expect(fieldText({ "cover:title": "Edited." }, cover, "title")).toBe("Edited.");
  });
});
