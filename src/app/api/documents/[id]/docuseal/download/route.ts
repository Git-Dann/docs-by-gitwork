import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertCan, canManageDocs, getEffectiveUserOrNull } from "@/server/auth/effective-user";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await getEffectiveUserOrNull(request);
    assertCan(user, canManageDocs, "download signed MSA PDF");

    const { id } = await context.params;
    const submission = await prisma.docusealSubmission.findFirst({
      where: { documentId: id },
    });

    if (!submission) {
      return new NextResponse("Submission not found", { status: 404 });
    }

    let pdfUrl = submission.combinedPdfUrl;

    const DOCUSEAL_API_KEY = process.env.DOCUSEAL_API_KEY;
    if (!pdfUrl && DOCUSEAL_API_KEY) {
      const res = await fetch(`https://api.docuseal.com/submissions/${submission.submissionId}`, {
        headers: { "X-Auth-Token": DOCUSEAL_API_KEY },
      });
      if (res.ok) {
        const data = await res.json();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const submitters: any[] = data.submitters || (Array.isArray(data) ? data : []);
        const documents = data.documents || submitters[0]?.documents || [];
        pdfUrl = documents[0]?.url || submission.combinedPdfUrl;
      }
    }

    if (!pdfUrl) {
      return new NextResponse("Signed PDF not available yet", { status: 404 });
    }

    const fileRes = await fetch(pdfUrl);
    if (!fileRes.ok) {
      return NextResponse.redirect(pdfUrl);
    }

    const buffer = await fileRes.arrayBuffer();
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="Signed-MSA-${submission.submissionId}.pdf"`,
      },
    });
  } catch (err) {
    console.error("Error fetching signed MSA PDF:", err);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
