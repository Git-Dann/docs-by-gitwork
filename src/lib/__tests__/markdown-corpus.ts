/**
 * The Markdown corpus, shared by the outgoing hand-rolled engine and the incoming TipTap one.
 *
 * Deliberately one list rather than two. The whole point of writing the contract before swapping
 * the engine is that both are held to the SAME cases; a replacement that gets its own fixtures can
 * pass its own test and still degrade every document in the product.
 *
 * Not a test file itself — vitest only collects `*.test.ts`/`*.spec.ts`.
 */

export interface MarkdownCase {
  name: string;
  markdown: string;
}

export const MARKDOWN_CORPUS: MarkdownCase[] = [
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
  // ⚠️ The two above do NOT exercise escaping: a bare `&` is not a valid entity and `< 2` is not a
  // valid tag start, so both survive even with escaping removed entirely — verified by deleting it
  // and watching the suite stay green. These do exercise it. Text that LOOKS like markup is the
  // whole risk: unescaped, the parser eats it and the author's words vanish from their document.
  { name: "text containing a tag name", markdown: "Wrap it in a <div> before shipping." },
  { name: "text containing an entity", markdown: "Use &amp; in the template, not a bare one." },
  { name: "comparison operators either side", markdown: "Valid when 5 < x && x > 2." },
  { name: "adjacent marks", markdown: "**Bold***italic*" },
  // A soft break survives as a <br> and comes back as a newline. I expected this to be lossy and it
  // is not — worth an explicit case, because it is the behaviour a replacement could easily regress
  // by normalising every break to a paragraph.
  { name: "a soft line break inside a paragraph", markdown: "Line one\nLine two" },
];
