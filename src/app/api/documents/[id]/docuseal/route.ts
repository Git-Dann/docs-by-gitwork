/**
 * DocuSeal Integration Endpoint.
 *
 *   POST /api/documents/[id]/docuseal -> Creates a DocuSeal submission, receives submitter slugs/embed_src,
 *                                        and updates SignatureRequest + SignatureSigner records.
 */

import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { createDocuSealSubmission } from "@/server/docuseal";
import { createSignatureRequest, mintSignerToken } from "@/server/signatures";
import { assertCan, canShareDocs, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import type { SignatureBlockItem } from "@/types/proposal";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await getEffectiveUserOrNull(request);
    assertCan(user, canShareDocs, "send document via DocuSeal");
    const { id } = await context.params;
    if (!id) return apiError("Missing document id", 400);

    const doc = await prisma.document.findUnique({
      where: { id },
      include: {
        sections: { orderBy: { sortOrder: "asc" } },
      },
    });

    if (!doc) return apiError("Document not found", 404);
    if (doc.archivedAt) return apiError("Cannot send an archived document", 409);

    // Extract signature blocks from sections
    const sections = doc.sections as Array<{ key: string; data: unknown }>;
    const signaturesSection = sections.find((s) => s.key === "signatures");
    const signatureData = signaturesSection?.data as { blocks?: SignatureBlockItem[] } | undefined;
    const rawBlocks = signatureData?.blocks ?? [];

    if (!rawBlocks.length) {
      return apiError("Document must have at least one signature block to send via DocuSeal.", 400);
    }

    // Format submitters for DocuSeal
    const submittersInput = rawBlocks.map((block, index) => {
      const defaultType = block.type ?? (index === 0 ? "gitwork" : "client");
      const defaultVar = defaultType === "gitwork" ? "gitwork_signature" : "client_signature";
      return {
        name: block.signatoryName?.trim() || block.partyName?.trim() || `Signatory ${index + 1}`,
        email: block.signatoryEmail?.trim() || `signer_${index + 1}@example.com`,
        role: defaultType,
        variableName: block.variableName?.trim() || defaultVar,
      };
    });

    // Call DocuSeal API (or local mock fallback if API key is blank)
    const dsResult = await createDocuSealSubmission({
      title: doc.title,
      html: `<h1>${doc.title}</h1><p>Document ID: ${doc.id}</p>`,
      submitters: submittersInput,
    });

    // Create or retrieve active SignatureRequest
    let activeRequest = await prisma.signatureRequest.findFirst({
      where: { documentId: id, status: { in: ["DRAFT", "SENT"] } },
      include: { signers: true },
    });

    if (!activeRequest) {
      const created = await createSignatureRequest({
        documentId: id,
        workspaceId: doc.workspaceId,
        createdById: user?.id ?? doc.ownerId,
        signers: submittersInput.map((s, index) => ({
          name: s.name,
          email: s.email,
          role: s.role === "gitwork" ? "Gitwork Signatory" : "Client Signatory",
          organization: doc.clientName ?? undefined,
          signatureBlockId: rawBlocks[index]?.id,
        })),
      });

      activeRequest = await prisma.signatureRequest.findUniqueOrThrow({
        where: { id: created.id },
        include: { signers: true },
      });
    }

    // Update SignatureRequest with docusealSubmissionId
    await prisma.signatureRequest.update({
      where: { id: activeRequest.id },
      data: {
        status: "SENT",
        sentAt: new Date(),
        docusealSubmissionId: String(dsResult.id),
      },
    });

    // Update each signer with returned DocuSeal slug, embed_src, and submitter ID
    const updatedSigners = await Promise.all(
      activeRequest.signers.map(async (signer, index) => {
        const dsSub = dsResult.submitters[index] ?? dsResult.submitters.find((s) => s.role === submittersInput[index]?.role);
        const nextSlug = dsSub?.slug ?? `ds_${signer.id}`;
        const nextEmbed = dsSub?.embed_src ?? `https://api.docuseal.com/s/${nextSlug}`;
        const nextRole = submittersInput[index]?.role ?? "client";
        const nextVar = submittersInput[index]?.variableName ?? "client_signature";

        return prisma.signatureSigner.update({
          where: { id: signer.id },
          data: {
            docusealSubmitterId: dsSub ? String(dsSub.id) : null,
            docusealSlug: nextSlug,
            docusealEmbedSrc: nextEmbed,
            signerType: nextRole,
            variableName: nextVar,
          },
        });
      }),
    );

    return apiOk({
      requestId: activeRequest.id,
      docusealSubmissionId: dsResult.id,
      signers: updatedSigners.map((s) => ({
        id: s.id,
        name: s.name,
        email: s.email,
        role: s.role,
        signerType: s.signerType,
        variableName: s.variableName,
        accessToken: s.accessToken,
        docusealSlug: s.docusealSlug,
        docusealEmbedSrc: s.docusealEmbedSrc,
      })),
    });
  } catch (error) {
    return fromError(error);
  }
}
