import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolvePublicWiki } from "@/server/wiki";
import { archiveDocusealSubmission } from "@/server/docuseal-archive";

interface RouteContext {
  params: Promise<{ token: string; submissionId: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { token, submissionId } = await context.params;

    // 1. Authorize client via wiki token
    const resolved = await resolvePublicWiki(token);
    if (!resolved) {
      return new NextResponse("Unauthorized or invalid token", { status: 401 });
    }

    // 2. Find submission in DB (search by string id or numeric submissionId)
    const isNumeric = /^\d+$/.test(submissionId);
    const submission = await prisma.docusealSubmission.findFirst({
      where: {
        document: {
          clientId: resolved.wiki.clientId,
        },
        OR: [
          { id: submissionId },
          ...(isNumeric ? [{ submissionId: parseInt(submissionId, 10) }] : []),
        ],
      },
      include: { document: true },
    });

    if (!submission) {
      return new NextResponse("Agreement not found", { status: 404 });
    }

    let pdfUrl = submission.combinedPdfUrl;

    // 3. If PDF URL is not saved yet or submission is still marked pending, try fetching live from DocuSeal
    const DOCUSEAL_API_KEY = process.env.DOCUSEAL_API_KEY;
    if ((!pdfUrl || submission.status !== "COMPLETED") && DOCUSEAL_API_KEY) {
      try {
        const verifyRes = await fetch(
          `https://api.docuseal.com/submissions/${submission.submissionId}`,
          { headers: { "X-Auth-Token": DOCUSEAL_API_KEY } }
        );
        if (verifyRes.ok) {
          const verifiedData = await verifyRes.json();
          const submitter = Array.isArray(verifiedData) ? verifiedData[0] : verifiedData;
          const livePdfUrl = submitter?.documents?.[0]?.url || submitter?.document_url;

          if (livePdfUrl) {
            pdfUrl = livePdfUrl;
            // Trigger archiving to save url in background
            archiveDocusealSubmission(submission.id, verifiedData).catch((err) => {
              console.error("Failed to archive DocuSeal submission on download:", err);
            });
          }
        }
      } catch (err) {
        console.error("Failed to check DocuSeal API for PDF URL:", err);
      }
    }

    if (!pdfUrl) {
      return new NextResponse("Signed PDF is not available yet. Please complete all signatures first.", { status: 404 });
    }

    // 4. Download PDF buffer to stream to client
    const pdfRes = await fetch(pdfUrl);
    if (!pdfRes.ok) {
      return new NextResponse("Failed to download document from storage provider", { status: 502 });
    }

    const pdfBuffer = await pdfRes.arrayBuffer();

    // 5. Construct safe filename
    const docTitle = submission.document?.title || "Agreement";
    const safeFilename = `${docTitle.replace(/[^a-zA-Z0-9_\-]/g, "_")}-Signed.pdf`;

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safeFilename}"`,
        "Cache-Control": "private, no-cache, no-store, must-revalidate",
      },
    });
  } catch (error) {
    console.error("Error downloading agreement PDF:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
