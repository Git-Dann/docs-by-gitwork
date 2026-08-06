/**
 * The cover's `INSIDE` contents list — what the document contains, on its front page.
 *
 * ⚠️ **Derived at render, never stored.** This is the whole design decision, and it is the one to
 * preserve if this is ever refactored. A stored copy of the block names would be correct exactly
 * once: rename a block, add one, hide one, or reorder them, and the cover would keep advertising
 * the old contents to a client while the document said something else. A contents page that
 * disagrees with the document is worse than no contents page, because a reader trusts it.
 *
 * It is the same reasoning that made `Countermark` snapshot its clauses and `OnboardingForm`
 * snapshot its structure — and the opposite conclusion, for the opposite reason. Those freeze
 * because they are a record of what was true at a moment. This one must track the live document,
 * because it is a description of the very page it is printed on.
 */

import type { ProposalSection } from "@/types/proposal";

/**
 * Blocks that are furniture rather than content.
 *
 * `cover` obviously — a contents list that lists itself is a bug. `divider` draws a rule, a spacer
 * or a page break (all three are variants of the one block, which is why there is no separate
 * `page_break` key): it carries a title so a builder can find it in the outline, but a reader
 * scanning "what is in this document" is not looking for "Divider".
 */
const NOT_CONTENT: ReadonlySet<string> = new Set(["cover", "divider"]);

export interface CoverContentsEntry {
  /** 1-based position, formatted by the renderer as `01`, `02`, … */
  number: number;
  title: string;
}

/**
 * The visible, reader-facing blocks in document order.
 *
 * Numbering is over the ENTRIES, not the sections — so hiding a block renumbers the list rather
 * than leaving a gap at `04`. A gap reads as a missing page to anyone who did not author the
 * document, which is precisely the audience a cover is for.
 */
export function coverContentsEntries(sections: ProposalSection[]): CoverContentsEntry[] {
  return sections
    .filter((section) => section.isVisible)
    .filter((section) => !NOT_CONTENT.has(section.key))
    .map((section) => section.title?.trim() ?? "")
    // An untitled block cannot be listed — there is nothing to print, and "Untitled" on a client's
    // cover is worse than the block simply not appearing.
    .filter((title) => title.length > 0)
    .map((title, index) => ({ number: index + 1, title }));
}

/**
 * Is the contents list shown?
 *
 * Default is BY DOCUMENT TYPE, not a blanket on/off: a proposal is a document someone reads front
 * to back and wants to navigate, so it defaults on. A one-page NDA or change order listing its own
 * clauses on the front is noise. An explicit stored value always wins, so turning it off on a
 * proposal sticks.
 */
export function coverContentsEnabled(
  showContents: boolean | undefined,
  documentType: string | undefined,
): boolean {
  if (typeof showContents === "boolean") return showContents;
  return documentType === "PROPOSAL";
}
