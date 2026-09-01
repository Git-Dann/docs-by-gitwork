import { describe, expect, it } from "vitest";
import { computeSectionsHash } from "@/components/proposals/proposal-editor-layout";
import type { ProposalSection, SignaturesSectionData } from "@/types/proposal";

describe("DocuSeal staleness detection — computeSectionsHash", () => {
  const baseSections: ProposalSection[] = [
    {
      id: "sec-1",
      key: "introduction",
      title: "Introduction",
      sortOrder: 0,
      isVisible: true,
      data: {
        statement: "Initial introduction statement",
        summary: "Initial introduction summary",
      },
    },
    {
      id: "sec-2",
      key: "signatures",
      title: "Signatures",
      sortOrder: 1,
      isVisible: true,
      data: {
        intro: "Please sign below.",
        blocks: [
          {
            id: "blk-gitwork",
            type: "gitwork",
            partyName: "Gitwork Group Ltd",
            signatoryName: "Gitwork Admin",
            signatoryRole: "Director",
            signatoryEmail: "admin@gitwork.tech",
            variableName: "gitwork_signature",
            signed: false,
            signatureDate: "",
          },
          {
            id: "blk-client",
            type: "client",
            partyName: "Acme Corp",
            signatoryName: "Alice Smith",
            signatoryRole: "CEO",
            signatoryEmail: "alice@acme.com",
            variableName: "client_signature",
            signed: false,
            signatureDate: "",
          },
        ],
      },
    },
  ];

  it("produces identical hash when a client signs without changing document content", () => {
    const initialHash = computeSectionsHash(baseSections);
    const sigData = baseSections[1].data as SignaturesSectionData;

    // Simulate signing by client (DocuSeal webhook syncs captured signature into database)
    const signedSections: ProposalSection[] = [
      baseSections[0],
      {
        ...baseSections[1],
        data: {
          intro: "Please sign below.",
          blocks: [
            sigData.blocks![0],
            {
              id: "blk-client",
              type: "client",
              partyName: "Acme Corp",
              signatoryName: "Alice Smith",
              signatoryRole: "CEO",
              signatoryEmail: "alice@acme.com",
              variableName: "client_signature",
              signed: true,
              signedName: "Alice Smith",
              signaturePayload: "Alice Signature SVG/Data",
              signatureDate: "1 September 2026",
            },
          ],
        },
      },
    ];

    const signedHash = computeSectionsHash(signedSections);

    // Hash must be identical so isDocusealStale remains false
    expect(signedHash).toBe(initialHash);
  });

  it("produces a different hash when document content is edited", () => {
    const initialHash = computeSectionsHash(baseSections);

    const editedContentSections: ProposalSection[] = [
      {
        ...baseSections[0],
        data: {
          statement: "Initial introduction statement",
          summary: "Updated introduction summary with new requirements",
        },
      },
      baseSections[1],
    ];

    const editedHash = computeSectionsHash(editedContentSections);
    expect(editedHash).not.toBe(initialHash);
  });

  it("produces a different hash when a signatory party or email is changed", () => {
    const initialHash = computeSectionsHash(baseSections);
    const sigData = baseSections[1].data as SignaturesSectionData;

    const editedSignatorySections: ProposalSection[] = [
      baseSections[0],
      {
        ...baseSections[1],
        data: {
          intro: "Please sign below.",
          blocks: [
            sigData.blocks![0],
            {
              ...sigData.blocks![1],
              signatoryEmail: "new.alice@acme.com",
            },
          ],
        },
      },
    ];

    const editedHash = computeSectionsHash(editedSignatorySections);
    expect(editedHash).not.toBe(initialHash);
  });
});
