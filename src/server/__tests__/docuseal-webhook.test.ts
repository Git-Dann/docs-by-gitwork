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

vi.mock("@/server/send-completion-email", () => ({
  sendCompletionEmailsToAllSigners: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    signatureRequest: {
      findFirst: (...args: unknown[]) => findFirstRequest(...args),
      findUnique: (...args: unknown[]) => findFirstRequest(...args),
      update: (...args: unknown[]) => updateRequest(...args),
    },
    signatureSigner: {
      findFirst: (...args: unknown[]) => findFirstSigner(...args),
      update: (...args: unknown[]) => updateSigner(...args),
      count: (...args: unknown[]) => countSigners(...args),
      updateMany: (...args: unknown[]) => updateManySigners(...args),
    },
    documentSection: {
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn(),
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

import { createHmac } from "crypto";

function makeRequest(payload: unknown) {
  const body = JSON.stringify(payload);
  const secret = process.env.DOCUSEAL_WEBHOOK_SECRET?.trim();
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (secret) {
    headers["x-docuseal-signature"] = createHmac("sha256", secret).update(body).digest("hex");
  }
  return new NextRequest("http://localhost/api/webhooks/docuseal", {
    method: "POST",
    headers,
    body,
  });
}

describe("DocuSeal Webhook Endpoint (POST)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── form.completed: last signer → COMPLETED ─────────────────────────────────────────────

  it("handles form.completed event: marks signer SIGNED and request COMPLETED when no signers remain", async () => {
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
      name: "Muhammad Usman",
      signedAt: null,
      request: { documentId: "doc_100" },
    });

    countSigners.mockResolvedValueOnce(0); // 0 remaining (the "not: signer.id" count)

    const response = await POST(makeRequest(payload));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ received: true, signerProcessed: true });

    expect(updateSigner).toHaveBeenCalledWith({
      where: { id: "signer_1" },
      data: {
        status: "SIGNED",
        signedAt: expect.any(Date),
        docusealSubmitterId: "sub_123",
        docusealSlug: "slug_gitwork",
      },
    });

    expect(updateRequest).toHaveBeenCalledWith({
      where: { id: "req_100" },
      data: { status: "COMPLETED", completedAt: expect.any(Date) },
    });
  });

  // ── form.completed: first of two signers — request stays SENT ───────────────────────────

  it("handles form.completed event: marks signer SIGNED but does NOT complete request when another signer is still pending", async () => {
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
      name: "Muhammad Usman",
      signedAt: null,
      request: { documentId: "doc_100" },
    });

    countSigners.mockResolvedValueOnce(1); // 1 remaining (e.g. client)

    const response = await POST(makeRequest(payload));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ received: true, signerProcessed: true });

    expect(updateSigner).toHaveBeenCalledWith({
      where: { id: "signer_1" },
      data: {
        status: "SIGNED",
        signedAt: expect.any(Date),
        docusealSubmitterId: "sub_123",
        docusealSlug: "slug_gitwork",
      },
    });

    // Request must NOT be marked COMPLETED yet
    expect(updateRequest).not.toHaveBeenCalled();
  });

  // ── form.completed: idempotency — already-SIGNED signer is skipped ───────────────────────

  it("is idempotent: skips update when signer is already SIGNED", async () => {
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
      status: "SIGNED", // ← already signed
      name: "Muhammad Usman",
      signedAt: new Date("2026-08-10T10:00:00Z"),
    });

    const response = await POST(makeRequest(payload));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ received: true, signerProcessed: true });

    // No DB mutations should happen
    expect(updateSigner).not.toHaveBeenCalled();
    expect(updateRequest).not.toHaveBeenCalled();
    expect(countSigners).not.toHaveBeenCalled();
  });

  // ── submission.completed: bulk COMPLETED ────────────────────────────────────────────────

  it("handles submission.completed event: completes request and all signers in bulk", async () => {
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
      status: "SENT",
      signers: [{ id: "signer_1" }, { id: "signer_2" }],
    });

    const response = await POST(makeRequest(payload));
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

  // ── submission.completed: idempotency ───────────────────────────────────────────────────

  it("submission.completed is idempotent: skips bulk update when request is already COMPLETED", async () => {
    const payload = {
      event_type: "submission.completed",
      data: { id: "submission_999", status: "completed" },
    };

    findFirstRequest.mockResolvedValueOnce({
      id: "req_100",
      docusealSubmissionId: "submission_999",
      status: "COMPLETED", // ← already done
      signers: [],
    });

    const response = await POST(makeRequest(payload));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ received: true, status: "completed" });

    expect(updateRequest).not.toHaveBeenCalled();
    expect(updateManySigners).not.toHaveBeenCalled();
  });

  // ── form.viewed: primary lookup → PENDING→VIEWED ────────────────────────────────────────

  it("handles form.viewed event: marks PENDING signer as VIEWED via primary ID/slug lookup", async () => {
    const payload = {
      event_type: "form.viewed",
      data: {
        id: "sub_124",
        slug: "slug_client",
      },
    };

    findFirstSigner.mockResolvedValueOnce({
      id: "signer_2",
      name: "Client Contact",
      status: "PENDING",
    });

    const response = await POST(makeRequest(payload));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ received: true });

    expect(updateSigner).toHaveBeenCalledWith({
      where: { id: "signer_2" },
      data: { status: "VIEWED" },
    });
  });

  // ── form.viewed: fallback lookup by role/email ────────────────────────────────────────────

  it("handles form.viewed: falls back to submission-scoped role/email lookup when ID/slug lookup misses", async () => {
    const payload = {
      event_type: "form.viewed",
      data: {
        // No submitter id/slug — simulates a payload where DocuSeal omits them.
        // data.id here is the submission ID (not a submitter ID), so primary lookup yields null.
        id: "submission_999",   // ← submission-level id, not a submitterId
        email: "client@acme.com",
        role: "client",
      },
    };

    // Primary lookup by docusealSubmitterId / docusealSlug — won't match a submission-level ID
    findFirstSigner.mockResolvedValueOnce(null);
    // Fallback lookup scoped to submission by role/email — finds the signer
    findFirstSigner.mockResolvedValueOnce({
      id: "signer_2",
      name: "Client Contact",
      status: "PENDING",
    });

    const response = await POST(makeRequest(payload));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ received: true });

    expect(updateSigner).toHaveBeenCalledWith({
      where: { id: "signer_2" },
      data: { status: "VIEWED" },
    });
  });

  // ── form.viewed: no-op when signer already SIGNED ────────────────────────────────────────

  it("handles form.viewed: does not overwrite status when signer is already SIGNED", async () => {
    const payload = {
      event_type: "form.viewed",
      data: { id: "sub_124", slug: "slug_client" },
    };

    // Primary lookup finds the signer immediately — status is already SIGNED
    findFirstSigner.mockResolvedValueOnce({
      id: "signer_2",
      name: "Client Contact",
      status: "SIGNED",
    });

    const response = await POST(makeRequest(payload));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ received: true });

    // Handler must log a skip and NOT update the signer
    expect(updateSigner).not.toHaveBeenCalled();
  });

  // ── Unknown event type ──────────────────────────────────────────────────────────────────

  it("returns 200 without any DB calls for an unknown event type", async () => {
    const payload = {
      event_type: "submission.expired",
      data: { id: "submission_999" },
    };

    const response = await POST(makeRequest(payload));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({ received: true });

    expect(findFirstSigner).not.toHaveBeenCalled();
    expect(findFirstRequest).not.toHaveBeenCalled();
    expect(updateSigner).not.toHaveBeenCalled();
    expect(updateRequest).not.toHaveBeenCalled();
  });
});
