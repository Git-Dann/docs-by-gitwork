import { prisma } from "@/lib/prisma";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { renderSignatureRequestEmailHtml } from "@/server/email-templates";
import { sendSmtpEmail } from "@/server/smtp";
import { getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { originFrom } from "@/lib/request-origin";
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
    const user = await getEffectiveUserOrNull(req);

    // 1. Fetch document and workspace
    const doc = await prisma.document.findUnique({
      where: { id: documentId },
      select: {
        id: true,
        title: true,
        documentType: true,
        clientName: true,
        owner: {
          select: {
            name: true,
          },
        },
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
        request: {
          include: {
            createdBy: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });

    if (!signer || signer.request.documentId !== documentId) {
      return apiError("Signer record not found for this document.", 404);
    }

    const origin = originFrom(req);

    const clientFirstName = signer.name.trim().split(" ")[0] || signer.name;
    const documentTitle = doc.title?.trim() || doc.documentType || "Document";
    const senderName =
      user?.name?.trim() ||
      doc.owner?.name?.trim() ||
      signer.request.createdBy?.name?.trim() ||
      "Gitwork";

    // Always send the standard signature request email using the existing token.
    // Links are not single-use — the signer can open and re-open as needed.
    const signingUrl = `${origin}/sign/${signer.accessToken}`;

    const subject = `${documentTitle} for signature, from Gitwork`;
    const htmlContent = renderSignatureRequestEmailHtml({
      documentTitle,
      clientFirstName,
      signingUrl,
      senderName,
    });

    // 3. Send Email via Gmail SMTP Transporter
    await sendSmtpEmail({
      to: signer.email,
      subject,
      html: htmlContent,
    });

    return apiOk({
      success: true,
      message: `Email successfully delivered to ${signer.email}`,
      signingUrl,
    });
  } catch (err) {
    console.error("[Send Email API Error]", err);
    return fromError(err);
  }
}
