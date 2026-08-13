import { prisma } from "@/lib/prisma";
import { renderSignedCompletionEmailHtml } from "@/server/email-templates";
import { sendSmtpEmail } from "@/server/smtp";
import { downloadDocuSealSignedPdf } from "@/server/docuseal";
import { launchHeadlessBrowser } from "@/server/headless-browser";

/**
 * Sends "Signed by everyone" HTML email with the executed PDF attached to ALL signers
 * when a SignatureRequest is marked COMPLETED.
 */
export async function sendCompletionEmailsToAllSigners(requestId: string, origin?: string): Promise<void> {
  try {
    const req = await prisma.signatureRequest.findUnique({
      where: { id: requestId },
      include: {
        signers: true,
        document: {
          select: {
            id: true,
            title: true,
            documentType: true,
            clientName: true,
            shareToken: true,
            isShared: true,
          },
        },
      },
    });

    if (!req || !req.document) {
      console.warn(`[Completion Email] SignatureRequest ${requestId} not found or missing document.`);
      return;
    }

    const documentTitle = req.document.title?.trim() || req.document.documentType || "Signed Document";
    const appOrigin = origin || process.env.NEXT_PUBLIC_APP_URL || "https://staging.foundry.gitwork.tech";

    // 1. Fetch official signed PDF buffer (DocuSeal signed PDF if DocuSeal submission, otherwise Headless PDF)
    let pdfBuffer: Buffer | null = null;
    if (req.docusealSubmissionId) {
      console.log(`[Completion Email] Attempting to fetch official DocuSeal signed PDF for submission ${req.docusealSubmissionId}...`);
      pdfBuffer = await downloadDocuSealSignedPdf(req.docusealSubmissionId);
    }

    if (!pdfBuffer && req.document.shareToken && req.document.isShared) {
      try {
        const browser = await launchHeadlessBrowser();
        const page = await browser.newPage();
        const printUrl = `${appOrigin}/docs/${req.document.shareToken}?print=1`;
        await page.goto(printUrl, { waitUntil: "networkidle0", timeout: 30_000 });
        await page
          .waitForFunction("window.__docPaginated === true", { timeout: 10_000 })
          .catch(() => undefined);
        const rawPdf = await page.pdf({
          format: "A4",
          printBackground: true,
          margin: { top: "0mm", bottom: "0mm", left: "0mm", right: "0mm" },
        });
        await browser.close();
        pdfBuffer = Buffer.from(rawPdf);
      } catch (pdfErr) {
        console.warn("[Completion Email PDF Warn] Failed to render headless PDF, sending email without attachment:", pdfErr);
      }
    }

    // 2. Dispatch completion email with attached PDF to every signer
    const subject = `Signed, ${documentTitle}`;
    const senderName = "Muhammad Usman";

    for (const signer of req.signers) {
      if (!signer.email || signer.email.includes("@client.com")) continue;

      const clientFirstName = signer.name.trim().split(" ")[0] || signer.name;
      const htmlContent = renderSignedCompletionEmailHtml({
        documentTitle,
        clientFirstName,
        senderName,
      });

      const attachments = pdfBuffer
        ? [
            {
              filename: `${documentTitle.replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`,
              content: pdfBuffer,
              contentType: "application/pdf",
            },
          ]
        : [];

      await sendSmtpEmail({
        to: signer.email,
        subject,
        html: htmlContent,
        attachments,
      });
      console.log(`[Completion Email] Sent signed document completion email to ${signer.email}`);
    }
  } catch (err) {
    console.error(`[Completion Email Error] Failed to send completion emails for request ${requestId}:`, err);
  }
}
