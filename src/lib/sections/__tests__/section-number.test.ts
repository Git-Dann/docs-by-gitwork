/**
 * Drift guard for the document gutter-number rule (`src/lib/sections/section-number.ts`).
 *
 * The bug this exists to prevent: the number used to be a POSITIONAL ordinal, so a callout dropped
 * mid-contract renumbered every heading below it (a heading printing `07` above clauses `6.1–6.4`)
 * and non-clause blocks — callout / parties / signatures — were handed clause numbers.
 */

import { describe, expect, it } from "vitest";
import {
  authoredClauseSection,
  resolveSectionNumber,
  usesClauseNumbering,
} from "@/lib/sections/section-number";
import type { DocumentType, ProposalSection, ProposalSectionData } from "@/types/proposal";

function block(
  key: string,
  data: Record<string, unknown> = {},
  overrides: Partial<ProposalSection> = {},
): ProposalSection {
  return {
    id: overrides.id ?? `${key}-${(data.clauseSection as string) ?? Math.random().toString(36)}`,
    key: key as ProposalSection["key"],
    title: key,
    sortOrder: 0,
    isVisible: true,
    data: data as unknown as ProposalSectionData,
    ...overrides,
  };
}

/** The cover is the only `renderShell: false` block in practice; mirror the registry cheaply. */
const isShellRendered = (entry: ProposalSection) => entry.key !== "cover";

function numberOf(
  sections: ProposalSection[],
  section: ProposalSection,
  documentType: DocumentType = "NDA",
) {
  return resolveSectionNumber({ documentType, sections, section, isShellRendered });
}

describe("authoredClauseSection", () => {
  it("reads a trimmed clauseSection off the loose data payload", () => {
    expect(authoredClauseSection(block("prose", { clauseSection: " 7 " }))).toBe("7");
  });

  it("treats blank, missing and non-string values as unauthored", () => {
    expect(authoredClauseSection(block("prose", { clauseSection: "   " }))).toBeNull();
    expect(authoredClauseSection(block("prose", {}))).toBeNull();
    expect(authoredClauseSection(block("prose", { clauseSection: 7 }))).toBeNull();
  });
});

describe("usesClauseNumbering", () => {
  it("is true when any visible block authors a clause section", () => {
    expect(usesClauseNumbering([block("callout"), block("prose", { clauseSection: "1" })])).toBe(
      true,
    );
  });

  it("ignores hidden blocks — a hidden clause block doesn't make the doc clause-numbered", () => {
    expect(
      usesClauseNumbering([
        block("prose", { clauseSection: "1" }, { isVisible: false }),
        block("callout"),
      ]),
    ).toBe(false);
  });
});

describe("resolveSectionNumber — clause-numbered document", () => {
  // A contract shaped like the NDA template: a callout sitting between clause sections 3 and 6,
  // with 4 and 5 also present. Positionally, section 6 would print `07`.
  const cover = block("cover");
  const c1 = block("prose", { clauseSection: "1" });
  const c3 = block("prose", { clauseSection: "3" });
  const callout = block("callout", { body: "Signed in counterparts." });
  const c6 = block("prose", { clauseSection: "6" });
  const c10 = block("prose", { clauseSection: "10" });
  const parties = block("parties", { parties: [] });
  const signatures = block("signatures", {});
  const divider = block("divider", {});
  const doc = [cover, c1, c3, callout, c6, c10, parties, signatures, divider];

  it("numbers from the authored clause section, not the position", () => {
    expect(numberOf(doc, c1)).toBe("01");
    expect(numberOf(doc, c3)).toBe("03");
    // The whole point: `06`, not the positional `07` that a mid-document callout used to force.
    expect(numberOf(doc, c6)).toBe("06");
  });

  it("does not pad a clause section that is already two digits", () => {
    expect(numberOf(doc, c10)).toBe("10");
  });

  it("leaves non-clause blocks unnumbered", () => {
    for (const entry of [callout, parties, signatures, divider, cover]) {
      expect(numberOf(doc, entry)).toBeNull();
    }
  });

  it("is stable when a non-clause block is inserted or removed", () => {
    const without = doc.filter((entry) => entry !== callout);
    expect(numberOf(without, c6)).toBe(numberOf(doc, c6));
  });

  it("numbers a prose block with no clause section as nothing, not as its position", () => {
    const loose = block("prose", { content: "Free prose in a contract." });
    expect(numberOf([...doc, loose], loose)).toBeNull();
  });

  it("gives a hidden clause block no number", () => {
    const hidden = block("prose", { clauseSection: "4" }, { isVisible: false });
    expect(numberOf([...doc, hidden], hidden)).toBeNull();
  });
});

describe("resolveSectionNumber — positional fallback (no clause numbering authored)", () => {
  const cover = block("cover");
  const first = block("prose", { content: "a" });
  const hidden = block("prose", { content: "b" }, { isVisible: false });
  const second = block("callout", { body: "c" });
  const third = block("signatures", {});
  const doc = [cover, first, hidden, second, third];

  it("counts visible, shell-rendered blocks in order", () => {
    expect(numberOf(doc, first)).toBe("01");
    expect(numberOf(doc, second)).toBe("02");
    expect(numberOf(doc, third)).toBe("03");
  });

  it("skips the cover and hidden blocks", () => {
    expect(numberOf(doc, cover)).toBeNull();
    expect(numberOf(doc, hidden)).toBeNull();
  });
});

describe("resolveSectionNumber — document types", () => {
  const sections = [block("prose", { clauseSection: "2" })];

  it("numbers contract document types", () => {
    for (const type of ["SLA", "SOW", "MSA", "NDA", "CO", "DSA"] as DocumentType[]) {
      expect(numberOf(sections, sections[0], type)).toBe("02");
    }
  });

  it("never numbers editorial document types", () => {
    for (const type of [
      "PROPOSAL",
      "REPORT",
      "BRIEF",
      "HANDOVER",
      "DECK",
      "OTHER",
    ] as DocumentType[]) {
      expect(numberOf(sections, sections[0], type)).toBeNull();
    }
  });
});
