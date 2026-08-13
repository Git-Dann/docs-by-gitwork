import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { renderSignatureRequestEmailHtml } from "@/server/email-templates";
import { sendSmtpEmail } from "@/server/smtp";
import { z } from "zod";

const sendEmailSchema = z.object({
  signerId: z.string().min(1, "signerId is required"),
});

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: documentId } = await params;
    const body = sendEmailSchema.parse(await req.json());

    // 1. Fetch document and workspace
    const doc = await prisma.document.findUnique({
      where: { id: documentId },
      select: {
        id: true,
        title: true,
        documentType: true,
        clientName: true,
        workspace: {
          select: {
            name: true,
          },
        },
      },
    });

    if (!doc) {
      return apiError("Document not found.", 404);
    }

    // 2. Fetch target signer
    const signer = await prisma.signatureSigner.findUnique({
      where: { id: body.signerId },
      include: {
        request: true,
      },
    });

    if (!signer || signer.request.documentId !== documentId) {
      return apiError("Signer record not found for this document.", 404);
    }

    const host = req.headers.get("host") || "staging.foundry.gitwork.tech";
    const protocol = req.headers.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
    const origin = `${protocol}://${host}`;

    const clientFirstName = signer.name.trim().split(" ")[0] || signer.name;
    const documentTitle = doc.title?.trim() || doc.documentType || "Document";
    const senderName = "Muhammad Usman"; // Gitwork sender

    const signingUrl = `${origin}/sign/${signer.accessToken}`;
    const subject = `${documentTitle} for signature, from Gitwork`;
    const expiresAtFormatted = signer.request.expiresAt
      ? new Date(signer.request.expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
      : "30 days from send";

    const htmlContent = renderSignatureRequestEmailHtml({
      documentTitle,
      clientFirstName,
      signingUrl,
      senderName,
      expiresAtFormatted,
    });

    // 3. Dispatch via Gmail SMTP
    await sendSmtpEmail({
      to: signer.email,
      subject,
      html: htmlContent,
    });

    return apiOk({
      sent: true,
      email: signer.email,
      signingUrl,
    });
  } catch (err) {
    console.error("[Send Email API Error]", err);
    return fromError(err);
  }
}
