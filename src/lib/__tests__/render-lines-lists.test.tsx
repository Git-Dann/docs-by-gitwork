// @vitest-environment jsdom
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { renderLines } from "@/lib/markdown";

/**
 * What the CLIENT actually sees.
 *
 * `renderLines` draws every multi-line text field in a document — the editor canvas, the public
 * `/docs/[token]` view, the print view and the PDF. Until now it understood a paragraph, a FLAT
 * bullet list and inline marks, and nothing else: `1. One` rendered as `<span>1. One</span>` and
 * `- a\n  - nested` collapsed to two siblings.
 *
 * That was the ceiling on the whole editor. Route B had to clamp the editor's schema to match it,
 * and the formatting toolbar stayed at five verbs, because a button that writes syntax this cannot
 * draw ships literal `1.` onto a client's proposal.
 *
 * Asserted on the rendered markup rather than on text, because the distinction between "an ordered
 * list" and "a paragraph that begins with a number" is invisible in text.
 */

const html = (markdown: string) =>
  renderToStaticMarkup(createElement("div", null, renderLines(markdown, "t")));

describe("ordered lists", () => {
  it("renders as a real <ol>, not a paragraph starting with a number", () => {
    const out = html("1. One\n2. Two");

    expect(out).toContain("<ol");
    expect(out).toContain("<li>One</li>");
    expect(out).toContain("<li>Two</li>");
    // The defect: the marker used to survive as literal text in a plain span.
    expect(out).not.toContain("1. One");
    expect(out).not.toContain('<span class="block">');
  });

  it("keeps a list that does not start at 1", () => {
    // The editor stores what the author wrote. Renumbering from 1 here would be the renderer
    // disagreeing with the document — and it is the exact bug that was live in the editor.
    expect(html("100. Item\n101. Next")).toContain('start="100"');
    expect(html("1975. A good year")).toContain('start="1975"');
  });

  it("omits `start` when the list begins at 1", () => {
    // 1 is the HTML default; emitting it would be noise in every document.
    expect(html("1. One")).not.toContain("start=");
  });
});

describe("nested lists", () => {
  it("nests an indented list inside its parent item", () => {
    const out = html("- a\n  - nested");

    // One outer list containing an inner one — not two siblings, which is what indentation
    // being discarded produced.
    expect(out.match(/<ul/g) ?? []).toHaveLength(2);
    expect(out).toMatch(/<li>a<ul[^>]*><li>nested<\/li><\/ul><\/li>/);
  });

  it("handles more than two levels", () => {
    expect((html("- a\n  - b\n    - c").match(/<ul/g) ?? []).length).toBe(3);
  });

  it("closes back out when the indent decreases", () => {
    const out = html("- a\n  - b\n- c");

    expect((out.match(/<ul/g) ?? []).length).toBe(2);
    // `c` returns to the outer list rather than staying nested under `a`.
    expect(out).toMatch(/<\/ul><\/li><li>c<\/li>/);
  });
});

describe("what is NOT a list", () => {
  it("leaves a plain line alone", () => {
    expect(html("Plain line")).toBe('<div><span class="block">Plain line</span></div>');
  });

  it("needs the space after the marker", () => {
    // A hyphen that starts a line is often a negative number or an en-dashed aside, and a bare
    // `1.` with no space is a version or a decimal. `parseListLine` requires the trailing space.
    for (const md of ["-5 degrees", "1.5 million", "-not a bullet"]) {
      expect(html(md), md).toContain('<span class="block">');
      expect(html(md), md).not.toContain("<ul");
      expect(html(md), md).not.toContain("<ol");
    }
  });
});

describe("bullets are untouched", () => {
  it("renders exactly the classes it did before", () => {
    // ⚠️ The point of this assertion is what did NOT change. Routing fields through the shared
    // tree renderer initially added `text-[var(--text-2)]` to every bullet list in every existing
    // document, because that renderer applies a body scale its other caller wants. A colour change
    // across every document, arriving as a side effect of adding ordered lists.
    const out = html("- a\n- b");

    expect(out).toContain("doc-bullets");
    expect(out).toContain("my-1");
    expect(out).toContain("space-y-0.5");
    expect(out).not.toContain("text-[var(--text-2)]");
    expect(out).not.toContain("space-y-1 ");
  });

  it("still renders inline marks inside items", () => {
    expect(html("- **Discovery** — two weeks")).toContain("<strong");
  });
});
