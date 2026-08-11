import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/webhooks/docuseal/route";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    signatureRequest: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    signatureSigner: {
      findFirst: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(async (cbOrArray: any) => {
      if (typeof cbOrArray === "function") {
        return cbOrArray(prisma);
      }
      return Promise.all(cbOrArray);
    }),
  },
}));

describe("DocuSeal Webhook Endpoint (POST)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("handles form.completed event by updating signer status to SIGNED and completing request if no signers remain", async () => {
    const payload = {
      event_type: "form.completed",
      timestamp: "2026-08-11T12:00:00Z",
      data: {
        id: "sub_123",
        slug: "slug_gitwork",
        email: "signer@example.com",
        status: "completed",
        submission_id: "submission_999",
      },
    };

    (prisma.signatureSigner.findFirst as any).mockResolvedValueOnce({
      id: "signer_1",
      requestId: "req_100",
      status: "PENDING",
    });

    (prisma.signatureSigner.count as any).mockResolvedValueOnce(0); // 0 remaining signers

    const req = new NextRequest("http://localhost/api/webhooks/docuseal", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    const response = await POST(req);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ received: true, signerProcessed: true });

    expect(prisma.signatureSigner.update).toHaveBeenCalledWith({
      where: { id: "signer_1" },
      data: { status: "SIGNED", signedAt: expect.any(Date) },
    });

    expect(prisma.signatureRequest.update).toHaveBeenCalledWith({
      where: { id: "req_100" },
      data: { status: "COMPLETED", completedAt: expect.any(Date) },
    });
  });

  it("handles form.completed event when another signer is still pending without marking request COMPLETED", async () => {
    const payload = {
      event_type: "form.completed",
      data: {
        id: "sub_123",
        slug: "slug_gitwork",
        status: "completed",
      },
    };

    (prisma.signatureSigner.findFirst as any).mockResolvedValueOnce({
      id: "signer_1",
      requestId: "req_100",
      status: "PENDING",
    });

    (prisma.signatureSigner.count as any).mockResolvedValueOnce(1); // 1 remaining signer (e.g. client)

    const req = new NextRequest("http://localhost/api/webhooks/docuseal", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    const response = await POST(req);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ received: true, signerProcessed: true });

    expect(prisma.signatureSigner.update).toHaveBeenCalledWith({
      where: { id: "signer_1" },
      data: { status: "SIGNED", signedAt: expect.any(Date) },
    });

    expect(prisma.signatureRequest.update).not.toHaveBeenCalled();
  });

  it("handles submission.completed event by completing request and all signers", async () => {
    const payload = {
      event_type: "submission.completed",
      data: {
        id: "submission_999",
        status: "completed",
        submitters: [
          { id: "sub_123", status: "completed" },
          { id: "sub_124", status: "completed" },
        ],
      },
    };

    (prisma.signatureRequest.findFirst as any).mockResolvedValueOnce({
      id: "req_100",
      docusealSubmissionId: "submission_999",
      signers: [{ id: "signer_1" }, { id: "signer_2" }],
    });

    const req = new NextRequest("http://localhost/api/webhooks/docuseal", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    const response = await POST(req);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ received: true, status: "completed" });

    expect(prisma.signatureRequest.update).toHaveBeenCalledWith({
      where: { id: "req_100" },
      data: { status: "COMPLETED", completedAt: expect.any(Date) },
    });

    expect(prisma.signatureSigner.updateMany).toHaveBeenCalledWith({
      where: { requestId: "req_100" },
      data: { status: "SIGNED", signedAt: expect.any(Date) },
    });
  });

  it("handles form.viewed event by marking PENDING signer as VIEWED", async () => {
    const payload = {
      event_type: "form.viewed",
      data: {
        id: "sub_124",
        slug: "slug_client",
      },
    };

    (prisma.signatureSigner.findFirst as any).mockResolvedValueOnce({
      id: "signer_2",
      status: "PENDING",
    });

    const req = new NextRequest("http://localhost/api/webhooks/docuseal", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    const response = await POST(req);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ received: true });

    expect(prisma.signatureSigner.update).toHaveBeenCalledWith({
      where: { id: "signer_2" },
      data: { status: "VIEWED" },
    });
  });
});
