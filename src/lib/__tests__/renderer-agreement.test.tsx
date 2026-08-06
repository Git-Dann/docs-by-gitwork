// @vitest-environment jsdom
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { renderLines } from "@/lib/markdown";
import { markdownToHtml } from "@/server/document-to-html";
import { MARKDOWN_CORPUS } from "./markdown-corpus";

/**
 * The two renderers must agree about STRUCTURE.
 *
 * One document is drawn by two different pieces of code. `renderLines` draws the editor canvas,
 * the public `/docs/[token]` page, the print view and the PDF; `markdownToHtml` draws the Google
 * Drive backup. They produce different output on purpose — React nodes with Tailwind classes vs a
 * plain semantic string Google Docs can import — and that difference is precisely what let them
 * drift apart without anyone noticing.
 *
 * They HAD drifted: `markdownToHtml` emitted `<ol>` for a numbered list while `renderLines` drew it
 * as a paragraph beginning with a literal "1.". Same document, same field, two different readings —
 * and the one the client actually read was the wrong one. This is the test that would have caught
 * it, and it is the reason the parse and the nesting now live in one shared module rather than
 * being written twice.
 *
 * Asserted on the TAG SEQUENCE, not on the markup: classes, keys and attributes are allowed to
 * differ, because that is the whole point of having two renderers.
 */

const clientHtml = (markdown: string) =>
  renderToStaticMarkup(createElement("div", null, renderLines(markdown, "agree")));

/** Just the list-structural tags, in document order: `ul ol/2 li li /ol /ul`-ish. */
const listShape = (html: string) =>
  (html.match(/<\/?(?:ul|ol|li)\b[^>]*>/g) ?? []).map((tag) => {
    const name = /^<\/?(\w+)/.exec(tag)?.[1] ?? "";
    if (tag.startsWith("</")) return `/${name}`;
    const start = /\bstart="(\d+)"/.exec(tag)?.[1];
    return start ? `${name}:${start}` : name;
  });

describe("both renderers read the same document the same way", () => {
  for (const { name, markdown } of MARKDOWN_CORPUS) {
    it(name, () => {
      expect(listShape(clientHtml(markdown)), `${name}: the two renderers disagree`).toEqual(
        listShape(markdownToHtml(markdown)),
      );
    });
  }
});

describe("the specific disagreements that were live", () => {
  it("both draw an ordered list, not a numbered paragraph", () => {
    // The one that shipped: real `<ol>` in the client's Drive copy, literal "1." on their page.
    for (const html of [clientHtml("1. One\n2. Two"), markdownToHtml("1. One\n2. Two")]) {
      expect(html).toContain("<ol");
      expect(html).not.toContain("1. One");
    }
  });

  it("both keep a list that does not start at 1", () => {
    expect(clientHtml("100. Item\n101. Next")).toContain('start="100"');
    expect(markdownToHtml("100. Item\n101. Next")).toContain('start="100"');
  });

  it("both nest, and both nest INSIDE the parent <li>", () => {
    // Placement is not cosmetic on the Drive side: a `<ul>` between two `<li>`s rather than inside
    // one imports into Google Docs as a second flat list, losing the indent level.
    expect(clientHtml("- a\n  - nested")).toMatch(/<li>a<ul[^>]*><li>nested<\/li><\/ul><\/li>/);
    expect(markdownToHtml("- a\n  - nested")).toContain("<li>a<ul><li>nested</li></ul></li>");
  });

  it("both handle a nested list of a different kind from its parent", () => {
    // The Drive renderer used to test all-bullets OR all-numbers, so this block matched neither
    // and fell through to a paragraph — markers and all — while the page rendered it correctly.
    const md = "- Phase one\n  1. Discovery\n  2. Audit";
    expect(markdownToHtml(md)).not.toContain("<p>");
    expect(listShape(markdownToHtml(md))).toEqual(listShape(clientHtml(md)));
  });

  it("both leave a line that only looks like a list alone", () => {
    for (const md of ["-5 degrees", "1.5 million"]) {
      expect(listShape(clientHtml(md)), md).toEqual([]);
      expect(listShape(markdownToHtml(md)), md).toEqual([]);
    }
  });
});
