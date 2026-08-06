// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { htmlToMarkdown, markdownToHtml } from "@/lib/sections/rich-inline-editor";
import { renderLines } from "@/lib/markdown";

/**
 * The contract any replacement text engine has to satisfy.
 *
 * Route B swaps the hand-rolled Markdown/contenteditable layer for a real editor. Before that can
 * happen safely, the CURRENT behaviour has to be pinned down — otherwise "it still works" is an
 * opinion. Every rich-text field in Docs stores plain Markdown and round-trips it through
 * `markdownToHtml` (on mount) and `htmlToMarkdown` (on blur and after each formatting command), so
 * a document survives editing only if that pair is lossless for everything an author can write.
 *
 * This is a CHARACTERISATION suite: it records what the round trip does today, including where it
 * loses information. A lossy case documented here is a bug the replacement must fix, not a
 * behaviour it must copy — each one is marked.
 *
 * Two separate properties, and conflating them hides bugs:
 *   fidelity — markdown → html → markdown returns the input unchanged
 *   agreement — the renderer that draws the PUBLIC document understands everything the editor can
 *               write. `***bold-italic***` shipped once as literal asterisks on a client proposal
 *               because the toolbar could produce syntax `INLINE_RE` had no case for.
 */

/** markdown → DOM → markdown, exactly as the editor does it on blur. */
function roundTrip(markdown: string): string {
  const host = document.createElement("div");
  host.innerHTML = markdownToHtml(markdown);
  return htmlToMarkdown(host);
}

/** Everything the public renderer produces for this markdown, as plain text. */
function renderedText(markdown: string): string {
  // `renderLines` returns React nodes; walk them for their text so the assertion is about
  // information surviving, not about markup.
  const nodes = renderLines(markdown, "roundtrip");
  const walk = (node: unknown): string => {
    if (node === null || node === undefined || typeof node === "boolean") return "";
    if (typeof node === "string" || typeof node === "number") return String(node);
    if (Array.isArray(node)) return node.map(walk).join("");
    const el = node as { props?: { children?: unknown } };
    return el.props ? walk(el.props.children) : "";
  };
  return walk(nodes);
}

const CORPUS: Array<{ name: string; markdown: string }> = [
  { name: "a plain sentence", markdown: "We will deliver the platform in three phases." },
  { name: "two paragraphs", markdown: "First paragraph.\n\nSecond paragraph." },
  { name: "bold", markdown: "The **discovery phase** sets the scope." },
  { name: "italic", markdown: "This is *indicative* only." },
  { name: "inline code", markdown: "Set `DATABASE_URL` before the first run." },
  { name: "a link", markdown: "See [the brief](https://gitwork.co.uk/brief) for detail." },
  { name: "bold inside a sentence with punctuation", markdown: "Total: **£24,000** (ex. VAT)." },
  { name: "a bullet list", markdown: "- Discovery\n- Build\n- Handover" },
  { name: "a bullet list with formatting", markdown: "- **Discovery** — two weeks\n- *Build* — six weeks" },
  { name: "paragraph then list", markdown: "The phases are:\n\n- Discovery\n- Build" },
  { name: "list then paragraph", markdown: "- Discovery\n- Build\n\nEach phase ends with a review." },
  { name: "several marks in one line", markdown: "Use **bold**, *italic* and `code` together." },
  { name: "an ampersand", markdown: "Design & build, end to end." },
  { name: "a less-than sign", markdown: "Response time < 200ms at p95." },
  // ⚠️ The two above do NOT exercise escaping: a bare `&` is not a valid entity and `< 2` is not
  // a valid tag start, so both survive even with escapeHtml removed — verified by deleting it and
  // watching the suite stay green. These do exercise it. Text that LOOKS like markup is the whole
  // risk: unescaped, the parser eats it and the author's words vanish from their own document.
  { name: "text containing a tag name", markdown: "Wrap it in a <div> before shipping." },
  { name: "text containing an entity", markdown: "Use &amp; in the template, not a bare one." },
  { name: "comparison operators either side", markdown: "Valid when 5 < x && x > 2." },
  { name: "adjacent marks", markdown: "**Bold***italic*" },
  // A soft break survives as a <br> and comes back as a newline. I expected this to be lossy and
  // it is not — worth an explicit case, because it is the behaviour a replacement could easily
  // regress by normalising every break to a paragraph.
  { name: "a soft line break inside a paragraph", markdown: "Line one\nLine two" },
];

describe("markdown survives a round trip through the editor", () => {
  for (const { name, markdown } of CORPUS) {
    it(name, () => {
      expect(roundTrip(markdown)).toBe(markdown);
    });
  }
});

describe("the public renderer understands everything the editor can write", () => {
  for (const { name, markdown } of CORPUS) {
    it(name, () => {
      // Not a markup assertion — just that no marker leaks through as literal punctuation, which
      // is what a client actually sees when the two sides disagree.
      const text = renderedText(markdown);
      expect(text, `${name}: markers leaked into the rendered output`).not.toMatch(/\*\*|`|\]\(/);
    });
  }
});

/**
 * ⚠️ Known lossy cases — the replacement engine must FIX these, not reproduce them.
 *
 * Each is asserted as it behaves today so the suite is honest and stays green; when TipTap lands,
 * these flip to the correct expectation and the assertion below them stops being needed.
 */
describe("known losses in the current round trip", () => {
  it("bold-italic: documented as a real risk, since the toolbar can produce it", () => {
    // `applyInline` nests <strong><em>, which serialises to ***x***. The renderer learned this
    // case (CLAUDE.md §"formatting toggles off"), so this should survive. If it ever stops
    // surviving, a client document gets literal asterisks again.
    expect(roundTrip("***Critical***")).toBe("***Critical***");
    expect(renderedText("***Critical***")).not.toContain("*");
  });

  it("underscore italic is normalised to asterisk italic", () => {
    // Not information loss — `_x_` and `*x*` mean the same thing — but an author who typed
    // underscores gets asterisks back. Recorded so the change is a decision, not a surprise.
    expect(roundTrip("_indicative_")).toBe("*indicative*");
  });

  it("leading and trailing whitespace on a paragraph is trimmed", () => {
    expect(roundTrip("  padded  ")).toBe("padded");
  });

  it("an empty paragraph between blocks is dropped", () => {
    expect(roundTrip("One\n\n\n\nTwo")).toBe("One\n\nTwo");
  });
});

/**
 * Paste is where a hand-rolled serialiser fails hardest, and it is unguarded today: an author
 * pasting from Word or Google Docs pastes THEIR HTML into the contenteditable, and whatever
 * `htmlToMarkdown` does not understand is silently dropped on the next blur.
 *
 * These record what survives now. They are the acceptance bar for the replacement — a real engine
 * sanitises paste against a schema instead of discarding by omission.
 */
describe("pasted HTML", () => {
  const paste = (html: string) => {
    const host = document.createElement("div");
    host.innerHTML = html;
    return htmlToMarkdown(host);
  };

  it("keeps the marks it knows", () => {
    expect(paste("<div><strong>Bold</strong> and <em>italic</em></div>")).toBe("**Bold** and *italic*");
  });

  it("keeps <b> and <i> from a word processor", () => {
    // Word and Google Docs emit these rather than strong/em.
    expect(paste("<div><b>Bold</b> and <i>italic</i></div>")).toBe("**Bold** and *italic*");
  });

  it("flattens a heading to a plain paragraph — the heading level is lost", () => {
    expect(paste("<h2>Scope of work</h2>")).toBe("Scope of work");
  });

  it("drops a table entirely except its text", () => {
    // A pasted pricing table becomes an unreadable run of words. This is the single worst paste
    // outcome today and the clearest argument for a schema-backed engine.
    const result = paste("<table><tr><td>Discovery</td><td>£4,000</td></tr></table>");
    expect(result).not.toContain("|");
    expect(result).toContain("Discovery");
  });

  it("drops Google Docs' span styling, keeping only the text", () => {
    expect(paste('<div><span style="font-weight:700">Heavy</span></div>')).toBe("Heavy");
  });

  it("keeps a link's href", () => {
    expect(paste('<div><a href="https://example.com">Brief</a></div>')).toBe(
      "[Brief](https://example.com)",
    );
  });
});
