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

    // Build HTML representation of the document with DocuSeal signature tags
    const sectionHtmls = sections
      .filter((sec) => sec.key !== "signatures")
      .map((sec) => {
        const d = (sec.data as Record<string, unknown> | null) ?? {};
        const title = (d.title as string) || (sec as { title?: string }).title || sec.key;
        let bodyText = "";

        if (d.description && typeof d.description === "string") {
          bodyText += `<p style="font-size: 13px; color: #64748b; margin-bottom: 12px; font-style: italic;">${d.description}</p>`;
        }

        if (d.content && typeof d.content === "string") {
          bodyText += `<div style="font-size: 14px; line-height: 1.7; color: #334155;">${d.content.replace(/\n/g, "<br/>")}</div>`;
        } else if (d.body && typeof d.body === "string") {
          bodyText += `<div style="font-size: 14px; line-height: 1.7; color: #334155;">${d.body.replace(/\n/g, "<br/>")}</div>`;
        }

        if (Array.isArray(d.clauses)) {
          bodyText += `<div style="margin-top: 12px;">`;
          for (const c of d.clauses) {
            if (typeof c === "object" && c !== null) {
              const clause = c as Record<string, unknown>;
              const cNum = clause.number ? `<strong>${clause.number}.</strong> ` : "";
              const cTitle = clause.title ? `<strong style="color: #0f172a;">${clause.title}</strong> — ` : "";
              const cBody = (clause.body as string) || (clause.text as string) || "";
              bodyText += `<div style="margin-bottom: 12px; font-size: 14px; line-height: 1.6; color: #334155;">${cNum}${cTitle}${cBody}</div>`;
            }
          }
          bodyText += `</div>`;
        }

        return `
          <div style="margin-bottom: 32px; page-break-inside: avoid;">
            <h2 style="font-size: 20px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; margin-bottom: 12px; color: #1e293b;">${title}</h2>
            ${bodyText}
          </div>
        `;
      });

    const signatureBlocksHtml = submittersInput
      .map(
        (s) => `
        <div style="margin-bottom: 30px; display: inline-block; width: 45%; vertical-align: top; margin-right: 4%;">
          <p style="font-weight: bold; font-size: 14px; margin-bottom: 4px; color: #0f172a;">${s.name}</p>
          <p style="font-size: 12px; color: #64748b; margin-bottom: 12px;">Role: ${s.role.toUpperCase()} (${s.email})</p>
          <div style="border: 1px dashed #cbd5e1; padding: 16px; min-height: 80px; background: #f8fafc; border-radius: 6px;">
            <p style="font-size: 11px; color: #94a3b8; margin-bottom: 8px; font-family: monospace;">SIGNATURE FIELD:</p>
            <p style="font-size: 14px; color: #0284c7;">{{${s.role}:signature:${s.variableName}}}</p>
          </div>
        </div>
      `,
      )
      .join("");

    const fullDocumentHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8"/>
          <title>${doc.title}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; padding: 40px; color: #0f172a; line-height: 1.6; max-width: 800px; margin: 0 auto; }
            h1 { font-size: 28px; margin-bottom: 20px; border-bottom: 2px solid #0f172a; padding-bottom: 12px; color: #0f172a; }
            h2 { font-size: 20px; color: #1e293b; margin-top: 24px; }
            .signatures-container { margin-top: 40px; padding-top: 24px; border-top: 2px solid #cbd5e1; }
          </style>
        </head>
        <body>
          <h1>${doc.title}</h1>
          ${sectionHtmls.join("")}
          <div class="signatures-container">
            <h2>Signatures & Execution</h2>
            ${signatureBlocksHtml}
          </div>
        </body>
      </html>
    `;

    // Call DocuSeal API (or local mock fallback if API key is blank)
    const dsResult = await createDocuSealSubmission({
      title: doc.title,
      html: fullDocumentHtml,
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
