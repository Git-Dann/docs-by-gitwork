import { describe, expect, it } from "vitest";
import { MARKDOWN_CORPUS } from "@/lib/__tests__/markdown-corpus";
import { docToMarkdown, markdownToDoc, roundTripMarkdown } from "@/lib/sections/markdown-doc";

/**
 * The replacement engine, held to the contract the outgoing one was measured against.
 *
 * Docs stores plain Markdown and 19 files render it back out, so Route B deliberately does not move
 * the stored format. That makes this the single property the whole migration rests on: everything
 * the editor can hold must survive a trip out to Markdown and back, unchanged. If it does not, a
 * document degrades a little every time someone opens it — silently, and in the client's copy.
 *
 * Same corpus as `markdown-roundtrip.test.tsx`, imported rather than copied: a replacement that
 * gets its own fixtures can pass its own test and still ruin the product.
 */

describe("markdown survives a round trip through the TipTap document", () => {
  for (const { name, markdown } of MARKDOWN_CORPUS) {
    it(name, () => {
      expect(roundTripMarkdown(markdown)).toBe(markdown);
    });
  }
});

describe("the document model is real, not a string wrapper", () => {
  it("parses a bullet list into list nodes", () => {
    const doc = markdownToDoc("- Discovery\n- Build");
    const list = doc.firstChild;
    expect(list?.type.name).toBe("bulletList");
    expect(list?.childCount).toBe(2);
    expect(list?.firstChild?.type.name).toBe("listItem");
  });

  it("parses marks as marks, not as literal characters", () => {
    const doc = markdownToDoc("The **discovery phase** sets the scope.");
    const marks = new Set<string>();
    doc.descendants((node) => {
      node.marks.forEach((mark) => marks.add(mark.type.name));
    });
    expect(marks.has("bold")).toBe(true);
    // The asterisks must NOT survive as text — that is the whole defect being fixed.
    expect(doc.textContent).not.toContain("*");
  });

  it("keeps a link's href on the mark", () => {
    const doc = markdownToDoc("See [the brief](https://gitwork.co.uk/brief) for detail.");
    let href: string | null = null;
    doc.descendants((node) => {
      const link = node.marks.find((mark) => mark.type.name === "link");
      if (link) href = link.attrs.href as string;
    });
    expect(href).toBe("https://gitwork.co.uk/brief");
  });

  it("treats a single newline as a line break, not a space", () => {
    // Standard Markdown collapses a lone newline to a space. Docs does not, and every existing
    // document depends on that — hence `breaks: true`.
    const doc = markdownToDoc("Line one\nLine two");
    expect(doc.childCount).toBe(1);
    let breaks = 0;
    doc.descendants((node) => {
      if (node.type.name === "hardBreak") breaks += 1;
    });
    expect(breaks).toBe(1);
  });

  it("does not decode HTML entities in stored text", () => {
    // The stored value is text, not HTML — the renderer escapes later. Decoding here would turn an
    // author's literal `&amp;` into `&`.
    expect(markdownToDoc("Use &amp; in the template.").textContent).toContain("&amp;");
  });

  it("does not let text that looks like markup become a node", () => {
    const doc = markdownToDoc("Wrap it in a <div> before shipping.");
    expect(doc.textContent).toContain("<div>");
  });
});

describe("bullets serialise the way the stored documents already write them", () => {
  it("uses `- `, not `* `", () => {
    // Equivalent Markdown, but `renderLines` matches on it and every stored document uses it.
    // Emitting `* ` would rewrite every bullet in the product on first save.
    expect(roundTripMarkdown("- Discovery")).toBe("- Discovery");
    expect(docToMarkdown(markdownToDoc("- One\n- Two"))).not.toContain("* ");
  });
});
