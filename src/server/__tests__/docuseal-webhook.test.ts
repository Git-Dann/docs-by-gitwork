import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/webhooks/docuseal/route";
import { prisma } from "@/lib/prisma";

const findFirstRequest = vi.fn();
const updateRequest = vi.fn();
const findFirstSigner = vi.fn();
const updateSigner = vi.fn();
const countSigners = vi.fn();
const updateManySigners = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    signatureRequest: {
      findFirst: (...args: unknown[]) => findFirstRequest(...args),
      update: (...args: unknown[]) => updateRequest(...args),
    },
    signatureSigner: {
      findFirst: (...args: unknown[]) => findFirstSigner(...args),
      update: (...args: unknown[]) => updateSigner(...args),
      count: (...args: unknown[]) => countSigners(...args),
      updateMany: (...args: unknown[]) => updateManySigners(...args),
    },
    $transaction: vi.fn(async (cbOrArray: unknown) => {
      if (typeof cbOrArray === "function") {
        return cbOrArray(prisma);
      }
      if (Array.isArray(cbOrArray)) {
        return Promise.all(cbOrArray);
      }
      return cbOrArray;
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

    findFirstSigner.mockResolvedValueOnce({
      id: "signer_1",
      requestId: "req_100",
      status: "PENDING",
    });

    countSigners.mockResolvedValueOnce(0); // 0 remaining signers

    const req = new NextRequest("http://localhost/api/webhooks/docuseal", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    const response = await POST(req);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ received: true, signerProcessed: true });

    expect(updateSigner).toHaveBeenCalledWith({
      where: { id: "signer_1" },
      data: { status: "SIGNED", signedAt: expect.any(Date) },
    });

    expect(updateRequest).toHaveBeenCalledWith({
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

    findFirstSigner.mockResolvedValueOnce({
      id: "signer_1",
      requestId: "req_100",
      status: "PENDING",
    });

    countSigners.mockResolvedValueOnce(1); // 1 remaining signer (e.g. client)

    const req = new NextRequest("http://localhost/api/webhooks/docuseal", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    const response = await POST(req);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ received: true, signerProcessed: true });

    expect(updateSigner).toHaveBeenCalledWith({
      where: { id: "signer_1" },
      data: { status: "SIGNED", signedAt: expect.any(Date) },
    });

    expect(updateRequest).not.toHaveBeenCalled();
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

    findFirstRequest.mockResolvedValueOnce({
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

    expect(updateRequest).toHaveBeenCalledWith({
      where: { id: "req_100" },
      data: { status: "COMPLETED", completedAt: expect.any(Date) },
    });

    expect(updateManySigners).toHaveBeenCalledWith({
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

    findFirstSigner.mockResolvedValueOnce({
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

    expect(updateSigner).toHaveBeenCalledWith({
      where: { id: "signer_2" },
      data: { status: "VIEWED" },
    });
  });
});
