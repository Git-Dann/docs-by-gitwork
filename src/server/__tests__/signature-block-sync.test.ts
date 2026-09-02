/**
 * Tests for Signature Block Payload Synchronization.
 *
 * Verifies that syncSignerPayloadToDocumentSection updates matching blocks
 * inside DocumentSection.data.blocks with signaturePayload, signatureDate, signedName, and signed=true.
 */

import { describe, expect, it, vi } from "vitest";
import { syncSignerPayloadToDocumentSection } from "@/server/signatures";
import type { Prisma } from "@prisma/client";

describe("syncSignerPayloadToDocumentSection", () => {
  it("updates matching signature block by blockId with signature details", async () => {
    const initialBlocks = [
      {
        id: "block_gitwork_1",
        partyName: "Gitwork Group Ltd",
        signatoryName: "Muhammad Usman",
        signatoryRole: "Director",
        signatoryEmail: "muhammad.usman@gitwork.co.uk",
        signatureDate: "",
        type: "gitwork",
      },
      {
        id: "block_client_1",
        partyName: "Client Organisation",
        signatoryName: "Authorised Signatory",
        signatoryRole: "Director",
        signatoryEmail: "client@example.com",
        signatureDate: "",
        type: "client",
      },
    ];

    let updatedData: Record<string, unknown> | null = null;

    const mockTx = {
      documentSection: {
        findFirst: vi.fn().mockResolvedValue({
          id: "sec_signatures_123",
          documentId: "doc_123",
          key: "signatures",
          data: { blocks: initialBlocks },
        }),
        update: vi.fn().mockImplementation(({ data }: { data: unknown }) => {
          updatedData = data as Record<string, unknown>;
          return Promise.resolve({ id: "sec_signatures_123", ...updatedData });
        }),
      },
    } as unknown as Prisma.TransactionClient;

    const signedAt = new Date("2026-08-12T12:00:00Z");

    await syncSignerPayloadToDocumentSection(
      mockTx,
      "doc_123",
      { blockId: "block_gitwork_1" },
      {
        payload: "data:image/png;base64,mockPngBytes",
        signedName: "Muhammad Usman",
        signedAt,
      },
    );

    expect(mockTx.documentSection.findFirst).toHaveBeenCalledWith({
      where: { documentId: "doc_123", key: "signatures" },
    });
    expect(mockTx.documentSection.update).toHaveBeenCalled();
    expect(updatedData).not.toBeNull();

    const dataObj = (updatedData as unknown as { data: { blocks: Array<Record<string, unknown>> } }).data;
    const blocks = dataObj.blocks;
    expect(blocks[0].signed).toBe(true);
    expect(blocks[0].signaturePayload).toBe("data:image/png;base64,mockPngBytes");
    expect(blocks[0].signedName).toBe("Muhammad Usman");
    expect(blocks[0].signatureDate).toContain("2026");

    // Other block remains unsigned
    expect(blocks[1].signed).toBeUndefined();
  });

  it("updates matching signature block by role or email fallback when blockId is omitted", async () => {
    const initialBlocks = [
      {
        id: "block_client_1",
        partyName: "Client Organisation",
        signatoryName: "Jane Doe",
        signatoryRole: "CEO",
        signatoryEmail: "jane@acme.com",
        signatureDate: "",
        type: "client",
      },
    ];

    let updatedData: Record<string, unknown> | null = null;

    const mockTx = {
      documentSection: {
        findFirst: vi.fn().mockResolvedValue({
          id: "sec_signatures_456",
          documentId: "doc_456",
          key: "signatures",
          data: { blocks: initialBlocks },
        }),
        update: vi.fn().mockImplementation(({ data }: { data: unknown }) => {
          updatedData = data as Record<string, unknown>;
          return Promise.resolve({ id: "sec_signatures_456", ...updatedData });
        }),
      },
    } as unknown as Prisma.TransactionClient;

    await syncSignerPayloadToDocumentSection(
      mockTx,
      "doc_456",
      { email: "jane@acme.com", role: "client" },
      {
        payload: "DOCUSEAL_SIGNED",
        signedName: "Jane Doe",
        signedAt: new Date("2026-08-12T14:00:00Z"),
      },
    );

    expect(updatedData).not.toBeNull();
    const dataObj2 = (updatedData as unknown as { data: { blocks: Array<Record<string, unknown>> } }).data;
    const blocks = dataObj2.blocks;
    expect(blocks[0].signed).toBe(true);
    expect(blocks[0].signaturePayload).toBe("DOCUSEAL_SIGNED");
    expect(blocks[0].signedName).toBe("Jane Doe");
  });
});
