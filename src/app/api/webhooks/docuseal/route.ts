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
    const eventType = payload.event || payload.type || "";
    const submissionId = String(payload.submission_id || payload.data?.submission_id || payload.id || "");
    const submitterData = payload.data?.submitter || payload.submitter || payload;
    const submitterId = String(submitterData.id || "");
    const submitterSlug = String(submitterData.slug || "");

    const isCompletedEvent = eventType.includes("completed") || payload.status === "completed";
    const isSignedEvent = eventType.includes("signed") || submitterData?.status === "completed" || submitterData?.status === "signed";

    // 1. If submission is completed
    if (isCompletedEvent) {
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
        await prisma.$transaction([
          prisma.signatureRequest.update({
            where: { id: activeRequest.id },
            data: { status: "COMPLETED", completedAt: new Date() },
          }),
          prisma.signatureSigner.updateMany({
            where: { requestId: activeRequest.id },
            data: { status: "SIGNED", signedAt: new Date() },
          }),
        ]);
      }
      return apiOk({ received: true, status: "completed" });
    }

    // 2. Individual signer signed
    if (isSignedEvent && (submitterId || submitterSlug)) {
      const signer = await prisma.signatureSigner.findFirst({
        where: {
          OR: [
            { docusealSubmitterId: submitterId },
            { docusealSlug: submitterSlug },
          ],
        },
      });

      if (signer) {
        await prisma.signatureSigner.update({
          where: { id: signer.id },
          data: { status: "SIGNED", signedAt: new Date() },
        });

        // Check if all signers on this request are signed
        const remaining = await prisma.signatureSigner.count({
          where: { requestId: signer.requestId, status: { not: "SIGNED" } },
        });

        if (remaining === 0) {
          await prisma.signatureRequest.update({
            where: { id: signer.requestId },
            data: { status: "COMPLETED", completedAt: new Date() },
          });
        }
      }
    }

    return apiOk({ received: true });
  } catch (error) {
    return fromError(error);
  }
}
