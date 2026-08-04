/**
 * Guards for the party helpers (`src/lib/sections/parties-text.ts`) — the two things they exist to
 * keep honest:
 *
 *  1. The cover's bottom strip has exactly ONE decision point and it is DATA, never `documentType`.
 *     The bug this prevents: the strip mode being decided ad hoc per cover branch, so a proposal
 *     cover and an NDA cover disagreed about which bottom region exists.
 *  2. The `(a)/(b)/(c)` clause list punctuates like a real agreement — every item `;`, the
 *     penultimate `; and`, the last `.` — because that punctuation is load-bearing legal grammar,
 *     not decoration.
 */

import { describe, expect, it } from "vitest";
import {
  clauseItemPunctuation,
  coverStripMode,
  filterCoverParties,
  partyColumnCount,
  partyDefinedTerm,
  partyDetailLines,
  partyDisplayName,
  partyFallbackLabel,
  partyLabel,
  toCoverParties,
} from "@/lib/sections/parties-text";
import type { PartyItem } from "@/types/proposal";

function party(overrides: Partial<PartyItem> = {}): PartyItem {
  return {
    id: overrides.id ?? "p1",
    name: "",
    role: "",
    organization: "",
    email: "",
    signatureRequired: true,
    ...overrides,
  };
}

describe("coverStripMode — the strip's one decision point", () => {
  it("renders party columns when the document has parties", () => {
    expect(
      coverStripMode({
        parties: [{ name: "Gitwork Group Ltd" }, { name: "Shuffle Love Ltd" }],
        meta: [{ label: "Date", value: "4 Aug 2026" }],
      }),
    ).toBe("parties");
  });

  it("renders the meta grid when there are no parties", () => {
    expect(coverStripMode({ parties: [], meta: [{ label: "Date" }] })).toBe("meta");
    expect(coverStripMode({ meta: [{ label: "Date" }] })).toBe("meta");
  });

  it("renders nothing when there is neither — no empty framed box", () => {
    expect(coverStripMode({})).toBeNull();
    expect(coverStripMode({ parties: [], meta: [] })).toBeNull();
  });

  it("ignores parties with nothing to print, so a blank row can't flip the mode", () => {
    expect(coverStripMode({ parties: [{ name: "   ", lines: ["", "  "] }], meta: [{}] })).toBe("meta");
  });

  it("keeps a party that has only detail lines", () => {
    expect(coverStripMode({ parties: [{ lines: ["Company no. 15756347"] }] })).toBe("parties");
    expect(filterCoverParties([{ name: " " }, { lines: ["x"] }])).toHaveLength(1);
  });
});

describe("partyColumnCount — 2/3/4/5 parties lay out without crushing", () => {
  it("puts 1–3 parties on one row", () => {
    expect(partyColumnCount(1)).toBe(1);
    expect(partyColumnCount(2)).toBe(2);
    expect(partyColumnCount(3)).toBe(3);
  });

  it("splits 4 parties 2×2 rather than leaving a ragged 3 + 1", () => {
    expect(partyColumnCount(4)).toBe(2);
  });

  it("runs 5+ at 3-up and wraps — never more than 3 across on A4", () => {
    expect(partyColumnCount(5)).toBe(3);
    expect(partyColumnCount(6)).toBe(3);
    expect(partyColumnCount(9)).toBe(3);
  });

  it("never returns 0, so the grid template is always valid", () => {
    expect(partyColumnCount(0)).toBe(1);
  });
});

describe("labels", () => {
  it("auto-generates PARTY A / B / C when a party has no role", () => {
    expect(partyFallbackLabel(0)).toBe("Party A");
    expect(partyFallbackLabel(2)).toBe("Party C");
    expect(partyFallbackLabel(26)).toBe("Party 27");
    expect(partyLabel(party({ name: "Gitwork" }), 1)).toBe("Party B");
  });

  it("uses the role when there is one", () => {
    expect(partyLabel(party({ role: "Disclosing Party" }), 0)).toBe("Disclosing Party");
    expect(partyLabel(party({ role: "  " }), 0)).toBe("Party A");
  });
});

describe("partyDetailLines — details, with organisation/email as back-compat", () => {
  it("uses the authored details and drops blanks", () => {
    expect(
      partyDetailLines(party({ name: "Gitwork Group Ltd", details: ["Company no. 15756347", " ", "Salford"] })),
    ).toEqual(["Company no. 15756347", "Salford"]);
  });

  it("falls back to organisation + email for a document written before `details` existed", () => {
    expect(
      partyDetailLines(party({ name: "Dan", organization: "Gitwork Group Ltd", email: "dan@gitwork.co.uk" })),
    ).toEqual(["Gitwork Group Ltd", "dan@gitwork.co.uk"]);
  });

  it("never prints the organisation twice when it just restates the name", () => {
    expect(partyDetailLines(party({ name: "Gitwork Ltd", organization: "Gitwork Ltd" }))).toEqual([]);
  });

  it("does not merge the fallback into authored details", () => {
    expect(
      partyDetailLines(party({ name: "A", organization: "Old Co", details: ["Registered in England"] })),
    ).toEqual(["Registered in England"]);
  });
});

describe("partyDefinedTerm — the quoted term at the end of the clause", () => {
  it("uses the authored term verbatim, stripping any quotes typed around it", () => {
    expect(partyDefinedTerm(party({ definedTerm: "Gitwork", role: "Provider" }))).toBe("Gitwork");
    expect(partyDefinedTerm(party({ definedTerm: '"the Founder"' }))).toBe("the Founder");
  });

  it("derives from the role, adding the article only when it is missing", () => {
    expect(partyDefinedTerm(party({ role: "Client" }))).toBe("the Client");
    expect(partyDefinedTerm(party({ role: "the Client" }))).toBe("the Client");
  });

  it("falls back to the name with its entity words stripped", () => {
    expect(partyDefinedTerm(party({ name: "Gitwork Group Ltd" }))).toBe("Gitwork");
    expect(partyDefinedTerm(party({ name: "Shuffle Love Limited" }))).toBe("Shuffle Love");
    expect(partyDefinedTerm(party({ name: "Acme" }))).toBe("Acme");
  });

  it("returns null when there is nothing to quote, so no empty quotes print", () => {
    expect(partyDefinedTerm(party())).toBeNull();
  });
});

describe("clauseItemPunctuation — legal list grammar", () => {
  it("ends a single item with a full stop", () => {
    expect(clauseItemPunctuation(0, 1)).toBe(".");
  });

  it("ends the penultimate item with '; and' and the last with '.'", () => {
    expect(clauseItemPunctuation(0, 2)).toBe("; and");
    expect(clauseItemPunctuation(1, 2)).toBe(".");
  });

  it("punctuates a three-party list (a); (b); and (c).", () => {
    expect([0, 1, 2].map((i) => clauseItemPunctuation(i, 3))).toEqual([";", "; and", "."]);
  });

  it("punctuates a five-party list", () => {
    expect([0, 1, 2, 3, 4].map((i) => clauseItemPunctuation(i, 5))).toEqual([
      ";",
      ";",
      ";",
      "; and",
      ".",
    ]);
  });
});

describe("toCoverParties", () => {
  it("puts the role on the label and the details on the lines", () => {
    expect(
      toCoverParties([
        party({ name: "Gitwork Group Ltd", role: "Disclosing Party", details: ["Company no. 15756347"] }),
      ]),
    ).toEqual([
      { label: "Disclosing Party", name: "Gitwork Group Ltd", lines: ["Company no. 15756347"] },
    ]);
  });

  it("leaves the label undefined with no role, so the cover owns the A/B/C indexing", () => {
    expect(toCoverParties([party({ name: "Acme" })])[0].label).toBeUndefined();
  });

  it("falls back to the organisation for the name and drops empty parties", () => {
    expect(toCoverParties([party({ organization: "Acme Ltd" }), party({ id: "p2" })])).toEqual([
      { label: undefined, name: "Acme Ltd", lines: [] },
    ]);
    expect(partyDisplayName(party({ organization: "Acme Ltd" }))).toBe("Acme Ltd");
  });
});
