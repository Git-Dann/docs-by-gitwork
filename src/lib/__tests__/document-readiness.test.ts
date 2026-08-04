import { describe, expect, it } from "vitest";
import { documentReadiness, readinessSummary } from "@/lib/sections/document-readiness";

const CLEAN = {
  clientName: "Shuffle Love",
  expiresAt: "2026-09-03T00:00:00.000Z",
  metadata: { owner: "Dan Lindsay" },
  sections: [
    { key: "cover", title: "Cover", isVisible: true, data: { proposalTitle: "NDA" } },
    {
      key: "parties",
      title: "Parties",
      isVisible: true,
      data: { parties: [{ name: "Gitwork Group Ltd", email: "dan@gitwork.co.uk" }] },
    },
  ],
};

describe("documentReadiness", () => {
  it("reports nothing on a complete document", () => {
    expect(documentReadiness(CLEAN)).toEqual([]);
    expect(readinessSummary([])).toEqual({ blockers: 0, warnings: 0, ready: true });
  });

  it("blocks on a missing client", () => {
    const findings = documentReadiness({ ...CLEAN, clientName: "  " });

    expect(findings.map((f) => f.id)).toContain("client");
    expect(readinessSummary(findings).ready).toBe(false);
  });

  it("flags the stale create-time author that older documents still carry", () => {
    // Real symptom: NDA-2026-002 renders "Prepared by: Foundry Owner" because the create-time
    // default was fixed without migrating existing rows.
    const findings = documentReadiness({ ...CLEAN, metadata: { owner: "Foundry Owner" } });

    expect(findings.map((f) => f.id)).toContain("owner-default");
  });

  it("finds a [REVIEW] marker left in a block, and names the block", () => {
    // Taken verbatim from the live NDA: a signatory field reading
    // "[REVIEW] Authorised Gitwork signatory".
    const findings = documentReadiness({
      ...CLEAN,
      sections: [
        ...CLEAN.sections,
        {
          key: "signatures",
          title: "Signatures",
          isVisible: true,
          data: { blocks: [{ signatoryName: "[REVIEW] Authorised Gitwork signatory" }] },
        },
      ],
    });

    const finding = findings.find((f) => f.id === "placeholder:signatures");
    expect(finding).toBeTruthy();
    expect(finding?.severity).toBe("blocker");
    expect(finding?.label).toContain("Signatures");
  });

  it("finds unfilled [bracket] fill-ins and unresolved {{merge variables}}", () => {
    const bracket = documentReadiness({
      ...CLEAN,
      sections: [
        { key: "parties", title: "Parties", isVisible: true, data: { org: "Company no. [company number]" } },
      ],
    });
    expect(bracket.map((f) => f.id)).toContain("placeholder:parties");

    const merge = documentReadiness({
      ...CLEAN,
      sections: [{ key: "prose", title: "Background", isVisible: true, data: { body: "for {{client_name}}" } }],
    });
    expect(merge.map((f) => f.id)).toContain("placeholder:prose");
  });

  it("reports a block ONCE however many placeholders it contains", () => {
    // A template block can carry forty brackets. Forty rows for one fix is a wall, not a list.
    const findings = documentReadiness({
      ...CLEAN,
      sections: [
        {
          key: "terms",
          title: "Terms",
          isVisible: true,
          data: { a: "[one]", b: "[two]", c: "[three]", d: "{{client_name}}" },
        },
      ],
    });

    expect(findings.filter((f) => f.id.startsWith("placeholder:")).length).toBe(1);
  });

  it("ignores hidden blocks entirely", () => {
    // A hidden block does not print, so its placeholders cannot reach a client.
    const findings = documentReadiness({
      ...CLEAN,
      sections: [
        ...CLEAN.sections,
        { key: "terms", title: "Terms", isVisible: false, data: { body: "[unfilled]" } },
      ],
    });

    expect(findings.filter((f) => f.id.startsWith("placeholder:"))).toEqual([]);
  });

  it("flags an empty visible block, which prints as a bare heading", () => {
    const findings = documentReadiness({
      ...CLEAN,
      sections: [...CLEAN.sections, { key: "terms", title: "Terms", isVisible: true, data: { body: "   " } }],
    });

    expect(findings.map((f) => f.id)).toContain("empty:terms");
  });

  it("walks nested arrays and objects, so new block shapes are covered automatically", () => {
    const findings = documentReadiness({
      ...CLEAN,
      sections: [
        {
          key: "costing",
          title: "Costing",
          isVisible: true,
          data: { groups: [{ rows: [{ note: "[TBC]" }] }] },
        },
      ],
    });

    expect(findings.map((f) => f.id)).toContain("placeholder:costing");
  });

  it("does not mistake ordinary prose for a placeholder", () => {
    // The bracket pattern must not fire on normal punctuation or citations.
    const findings = documentReadiness({
      ...CLEAN,
      sections: [
        {
          key: "prose",
          title: "Background",
          isVisible: true,
          data: { body: "The parties (together, the “Parties”) agree as follows [1]." },
        },
      ],
    });

    expect(findings.filter((f) => f.id.startsWith("placeholder:"))).toEqual([]);
  });
});
