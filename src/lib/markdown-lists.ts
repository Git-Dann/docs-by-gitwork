/**
 * How a Markdown list is READ — shared by every renderer that draws one.
 *
 * Docs has three renderers and they must not disagree about structure:
 *
 *   `renderLines` / `renderBlock`  (`src/lib/markdown.tsx`)   → the editor canvas, the public
 *                                                               `/docs/[token]` page, print, PDF
 *   `markdownToHtml`               (`src/server/document-to-html.ts`) → the Google Drive backup
 *
 * They legitimately differ in OUTPUT — one builds React nodes, one builds an HTML string, and the
 * server one must not import the client renderer. They must not differ in what they think a list
 * IS. That divergence is not hypothetical: `markdownToHtml` understood ordered lists while
 * `renderLines` drew them as literal text, so for months a `1. One` list was a real ordered list in
 * the client's Drive copy and a paragraph beginning with "1." on the page they actually read.
 *
 * So parsing and nesting live here, once, with no framework imports. Each renderer walks the tree.
 */

/**
 * Leading indentation of a line, in "columns". A tab counts as 2 columns so a tab-indented list
 * nests the same as a 2-space-indented one (the two are mixed freely in pasted content).
 */
function leadingIndent(line: string): number {
  let columns = 0;
  for (const char of line) {
    if (char === " ") columns += 1;
    else if (char === "\t") columns += 2;
    else break;
  }
  return columns;
}

export type ParsedListLine = { indent: number; ordered: boolean; text: string; start?: number };

/**
 * A single list line → its depth, kind and text. Null when the line isn't a list item at all.
 *
 * ⚠️ The trailing space after the marker is REQUIRED, and that requirement is the whole rule that
 * keeps ordinary prose out of lists: `-5 degrees` is a negative number and `1.5 million` is a
 * decimal, and neither becomes a bullet.
 *
 * "1975. A good year" DOES become an ordered list at `start="1975"`, because the space is there.
 * That is CommonMark's reading and — the reason it is settled this way rather than special-cased —
 * it is markdown-it's, which is what the EDITOR parses with (`src/lib/sections/markdown-doc.ts`).
 * Treating it as a paragraph here would put the renderer and the editor back out of step, which is
 * the exact class of bug this module exists to prevent. Ambiguous input, resolved identically on
 * both sides.
 */
export function parseListLine(line: string): ParsedListLine | null {
  const unordered = /^\s*[-*]\s+(.*)$/.exec(line);
  if (unordered) return { indent: leadingIndent(line), ordered: false, text: unordered[1] };
  const ordered = /^\s*(\d+)\.\s+(.*)$/.exec(line);
  // The number is captured, not discarded: a list can legitimately start anywhere, and the
  // editor stores what the author wrote. Drawing `1.` for a list stored as `100.` would be the
  // renderer disagreeing with the document.
  if (ordered) {
    return {
      indent: leadingIndent(line),
      ordered: true,
      text: ordered[2],
      start: Number(ordered[1]),
    };
  }
  return null;
}

export type ListTree = {
  ordered: boolean;
  /** First number of an ordered list. Undefined for bullets, and for `1.` where it is implied. */
  start?: number;
  items: Array<{ text: string; child: ListTree | null }>;
};

/**
 * Build a nested list tree from flat lines, using INDENTATION as the only depth signal: a line
 * indented further than the one before it opens a nested list under that previous item; a line
 * indented less closes back out to the matching level. Depth is unlimited, so ≥2 levels work.
 */
export function buildListTree(lines: ParsedListLine[]): ListTree {
  const root: ListTree = { ordered: lines[0].ordered, start: lines[0].start, items: [] };
  // Stack of open lists, each remembering the indentation its own items sit at.
  const open: Array<{ indent: number; list: ListTree }> = [{ indent: lines[0].indent, list: root }];

  for (const line of lines) {
    while (open.length > 1 && line.indent < open[open.length - 1].indent) open.pop();
    let top = open[open.length - 1];
    if (line.indent > top.indent && top.list.items.length > 0) {
      const parent = top.list.items[top.list.items.length - 1];
      // A parent may already own a nested list (indent out, then back in) — append to it.
      if (!parent.child) parent.child = { ordered: line.ordered, start: line.start, items: [] };
      open.push({ indent: line.indent, list: parent.child });
      top = open[open.length - 1];
    }
    top.list.items.push({ text: line.text, child: null });
  }
  return root;
}

/** `start` as an attribute value — omitted at 1, which is the HTML default. */
export function listStartAttr(list: ListTree): number | undefined {
  return list.start && list.start !== 1 ? list.start : undefined;
}
