import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { renderSignatureRequestEmailHtml, renderLinkExpiredEmailHtml } from "@/server/email-templates";
import { sendSmtpEmail } from "@/server/smtp";
import { regenerateSignerToken } from "@/server/signatures";
import { z } from "zod";

const sendEmailSchema = z.object({
  signerId: z.string().min(1, "signerId is required"),
  isResend: z.boolean().optional(),
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

    let activeToken = signer.accessToken;
    const isResend = Boolean(body.isResend || signer.firstViewedAt);

    // 3. If link was previously viewed/spent or explicitly requested as resend, regenerate fresh token
    if (isResend) {
      const refreshedSigner = await regenerateSignerToken(signer.id);
      activeToken = refreshedSigner.accessToken;
    }

    const signingUrl = `${origin}/sign/${activeToken}`;

    // 4. Render exact HTML template and subject
    let subject: string;
    let htmlContent: string;

    if (isResend) {
      subject = `${documentTitle} has expired`;
      htmlContent = renderLinkExpiredEmailHtml({
        documentTitle,
        clientFirstName,
        reissueUrl: signingUrl,
        senderName,
      });
    } else {
      subject = `${documentTitle} for signature, from Gitwork`;
      const expiresAtFormatted = signer.request.expiresAt
        ? new Date(signer.request.expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
        : "30 days from send";

      htmlContent = renderSignatureRequestEmailHtml({
        documentTitle,
        clientFirstName,
        signingUrl,
        senderName,
        expiresAtFormatted,
      });
    }

    // 5. Send Email via Gmail SMTP Transporter
    await sendSmtpEmail({
      to: signer.email,
      subject,
      html: htmlContent,
    });

    return apiOk({
      success: true,
      message: `Email successfully delivered to ${signer.email}`,
      signingUrl,
      isResend,
    });
  } catch (err) {
    console.error("[Send Email API Error]", err);
    return fromError(err);
  }
}
