import { describe, expect, it } from "vitest";
import { MARKDOWN_CORPUS } from "@/lib/__tests__/markdown-corpus";
import { renderLines } from "@/lib/markdown";
import { docSchema, docToMarkdown, markdownToDoc, roundTripMarkdown } from "@/lib/sections/markdown-doc";

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

/**
 * The editor cannot express more than the client renderer can draw.
 *
 * `renderLines` understands a paragraph, lists — bulleted, numbered and nested — and the inline
 * marks in `INLINE_RE`. Everything else it prints verbatim, so a schema wider than that is a defect
 * generator: an author presses a button, sees a heading in the editor, and ships `## Scope of work`
 * as literal text on a client proposal. `***bold-italic***` already did exactly that once.
 *
 * ⚠️ The list half of this boundary MOVED, on purpose. It used to read "a FLAT bullet list", and
 * these assertions said ordered lists were retained only so nothing threw. `renderLines` now draws
 * ordered and nested lists (`render-lines-lists.test.tsx`), the Drive renderer agrees with it
 * (`renderer-agreement.test.tsx`), and the toolbar offers a numbered-list command. So the schema
 * opened up in the same change — which is what this comment always said would happen, rather than
 * the assertions being quietly relaxed to make something pass.
 *
 * Headings, blockquotes, code blocks and horizontal rules did NOT move and are still the tripwire.
 */
describe("the schema is bounded by what the renderer supports", () => {
  const UNRENDERABLE = ["heading", "blockquote", "codeBlock", "horizontalRule"] as const;

  for (const node of UNRENDERABLE) {
    it(`has no ${node} node`, () => {
      expect(Object.keys(docSchema.nodes)).not.toContain(node);
    });
  }

  for (const mark of ["strike", "underline"] as const) {
    it(`has no ${mark} mark`, () => {
      expect(Object.keys(docSchema.marks)).not.toContain(mark);
    });
  }

  it("keeps everything the renderer DOES draw", () => {
    expect(Object.keys(docSchema.nodes)).toEqual(
      expect.arrayContaining([
        "paragraph",
        "text",
        "hardBreak",
        "bulletList",
        "orderedList",
        "listItem",
      ]),
    );
    expect(Object.keys(docSchema.marks)).toEqual(
      expect.arrayContaining(["bold", "italic", "code", "link"]),
    );
  });

  // `orderedList` used to be in the schema with NO command offering it — retained only so
  // pre-existing `1. ` content could not crash the editor — which made it the one construct where
  // the editor could show more than the client saw. That is closed, and it is asserted where it can
  // actually fail: `rich-text-field.test.tsx` presses the real Numbered list button and checks the
  // Markdown that comes out. A membership check on a constant here could not tell the two apart.
});

/**
 * ⚠️ The property that matters most in this file.
 *
 * Removing the unrenderable nodes from the schema was not enough: markdown-it still EMITTED their
 * tokens, and prosemirror-markdown throws on a token type it has no rule for. So the first cut of
 * the constraint meant any stored document containing `## x`, `> x`, `1. x` or a code fence in a
 * prose field CRASHED the editor the moment someone opened it — strictly worse than the literal
 * syntax it was trying to prevent. The rules are disabled at source now, so the tokens never
 * appear, and each construct degrades exactly the way `renderLines` already draws it.
 *
 * A crash here is not a formatting nit; it is a document nobody can open.
 */
describe("no stored content can crash the editor", () => {
  const REAL_WORLD = [
    "## Scope of work",
    "### Deliverables",
    "Setext heading\n===",
    "> A quote from the client",
    "1. One\n2. Two",
    "```\nconst x = 1;\n```",
    "    indented code",
    "---",
    "~~struck~~",
    "<div>raw html</div>",
    "| a | b |\n| - | - |",
    "![alt](https://example.com/i.png)",
    "",
    "   ",
  ];

  for (const md of REAL_WORLD) {
    it(`parses ${JSON.stringify(md)} without throwing`, () => {
      expect(() => roundTripMarkdown(md)).not.toThrow();
    });
  }

  it("keeps the author's words when it cannot keep the structure", () => {
    // Degrading to literal syntax is acceptable — it is what the client renderer already shows.
    // Dropping the line is not.
    expect(markdownToDoc("## Scope of work").textContent).toContain("Scope of work");
    expect(markdownToDoc("> A quote").textContent).toContain("A quote");
    expect(markdownToDoc("```\ncode\n```").textContent).toContain("code");
  });

  it("round-trips an ordered list rather than mangling it", () => {
    // No command offers it, but pre-existing content has it. Rewriting `1.` to `-` would be
    // silent data modification, which is worse than a construct the renderer draws literally.
    expect(roundTripMarkdown("1. One\n2. Two")).toBe("1. One\n2. Two");
  });
});

/**
 * ⚠️ One known difference from the outgoing engine, recorded rather than hidden.
 *
 * A markdown IMAGE inside a prose field (`![alt](url)`) round-tripped unchanged through the old
 * engine. Through this one it comes back as `\![alt](url)` — prosemirror-markdown escapes a `!`
 * that directly precedes a link so it cannot re-parse as an image.
 *
 * Kept deliberately, because the alternative was worse. Leaving markdown-it's `image` rule on
 * threw outright ("Token type `image` not supported"), which meant a document containing one
 * could not be OPENED. `ignore: true` on the token would drop the alt text entirely. So the
 * choice was: crash, silently lose the author's words, or add one backslash to a construct the
 * client renderer never drew as an image anyway (`INLINE_RE` has no image case — it renders a
 * stray `!` followed by a link, with or without the escape).
 *
 * The clean fix is an Image node in the schema serialising back to `![alt](url)`, which needs
 * `@tiptap/extension-image` and only pays off once `renderLines` can draw one. Images have their
 * own block type in Docs, so a markdown image inside a prose field is already an odd case.
 */
describe("known difference: a markdown image in a prose field", () => {
  it("gains an escaping backslash rather than crashing or vanishing", () => {
    expect(roundTripMarkdown("![alt](https://example.com/i.png)")).toBe(
      "\\![alt](https://example.com/i.png)",
    );
  });

  it("still keeps the alt text and the URL", () => {
    // The part that actually matters: nothing the author wrote is lost.
    const out = roundTripMarkdown("![alt](https://example.com/i.png)");
    expect(out).toContain("alt");
    expect(out).toContain("https://example.com/i.png");
  });
});

/**
 * Renderer agreement — moved here from `markdown-roundtrip.test.tsx` when the old engine was
 * deleted, because the property belongs to the FORMAT, not to whichever editor is writing it.
 *
 * The renderer that draws the client's document has to understand everything the editor can
 * produce. `***bold-italic***` shipped once as literal asterisks on a client proposal because the
 * toolbar could write syntax `INLINE_RE` had no case for — that is what this catches.
 */
describe("the client renderer understands everything the editor can write", () => {
  const text = (markdown: string): string => {
    const walk = (node: unknown): string => {
      if (node === null || node === undefined || typeof node === "boolean") return "";
      if (typeof node === "string" || typeof node === "number") return String(node);
      if (Array.isArray(node)) return node.map(walk).join("");
      const el = node as { props?: { children?: unknown } };
      return el.props ? walk(el.props.children) : "";
    };
    return walk(renderLines(markdown, "agreement"));
  };

  for (const { name, markdown } of MARKDOWN_CORPUS) {
    it(name, () => {
      // Not a markup assertion — just that no marker leaks through as literal punctuation, which
      // is what a client actually sees when the two sides disagree.
      expect(text(markdown), `${name}: markers leaked into the rendered output`).not.toMatch(
        /\*\*|`|\]\(/,
      );
    });
  }

  it("agrees on bold-italic, the case that actually shipped broken", () => {
    expect(roundTripMarkdown("***Critical***")).toBe("***Critical***");
    expect(text("***Critical***")).not.toContain("*");
  });
});
