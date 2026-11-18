import { describe, expect, it } from "vitest";
import {
  changeSentence,
  checkBoardImages,
  dependsOnRefusal,
  describeCardChanges,
  imagesSentence,
  splitCardDescription,
  subItemParentRefusal,
  type CardFields,
} from "../wiki-board-edit";
import { cardDescription } from "../wiki-board";

const base: CardFields = {
  title: "Bag management",
  itemType: "feature",
  tier: "free",
  area: "Bags",
  priority: "MEDIUM",
  estimateHours: 4,
  dueDate: "2026-12-04",
  releaseId: null,
  description: "Spec",
  links: ["https://x.dev"],
  dependsOn: [],
};

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
const img = (name: string, head: Uint8Array, size = 1000) => ({ name, head, size });

describe("what changed, in words", () => {
  it("reads as a sentence a person wrote, never as data", () => {
    const phrases = describeCardChanges(base, { ...base, priority: "HIGH" });
    expect(changeSentence("Luke", phrases)).toBe("Luke changed the priority from Medium to High.");
    const many = changeSentence("Luke", describeCardChanges(base, { ...base, title: "Bags", dueDate: null, tier: "premium" }));
    expect(many).toBe("Luke renamed it to “Bags”, changed the tier from Free to Premium and cleared the due date.");
    expect(many).not.toMatch(/[{}[\]"]|dueDate|tier:/);
  });

  it("says set, changed and cleared the way a person would", () => {
    expect(describeCardChanges({ ...base, area: null }, base)).toEqual(["set the area to Bags"]);
    expect(describeCardChanges(base, { ...base, estimateHours: 6.5 })).toEqual(["changed the estimate from 4h to 6.5h"]);
    expect(describeCardChanges(base, { ...base, dueDate: "2026-12-10" })).toEqual(["changed the due date from 4 Dec 2026 to 10 Dec 2026"]);
    expect(describeCardChanges(base, { ...base, releaseId: "r1" }, () => "v1.4")).toEqual(["moved it to v1.4"]);
    expect(describeCardChanges({ ...base, releaseId: "r1" }, base)).toEqual(["took it out of its release"]);
    expect(describeCardChanges(base, { ...base, links: ["https://x.dev", "https://y.dev", "https://z.dev"] })).toEqual(["added 2 links"]);
    expect(describeCardChanges(base, { ...base, dependsOn: ["c2"] })).toEqual(["changed what it depends on"]);
    expect(imagesSentence("Luke", 2)).toBe("Luke added 2 screenshots.");
    expect(imagesSentence("Luke", 1)).toBe("Luke added 1 screenshot.");
  });

  it("an edit that changes nothing says nothing", () => {
    expect(describeCardChanges(base, { ...base, title: " Bag management ", dependsOn: [] })).toEqual([]);
    expect(changeSentence("Luke", [])).toBe("");
  });
});

describe("links stored in the description", () => {
  it("come back out exactly as they went in", () => {
    const links = ["https://x.dev", "https://example.com/a(1) b"];
    expect(splitCardDescription(cardDescription("Spec\n\nMore", links))).toEqual({ body: "Spec\n\nMore", links });
    expect(splitCardDescription(cardDescription(null, ["https://x.dev"]))).toEqual({ body: "", links: ["https://x.dev"] });
  });

  it("leave a description they didn't write alone", () => {
    const text = "Links are below\n\n- [not ours](javascript:alert(1))";
    expect(splitCardDescription(text)).toEqual({ body: text, links: [] });
    expect(splitCardDescription(null)).toEqual({ body: "", links: [] });
  });
});

describe("sub-items and dependencies", () => {
  it("a sub-item goes under a top-level feature card, one level only", () => {
    expect(subItemParentRefusal({ itemType: "feature", parentId: null })).toBeNull();
    expect(subItemParentRefusal({ itemType: "bug", parentId: null })).toMatch(/feature card/);
    expect(subItemParentRefusal({ itemType: "feature", parentId: "p" })).toMatch(/not under another sub-item/);
    expect(subItemParentRefusal(null)).toMatch(/Pick the feature/);
  });

  it("a card depends only on cards that were found on this board, never itself", () => {
    expect(dependsOnRefusal("a", ["b"], new Set(["b"]))).toBeNull();
    expect(dependsOnRefusal("a", ["a"], new Set(["a"]))).toMatch(/itself/);
    expect(dependsOnRefusal("a", ["elsewhere"], new Set(["b"]))).toMatch(/isn't on this board/);
    expect(dependsOnRefusal(null, Array.from({ length: 21 }, (_, i) => `c${i}`), new Set())).toMatch(/up to 20/);
  });
});

describe("screenshots", () => {
  it("are judged by their bytes: a PNG passes whatever it's called", () => {
    expect(checkBoardImages(0, [img("shot.txt", PNG)])).toEqual({ ok: true, mimes: ["image/png"] });
  });

  it("an SVG is refused, even named .png", () => {
    expect(checkBoardImages(0, [img("logo.png", SVG)])).toMatchObject({ ok: false, error: expect.stringMatching(/isn't a PNG, JPEG, GIF or WebP/) });
  });

  it("over 10 MB, or past 10 on a card, is refused", () => {
    expect(checkBoardImages(0, [img("big.png", PNG, 10 * 1024 * 1024 + 1)])).toMatchObject({ ok: false, error: expect.stringMatching(/over 10 MB/) });
    expect(checkBoardImages(9, [img("a.png", PNG), img("b.png", PNG)])).toMatchObject({ ok: false, error: expect.stringMatching(/room for 1 more/) });
    expect(checkBoardImages(10, [img("a.png", PNG)])).toMatchObject({ ok: false, error: expect.stringMatching(/already has 10/) });
    expect(checkBoardImages(0, [])).toMatchObject({ ok: false });
  });
});
