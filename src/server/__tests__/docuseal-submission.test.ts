/**
 * Tests for the DocuSeal submission-creation route pre-flight validation.
 *
 * These tests verify that bad submitter data (missing emails, synthetic placeholder
 * emails, duplicate emails) is caught and rejected with a clear 400 error before
 * any request reaches the DocuSeal API.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ─── Mock heavy server-side dependencies ────────────────────────────────────

vi.mock("@/lib/prisma", () => ({
  prisma: {
    document: {
      findUnique: vi.fn(),
    },
    signatureRequest: {
      findFirst: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/server/docuseal", () => ({
  createDocuSealSubmission: vi.fn(),
}));

vi.mock("@/server/documents", () => ({
  enableDocumentShare: vi.fn(),
}));

vi.mock("@/server/headless-browser", () => ({
  launchHeadlessBrowser: vi.fn().mockResolvedValue({
    newPage: vi.fn().mockResolvedValue({
      goto: vi.fn().mockResolvedValue(undefined),
      setContent: vi.fn().mockResolvedValue(undefined),
      waitForFunction: vi.fn().mockResolvedValue(undefined),
      pdf: vi.fn().mockResolvedValue(Buffer.from("dummy pdf")),
      close: vi.fn().mockResolvedValue(undefined),
    }),
    close: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock("@/server/signatures", () => ({
  createSignatureRequest: vi.fn(),
}));

vi.mock("@/server/auth/effective-user", () => ({
  getEffectiveUserOrNull: vi.fn().mockResolvedValue({
    id: "user_1",
    name: "Gitwork Admin",
    email: "admin@gitwork.tech",
  }),
  assertCan: vi.fn(),
  canShareDocs: true,
}));

vi.mock("@/lib/request-origin", () => ({
  originFrom: vi.fn().mockReturnValue("http://localhost:3000"),
}));

import { POST } from "@/app/api/documents/[id]/docuseal/route";
import { prisma } from "@/lib/prisma";
import { createDocuSealSubmission } from "@/server/docuseal";

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeRequest(docId = "doc_abc") {
  return new NextRequest(`http://localhost/api/documents/${docId}/docuseal`, {
    method: "POST",
  });
}

function makeRouteContext(docId = "doc_abc") {
  return { params: Promise.resolve({ id: docId }) };
}

/** Returns a minimal document with a properly linked client. */
function baseDoc(overrides: Record<string, unknown> = {}) {
  return {
    id: "doc_abc",
    title: "Test NDA",
    archivedAt: null,
    clientName: "Acme Corp",
    ownerId: "user_1",
    workspaceId: "ws_1",
    shareToken: "share_tok",
    isShared: true,
    client: {
      id: "client_1",
      primaryContactName: "Alice Smith",
      primaryContactEmail: "alice@acme.com",
    },
    sections: [
      {
        key: "signatures",
        data: {
          blocks: [
            {
              id: "blk_1",
              type: "gitwork",
              signatoryName: "Gitwork Admin",
              signatoryEmail: "admin@gitwork.tech",
              partyName: "Gitwork",
              variableName: "gitwork_signature",
            },
            {
              id: "blk_2",
              type: "client",
              signatoryName: "Alice Smith",
              signatoryEmail: "alice@acme.com",
              partyName: "Acme Corp",
              variableName: "client_signature",
            },
          ],
        },
      },
    ],
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("DocuSeal submission route — pre-flight validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Valid document passes through ────────────────────────────────────────────

  it("passes validation and calls DocuSeal when both signers have real distinct emails", async () => {
    vi.mocked(prisma.document.findUnique).mockResolvedValueOnce(baseDoc() as never);

    vi.mocked(createDocuSealSubmission).mockResolvedValueOnce({
      id: "ds_sub_1",
      name: "Test NDA",
      submitters: [
        {
          id: "ds_1",
          slug: "slug_gitwork",
          embed_src: "https://api.docuseal.com/s/slug_gitwork",
          role: "gitwork",
          email: "admin@gitwork.tech",
          name: "Gitwork Admin",
          status: "pending",
        },
        {
          id: "ds_2",
          slug: "slug_client",
          embed_src: "https://api.docuseal.com/s/slug_client",
          role: "client",
          email: "alice@acme.com",
          name: "Alice Smith",
          status: "pending",
        },
      ],
    });

    // Mock the SignatureRequest creation chain
    vi.mocked(prisma.signatureRequest.findFirst).mockResolvedValueOnce(null);
    const { createSignatureRequest } = await import("@/server/signatures");
    vi.mocked(createSignatureRequest).mockResolvedValueOnce({ id: "req_1" } as never);
    vi.mocked(prisma.signatureRequest.findUniqueOrThrow).mockResolvedValueOnce({
      id: "req_1",
      signers: [],
    } as never);

    const response = await POST(makeRequest(), makeRouteContext());

    const json = await response.json();

    // DocuSeal must have been called
    expect(createDocuSealSubmission).toHaveBeenCalledOnce();

    // Should return 200
    expect(response.status).toBe(200);
  });

  // ── No client email → 400 ────────────────────────────────────────────────────

  it("returns 400 when the client block has no real email and the client record has no email", async () => {
    vi.mocked(prisma.document.findUnique).mockResolvedValueOnce(
      baseDoc({
        client: null, // no linked client record
        sections: [
          {
            key: "signatures",
            data: {
              blocks: [
                {
                  id: "blk_1",
                  type: "gitwork",
                  signatoryName: "Gitwork Admin",
                  signatoryEmail: "admin@gitwork.tech",
                  variableName: "gitwork_signature",
                },
                {
                  id: "blk_2",
                  type: "client",
                  signatoryName: "", // no name
                  signatoryEmail: "", // no email
                  variableName: "client_signature",
                },
              ],
            },
          },
        ],
      }) as never,
    );

    const response = await POST(makeRequest(), makeRouteContext());
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(typeof json.error).toBe("string");
    expect(json.error).toMatch(/missing a real email address|has no email address/i);

    // DocuSeal must NOT have been called
    expect(createDocuSealSubmission).not.toHaveBeenCalled();
  });

  // ── Synthetic placeholder email → 400 ────────────────────────────────────────

  it("returns 400 when the resolved client email is a synthetic @client.com placeholder", async () => {
    vi.mocked(prisma.document.findUnique).mockResolvedValueOnce(
      baseDoc({
        clientName: "Matchmaker UK",
        client: { id: "c1", primaryContactName: "Client", primaryContactEmail: null }, // no email on record
        sections: [
          {
            key: "signatures",
            data: {
              blocks: [
                {
                  id: "blk_1",
                  type: "gitwork",
                  signatoryEmail: "admin@gitwork.tech",
                  variableName: "gitwork_signature",
                },
                {
                  id: "blk_2",
                  type: "client",
                  signatoryEmail: "", // will fall through to synthetic @client.com
                  variableName: "client_signature",
                },
              ],
            },
          },
        ],
      }) as never,
    );

    const response = await POST(makeRequest(), makeRouteContext());
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toMatch(/missing a real email address|has no email address/i);
    expect(createDocuSealSubmission).not.toHaveBeenCalled();
  });

  // ── Duplicate emails → 400 ───────────────────────────────────────────────────

  it("returns 400 when two signature blocks resolve to the same email address", async () => {
    vi.mocked(prisma.document.findUnique).mockResolvedValueOnce(
      baseDoc({
        sections: [
          {
            key: "signatures",
            data: {
              blocks: [
                {
                  id: "blk_1",
                  type: "gitwork",
                  signatoryName: "Gitwork Admin",
                  signatoryEmail: "shared@gitwork.tech",
                  variableName: "gitwork_signature",
                },
                {
                  id: "blk_2",
                  type: "client",
                  signatoryName: "Alice",
                  signatoryEmail: "shared@gitwork.tech", // ← same email
                  variableName: "client_signature",
                },
              ],
            },
          },
        ],
      }) as never,
    );

    const response = await POST(makeRequest(), makeRouteContext());
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toMatch(/two signature blocks share the same email/i);
    expect(createDocuSealSubmission).not.toHaveBeenCalled();
  });

  // ── Unresolved placeholder in email field → 400 ───────────────────────────────

  it("returns 400 when the email field contains an unresolved template placeholder", async () => {
    vi.mocked(prisma.document.findUnique).mockResolvedValueOnce(
      baseDoc({
        client: null,
        sections: [
          {
            key: "signatures",
            data: {
              blocks: [
                {
                  id: "blk_1",
                  type: "gitwork",
                  signatoryEmail: "admin@gitwork.tech",
                  variableName: "gitwork_signature",
                },
                {
                  id: "blk_2",
                  type: "client",
                  signatoryEmail: "{{client_email}}", // unresolved placeholder
                  variableName: "client_signature",
                },
              ],
            },
          },
        ],
      }) as never,
    );

    const response = await POST(makeRequest(), makeRouteContext());
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(createDocuSealSubmission).not.toHaveBeenCalled();
  });
});
