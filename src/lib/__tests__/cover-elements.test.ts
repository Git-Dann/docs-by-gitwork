import { describe, expect, it } from "vitest";
import {
  COVER_ELEMENTS,
  coverElementEmpty,
  coverElementVisible,
  resolveCoverDetails,
  type CoverElementContext,
} from "@/lib/sections/cover-elements";
import type { CoverDetailRow, CoverSectionData, ProposalSection } from "@/types/proposal";

const data = (over: Partial<CoverSectionData> = {}): CoverSectionData =>
  ({ proposalTitle: "T", productName: "", clientName: "", subtitle: "", date: "", confidentiality: "", ...over }) as CoverSectionData;

const section = (over: Partial<ProposalSection>): ProposalSection =>
  ({ key: "prose", title: "A block", sortOrder: 0, isVisible: true, data: {}, ...over }) as ProposalSection;

const ctx = (over: Partial<CoverElementContext> = {}): CoverElementContext => ({
  documentType: "PROPOSAL",
  sections: [section({ key: "prose", title: "Scope" })],
  hasParties: false,
  ...over,
});

describe("what is on the cover", () => {
  it("falls back to each element's own default", () => {
    // The defaults encode the rules that were previously implicit and scattered.
    expect(coverElementVisible("contents", data(), ctx({ documentType: "PROPOSAL" }))).toBe(true);
    expect(coverElementVisible("contents", data(), ctx({ documentType: "NDA" }))).toBe(false);
    expect(coverElementVisible("stats", data(), ctx({ documentType: "NDA" }))).toBe(false);
    expect(coverElementVisible("covers", data(), ctx())).toBe(true);
  });

  it("an explicit choice always wins over the default", () => {
    // Turning something off has to stick, or the author fights the default on every render.
    expect(coverElementVisible("contents", data({ elements: { contents: false } }), ctx())).toBe(false);
    expect(
      coverElementVisible("stats", data({ elements: { stats: true } }), ctx({ documentType: "NDA" })),
    ).toBe(true);
  });

  it("still honours the #547 `showContents` flag", () => {
    // ⚠️ Documents were saved while that was the only shape. Dropping the fallback would silently
    // flip those covers back on — a change to a document nobody touched.
    expect(coverElementVisible("contents", data({ showContents: false }), ctx())).toBe(false);
    expect(
      coverElementVisible("contents", data({ showContents: true }), ctx({ documentType: "NDA" })),
    ).toBe(true);
  });

  it("prefers the new field when a document carries both", () => {
    expect(
      coverElementVisible("contents", data({ showContents: true, elements: { contents: false } }), ctx()),
    ).toBe(false);
  });
});

describe("empty is not hidden", () => {
  it("reports empty WITHOUT turning the element off", () => {
    // ⚠️ The whole point of the module. Previously these were the same thing, so an author could
    // not tell whether the Covers strip was switched off or merely unfilled.
    const blank = data({ covers: ["  ", ""] });

    expect(coverElementEmpty("covers", blank, ctx())).toBe(true);
    expect(coverElementVisible("covers", blank, ctx())).toBe(true);
  });

  it("knows when there IS something to draw", () => {
    expect(coverElementEmpty("covers", data({ covers: ["The platform"] }), ctx())).toBe(false);
    expect(coverElementEmpty("parties", data(), ctx({ hasParties: true }))).toBe(false);
    expect(coverElementEmpty("parties", data(), ctx({ hasParties: false }))).toBe(true);
  });

  it("calls the contents list empty when the document has no listable blocks", () => {
    expect(coverElementEmpty("contents", data(), ctx({ sections: [section({ key: "cover", title: "Cover" })] }))).toBe(true);
  });

  it("gives every element both a default and an empty-check", () => {
    // A registry entry missing either one is a control that cannot explain itself.
    for (const def of COVER_ELEMENTS) {
      expect(typeof def.defaultOn, def.id).toBe("function");
      expect(typeof def.isEmpty, def.id).toBe("function");
      expect(def.label.length, def.id).toBeGreaterThan(0);
      expect(def.blurb.length, def.id).toBeGreaterThan(0);
    }
  });
});

describe("the detail strip", () => {
  const full = {
    client: "Shuffle Love",
    preparedBy: "Dan Lindsay",
    date: "August 2026",
    version: "v1.0",
    status: "For discussion",
    documentNumber: "PRO-2026-014",
  };

  it("renders EXACTLY today's strip when it has never been edited", () => {
    // ⚠️ The back-compat contract. Every document that predates a composable strip — including the
    // ones already sent to clients — must render byte-identically until someone edits it.
    expect(resolveCoverDetails(undefined, full)).toEqual([
      { label: "Client", value: "Shuffle Love" },
      { label: "Prepared by", value: "Dan Lindsay" },
      { label: "Date", value: "August 2026" },
      { label: "Version", value: "v1.0" },
    ]);
  });

  it("drops an auto row with no value, exactly as the hard-coded strip did", () => {
    // The old code only pushed Client when there was one. A row reading `PREPARED BY —` on a
    // client's front page is worse than no row.
    expect(resolveCoverDetails(undefined, { date: "August 2026" })).toEqual([
      { label: "Date", value: "August 2026" },
    ]);
  });

  it("composes the reference cover, which the old strip could not produce", () => {
    // PREPARED FOR · PREPARED BY · DATE · STATUS — `status` did not exist as a row, and `version`
    // could not be dropped.
    const rows: CoverDetailRow[] = [
      { kind: "auto", source: "client", label: "Prepared for" },
      { kind: "auto", source: "preparedBy" },
      { kind: "auto", source: "date" },
      { kind: "auto", source: "status" },
    ];

    expect(resolveCoverDetails(rows, full)).toEqual([
      { label: "Prepared for", value: "Shuffle Love" },
      { label: "Prepared by", value: "Dan Lindsay" },
      { label: "Date", value: "August 2026" },
      { label: "Status", value: "For discussion" },
    ]);
  });

  it("keeps custom rows, and drops the ones with nothing to say", () => {
    const rows: CoverDetailRow[] = [
      { kind: "custom", label: "Project code", value: "SL-14" },
      { kind: "custom", label: "Empty", value: "   " },
      // A blank LABEL is allowed — a value-only row is a legitimate cover design.
      { kind: "custom", label: "", value: "Commercial in confidence" },
    ];

    expect(resolveCoverDetails(rows, full)).toEqual([
      { label: "Project code", value: "SL-14" },
      { label: "", value: "Commercial in confidence" },
    ]);
  });

  it("respects the author's order", () => {
    const rows: CoverDetailRow[] = [
      { kind: "auto", source: "date" },
      { kind: "auto", source: "client" },
    ];

    expect(resolveCoverDetails(rows, full).map((r) => r.label)).toEqual(["Date", "Client"]);
  });

  it("renders nothing rather than an empty frame when every row resolves blank", () => {
    expect(resolveCoverDetails([{ kind: "auto", source: "status" }], {})).toEqual([]);
  });
});
