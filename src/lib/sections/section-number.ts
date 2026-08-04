/**
 * The document's gutter-number rule (the accent-mono `01` beside a section title — DESIGN.md
 * "Document Render → Numbering & bullets"). Kept as a PURE module, with no React and no section
 * registry import, so the rule itself is unit-testable and can't drift silently.
 *
 * THE RULE, in one sentence: if any visible block authors a `clauseSection`, the document is
 * clause-numbered and the gutter number comes from THAT value — never from the block's position;
 * otherwise the document falls back to the original positional numbering.
 *
 * Why: the number used to be a positional ordinal over visible shell-rendered blocks, which meant
 * (a) `callout` / `parties` / `signatures` blocks were handed clause numbers they have no business
 * carrying, and (b) clause sections were forced to be consecutive — a callout dropped mid-contract
 * renumbered every heading below it, so a heading printed `07` above clauses numbered `6.1–6.4`
 * and in-text cross-references ("see clause 7.2") pointed at the wrong heading.
 *
 * Consequences of the rule, both deliberate:
 * - In a clause-numbered document, anything that does NOT author a `clauseSection` renders with no
 *   gutter number at all — callouts, parties, signatures, dividers, the cover, and any prose block
 *   the author hasn't given a clause number. A block's number is authored, never inferred.
 * - Documents that don't use clause numbering (proposals, reports, briefs — nothing authors a
 *   `clauseSection`) keep the original sequential numbering over visible shell-rendered blocks, so
 *   nothing there regresses.
 */

import type { DocumentType, ProposalSection } from "@/types/proposal";

/**
 * Contract-style documents carry house clause numbering, so their sections get an accent-mono
 * `01` / `02` gutter number. Proposals, reports, briefs, handovers and decks do NOT — they read as
 * editorial documents and a numbered section would be noise.
 */
export const NUMBERED_DOC_TYPES = new Set<DocumentType>(["SLA", "SOW", "MSA", "NDA", "CO", "DSA"]);

/** Stable identity for a section, matching the selection id used by the canvas. */
export function sectionRef(section: ProposalSection): string {
  return section.id ?? section.key;
}

/**
 * The clause section this block authors (`ProseSectionData.clauseSection`), trimmed, or null.
 * Read off the loose `data` payload rather than narrowed to `prose`, so any block type that opts
 * into the clause spine is numbered from what it authored.
 */
export function authoredClauseSection(section: ProposalSection): string | null {
  const raw = (section.data as { clauseSection?: unknown } | undefined)?.clauseSection;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed ? trimmed : null;
}

/** True when any VISIBLE block authors a clause section — i.e. the document is clause-numbered. */
export function usesClauseNumbering(sections: readonly ProposalSection[]): boolean {
  return sections.some((entry) => entry.isVisible && authoredClauseSection(entry) !== null);
}

/**
 * The gutter number for `section`, or null when it should carry none.
 *
 * `isShellRendered` reports whether a block renders inside the standard section shell — injected by
 * the caller (from the section registry) so this module stays free of React/registry imports. Only
 * used by the positional fallback, which is what the pre-clause behaviour counted.
 */
export function resolveSectionNumber({
  documentType,
  sections,
  section,
  isShellRendered,
}: {
  documentType: DocumentType;
  sections: readonly ProposalSection[];
  section: ProposalSection;
  isShellRendered: (section: ProposalSection) => boolean;
}): string | null {
  if (!NUMBERED_DOC_TYPES.has(documentType)) return null;

  // Clause-numbered document: the number is the block's own authored clause section, zero-padded
  // to two digits (so `7` prints `07` above clauses `7.1…`, and `10` stays `10`). A block that
  // authors nothing is off the numbered spine and gets no number.
  if (usesClauseNumbering(sections)) {
    if (!section.isVisible) return null;
    const authored = authoredClauseSection(section);
    return authored ? authored.padStart(2, "0") : null;
  }

  // Fallback (unchanged): position among the visible, shell-rendered blocks, continuous across the
  // whole document. Derived on every render, so inserting or hiding a block renumbers for free.
  const target = sectionRef(section);
  let ordinal = 0;
  for (const entry of sections) {
    if (!entry.isVisible) continue;
    if (!isShellRendered(entry)) continue;
    ordinal += 1;
    if (sectionRef(entry) === target) return String(ordinal).padStart(2, "0");
  }
  return null;
}
