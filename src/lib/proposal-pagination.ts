/**
 * Deterministic, author-driven pagination for the A4 "paged" document renderer.
 *
 * Splits sections into pages using only explicit markers the author placed —
 * a `cover` section always starts (and is alone on) its own page, and a
 * `divider` section with `variant: "page-break"` forces everything after it
 * onto a new page. There is no height measurement or overflow guessing here:
 * a page is exactly what the author put on it, so the builder, the print
 * view, and the client-facing share page always agree on where pages break.
 */

import type { ProposalSection } from "@/types/proposal";

export function paginateSections(sections: ProposalSection[]): ProposalSection[][] {
  const pages: ProposalSection[][] = [[]];

  for (const section of sections) {
    const isCover = section.key === "cover";
    const isPageBreak =
      section.key === "divider" &&
      (section.data as { variant?: string } | undefined)?.variant === "page-break";

    if (isPageBreak) {
      // The divider is a break marker, not rendered content, in paged mode —
      // the page boundary itself communicates the break.
      if (pages[pages.length - 1].length > 0) pages.push([]);
      continue;
    }

    if (isCover) {
      if (pages[pages.length - 1].length > 0) pages.push([]);
      pages[pages.length - 1].push(section);
      pages.push([]); // whatever follows the cover always starts fresh
      continue;
    }

    pages[pages.length - 1].push(section);
  }

  if (pages[pages.length - 1].length === 0) pages.pop();
  return pages;
}
