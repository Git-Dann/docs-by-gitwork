/**
 * DocuSeal Webhook Endpoint.
 *
 * Listens for events from DocuSeal:
 *   - submission.completed / form.completed -> Marks all signers and request COMPLETED
 *   - form.signed -> Marks individual signer SIGNED
 */

import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    const eventType: string = String(
      payload.event_type || payload.event || payload.type || "",
    ).toLowerCase();

    const data = (payload.data && typeof payload.data === "object" ? payload.data : {}) as Record<string, unknown>;
    const submissionObj = (data.submission && typeof data.submission === "object" ? data.submission : {}) as Record<string, unknown>;
    const submissionId = String(
      data.id || data.submission_id || submissionObj.id || submissionObj.slug || payload.submission_id || payload.id || "",
    );

    console.log(`[DocuSeal Webhook] Received event_type="${eventType}", submissionId="${submissionId}"`);

    // 1. Whole submission completed (DocuSeal confirms all signers done)
    if (eventType === "submission.completed") {
      if (submissionId) {
        const activeRequest = await prisma.signatureRequest.findFirst({
          where: {
            OR: [
              { docusealSubmissionId: submissionId },
              { id: submissionId },
            ],
          },
          include: { signers: true },
        });

        if (activeRequest) {
          const now = new Date();
          await prisma.$transaction([
            prisma.signatureRequest.update({
              where: { id: activeRequest.id },
              data: { status: "COMPLETED", completedAt: now },
            }),
            prisma.signatureSigner.updateMany({
              where: { requestId: activeRequest.id },
              data: { status: "SIGNED", signedAt: now },
            }),
          ]);
          console.log(`[DocuSeal Webhook] Marked SignatureRequest ${activeRequest.id} and all signers COMPLETED.`);
        }
      }
      return apiOk({ received: true, status: "completed" });
    }

    // 2. Individual signer completed or signed
    const isSignerCompleted =
      eventType === "form.completed" ||
      eventType === "form.signed" ||
      data.status === "completed" ||
      data.status === "signed";

    if (isSignerCompleted) {
      const submitterId = String(data.id || "");
      const submitterSlug = String(data.slug || "");
      const submitterEmail = typeof data.email === "string" ? data.email.trim().toLowerCase() : "";

      // Find signer by submitterId, slug, or matching email on submission request
      let signer = await prisma.signatureSigner.findFirst({
        where: {
          OR: [
            ...(submitterId ? [{ docusealSubmitterId: submitterId }] : []),
            ...(submitterSlug ? [{ docusealSlug: submitterSlug }] : []),
          ],
        },
      });

      if (!signer && submissionId && submitterEmail) {
        signer = await prisma.signatureSigner.findFirst({
          where: {
            email: submitterEmail,
            request: {
              OR: [
                { docusealSubmissionId: submissionId },
                { id: submissionId },
              ],
            },
          },
        });
      }

      if (signer) {
        const now = new Date();

        await prisma.$transaction(async (tx) => {
          if (signer.status !== "SIGNED") {
            await tx.signatureSigner.update({
              where: { id: signer.id },
              data: { status: "SIGNED", signedAt: now },
            });
          }

          const remaining = await tx.signatureSigner.count({
            where: {
              requestId: signer.requestId,
              status: { not: "SIGNED" },
            },
          });

          if (remaining === 0) {
            await tx.signatureRequest.update({
              where: { id: signer.requestId },
              data: { status: "COMPLETED", completedAt: now },
            });
            console.log(`[DocuSeal Webhook] All signers completed. Marked SignatureRequest ${signer.requestId} COMPLETED.`);
          } else {
            console.log(`[DocuSeal Webhook] Marked Signer ${signer.id} SIGNED. Remaining signers: ${remaining}`);
          }
        });
      }
      return apiOk({ received: true, signerProcessed: !!signer });
    }

    // 3. Individual signer viewed form
    if (eventType === "form.viewed") {
      const submitterId = String(data.id || "");
      const submitterSlug = String(data.slug || "");

      if (submitterId || submitterSlug) {
        const signer = await prisma.signatureSigner.findFirst({
          where: {
            OR: [
              ...(submitterId ? [{ docusealSubmitterId: submitterId }] : []),
              ...(submitterSlug ? [{ docusealSlug: submitterSlug }] : []),
            ],
          },
        });

        if (signer && signer.status === "PENDING") {
          await prisma.signatureSigner.update({
            where: { id: signer.id },
            data: { status: "VIEWED" },
          });
        }
      }
    }

    return apiOk({ received: true });
  } catch (error) {
    return fromError(error);
  }
}
