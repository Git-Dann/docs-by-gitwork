import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createProofStarterMarkdown,
  resolveProofServerUrl,
  type ProofCreateDocumentInput,
} from "@/lib/proof";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { proofDocumentInclude, serializeProofDocument } from "@/server/proof";

const createDocumentSchema = z.object({
  title: z.string().trim().min(1).max(120),
  markdown: z.string().trim().max(50000).optional(),
  proposalId: z.string().cuid().nullable().optional(),
});

interface ProofCreateResponse {
  slug: string;
  shareUrl?: string;
  tokenUrl?: string;
  accessToken: string;
  createdAt?: string;
}

function isProofCreateResponse(value: unknown): value is ProofCreateResponse {
  if (!value || typeof value !== "object") {
    return false;
  }

  const payload = value as ProofCreateResponse;
  return typeof payload.slug === "string" && typeof payload.accessToken === "string";
}

async function resolveProposalId(workspaceId: string, proposalId?: string | null) {
  if (!proposalId) {
    return null;
  }

  const proposal = await prisma.document.findFirst({
    where: {
      id: proposalId,
      workspaceId,
      documentType: "PROPOSAL",
    },
    select: {
      id: true,
    },
  });

  if (!proposal) {
    throw new Error("Proposal not found for Proof link.");
  }

  return proposal.id;
}

export async function GET(request: NextRequest) {
  try {
    const { workspace } = await ensureBaseRecords();
    const proposalId = request.nextUrl.searchParams.get("proposalId")?.trim() || null;

    const documents = await prisma.proofDocument.findMany({
      where: {
        workspaceId: workspace.id,
        archivedAt: null,
        ...(proposalId ? { proposalId } : {}),
      },
      orderBy: [{ lastOpenedAt: "desc" }, { createdAt: "desc" }],
      include: proofDocumentInclude,
    });

    return apiOk({
      documents: documents.map(serializeProofDocument),
    });
  } catch (error) {
    return fromError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const input = createDocumentSchema.parse(await request.json()) satisfies ProofCreateDocumentInput;
    const { workspace, user } = await ensureBaseRecords();
    const baseUrl = resolveProofServerUrl();
    const resolvedProposalId = await resolveProposalId(workspace.id, input.proposalId ?? null);

    const response = await fetch(`${baseUrl}/documents`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: input.title,
        markdown: input.markdown || createProofStarterMarkdown(input.title),
      }),
      cache: "no-store",
    });

    const payload = (await response.json().catch(() => null)) as ProofCreateResponse | { error?: string } | null;

    if (!response.ok || !payload) {
      return apiError(
        payload && "error" in payload && typeof payload.error === "string"
          ? payload.error
          : `Proof document creation failed with ${response.status}.`,
        response.ok ? 500 : response.status,
      );
    }

    if (!isProofCreateResponse(payload)) {
      return apiError("Proof returned an incomplete document payload.", 502);
    }

    const shareUrl = payload.shareUrl || `${baseUrl}/d/${encodeURIComponent(payload.slug)}`;
    const tokenUrl =
      payload.tokenUrl || `${shareUrl}?token=${encodeURIComponent(payload.accessToken)}`;

    const document = await prisma.proofDocument.create({
      data: {
        workspaceId: workspace.id,
        ownerId: user.id,
        proposalId: resolvedProposalId,
        title: input.title,
        slug: payload.slug,
        shareUrl,
        tokenUrl,
        accessToken: payload.accessToken,
        source: "proof",
      },
      include: proofDocumentInclude,
    });

    return apiOk({ document: serializeProofDocument(document) }, { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}
