/**
 * Markdown ⇄ ProseMirror document, over the TipTap StarterKit schema.
 *
 * Docs stores plain Markdown in every rich-text field and 19 files render it back out
 * (`renderLines`/`renderInline` in `src/lib/markdown.tsx`, plus `document-to-html.ts` for the Drive
 * backup and the PDF route, which renders the public page). Route B swaps the EDITOR for a real
 * one; it deliberately does not move the stored format, so none of those change. This module is
 * the whole seam: everything the editor knows how to do has to survive a trip out to Markdown and
 * back, byte for byte, or a document quietly degrades every time someone opens it.
 *
 * `src/lib/__tests__/markdown-roundtrip.test.tsx` is the contract. It was written against the
 * hand-rolled implementation FIRST, precisely so this one could be held to it rather than to
 * whatever it happens to do.
 *
 * ── Four choices that are load-bearing, each verified by deliberately breaking it ─────────
 *
 * `softbreak → hardBreak` — Docs treats a single newline inside a paragraph as a line break, and
 * that break survives a save today. Standard Markdown does not: a lone newline is a soft wrap that
 * collapses to a space. Without this mapping, "Line one\nLine two" comes back as one line and every
 * deliberate break in every existing document is destroyed on first edit.
 *
 * ⚠️ markdown-it's `breaks: true` option is the obvious way to express that and it is NOT used
 * here, because it does not work: with the `commonmark` preset a lone newline still arrives as a
 * `softbreak` token, so the mapping above is what actually carries it. Verified — removing the
 * mapping fails the corpus, removing `breaks: true` changed nothing at all. It was in the first
 * draft of this file with a comment claiming it was essential. Do not re-add it under that belief.
 *
 * The `entity` rule is DISABLED — markdown-it decodes HTML entities by default, so an author who
 * literally wrote `&amp;` would get `&` back. The stored text is not HTML; it is text that the
 * renderer escapes later.
 *
 * `html: false` — text that looks like markup (`Wrap it in a <div>`) stays text instead of becoming
 * a node. Same reasoning as `escapeHtml` in the outgoing implementation: the author's words must
 * not be eaten by a parser.
 *
 * `tightLists: true` — see `docToMarkdown` below.
 */

import { getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import MarkdownIt from "markdown-it";
import { MarkdownParser, MarkdownSerializer } from "prosemirror-markdown";

/** The editor's schema. Exported so the editor component and this module cannot drift apart. */
export const docSchema = getSchema([StarterKit]);

const markdownIt = MarkdownIt("commonmark", {
  html: false,
  linkify: false,
  typographer: false,
}).disable("entity");

const markdownParser = new MarkdownParser(docSchema, markdownIt, {
  paragraph: { block: "paragraph" },
  heading: { block: "heading", getAttrs: (token) => ({ level: Number(token.tag.slice(1)) }) },
  blockquote: { block: "blockquote" },
  bullet_list: { block: "bulletList" },
  ordered_list: { block: "orderedList" },
  list_item: { block: "listItem" },
  code_block: { block: "codeBlock", noCloseToken: true },
  fence: { block: "codeBlock", getAttrs: (token) => ({ language: token.info || null }), noCloseToken: true },
  hr: { node: "horizontalRule" },
  hardbreak: { node: "hardBreak" },
  // ⚠️ THIS is what preserves a single newline as a line break — not the `breaks` option. Under the
  // commonmark preset a lone newline arrives as `softbreak`, and Docs' stored format means a break
  // there, not a space. Removing this line fails the corpus.
  softbreak: { node: "hardBreak" },
  em: { mark: "italic" },
  strong: { mark: "bold" },
  s: { mark: "strike" },
  code_inline: { mark: "code", noCloseToken: true },
  link: {
    mark: "link",
    getAttrs: (token) => ({ href: token.attrGet("href"), title: token.attrGet("title") || null }),
  },
});

const markdownSerializer = new MarkdownSerializer(
  {
    paragraph(state, node) {
      state.renderInline(node);
      state.closeBlock(node);
    },
    heading(state, node) {
      state.write(`${"#".repeat(node.attrs.level as number)} `);
      state.renderInline(node);
      state.closeBlock(node);
    },
    blockquote(state, node) {
      state.wrapBlock("> ", null, node, () => state.renderContent(node));
    },
    // `- ` rather than `* `, because that is what every stored document already uses and what
    // `renderLines` matches on. A serialiser that emitted `* ` would rewrite every bullet in the
    // corpus on first save — technically equivalent Markdown, gratuitously noisy diff.
    bulletList(state, node) {
      state.renderList(node, "  ", () => "- ");
    },
    orderedList(state, node) {
      const start = (node.attrs.start as number | undefined) ?? 1;
      const maxWidth = String(start + node.childCount - 1).length;
      state.renderList(node, " ".repeat(maxWidth + 2), (i) => {
        const label = String(start + i);
        return `${label.padStart(maxWidth)}. `;
      });
    },
    listItem(state, node) {
      state.renderContent(node);
    },
    codeBlock(state, node) {
      state.write(`\`\`\`${(node.attrs.language as string) || ""}\n`);
      state.text(node.textContent, false);
      state.ensureNewLine();
      state.write("```");
      state.closeBlock(node);
    },
    horizontalRule(state, node) {
      state.write("---");
      state.closeBlock(node);
    },
    // A bare newline, NOT prosemirror-markdown's default `\\\n`. The stored format uses a plain
    // newline for a soft break and `renderLines` splits on it; a trailing backslash would render as
    // a literal backslash on the client's document.
    hardBreak(state) {
      state.write("\n");
    },
    text(state, node) {
      state.text(node.text ?? "");
    },
  },
  {
    bold: { open: "**", close: "**", mixable: true, expelEnclosingWhitespace: true },
    italic: { open: "*", close: "*", mixable: true, expelEnclosingWhitespace: true },
    strike: { open: "~~", close: "~~", mixable: true, expelEnclosingWhitespace: true },
    code: { open: "`", close: "`", escape: false },
    link: {
      open: "[",
      close: (_state, mark) => `](${mark.attrs.href as string})`,
    },
  },
);

/** Markdown → a document the editor can hold. */
export function markdownToDoc(markdown: string): ProseMirrorNode {
  return markdownParser.parse(markdown ?? "");
}

/** A document the editor holds → the Markdown that gets stored. */
export function docToMarkdown(doc: ProseMirrorNode): string {
  // ⚠️ `tightLists` is required, not cosmetic, and it is passed HERE rather than to the serializer
  // constructor because that is where the option is typed (it works in either place at runtime,
  // since `serialize` merges the constructor's options — but only this one type-checks).
  //
  // prosemirror-markdown defaults to LOOSE lists — a blank line between every item — and TipTap's
  // bulletList carries no `tight` attribute to override it. Loose output does not merely look
  // different: `renderLines` splits stored text on newlines and treats a blank line as a paragraph
  // break, so `- One\n\n- Two` renders as two separate one-item lists on the client's document.
  // Every list in the product would have been broken apart on first save. The corpus caught it on
  // the first run.
  //
  // `trim` because the serialiser closes the final block with a newline, and every stored value
  // ends at its last character.
  return markdownSerializer.serialize(doc, { tightLists: true }).trim();
}

/** The whole seam, in one call — used by the tests and by the editor on blur. */
export function roundTripMarkdown(markdown: string): string {
  return docToMarkdown(markdownToDoc(markdown));
}
