import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendWorkspaceEmail } from "@/server/email";
import { archiveDocusealSubmission } from "@/server/docuseal-archive";

export async function POST(request: NextRequest) {
  try {
    // 1. Security: Secret Path/Token Validation
    const token = request.nextUrl.searchParams.get("token");
    if (!token || token !== process.env.DOCUSEAL_WEBHOOK_SECRET) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const payload = await request.json();
    const eventType = payload.event_type;
    const data = payload.data;

    if (!eventType || !data) {
      return new NextResponse("Bad Request", { status: 400 });
    }

    const submissionId = data.submission_id || data.id;
    if (!submissionId) {
      return new NextResponse("Missing submission ID", { status: 400 });
    }

    // 2. Fetch submission from DB (idempotency check base)
    const submission = await prisma.docusealSubmission.findUnique({
      where: { submissionId: Number(submissionId) },
      include: { document: true }
    });

    if (!submission) {
      return new NextResponse("Submission not found locally", { status: 404 });
    }

    // 3. Prevent processing the same completion event multiple times (Idempotency)
    if (eventType === "submission.completed" && submission.status === "COMPLETED") {
      return new NextResponse("Already completed", { status: 200 });
    }
    if (eventType === "form.completed" && data.role === "Client" && submission.status !== "PENDING") {
      // If we already moved past PENDING, the client already signed
      return new NextResponse("Client already signed", { status: 200 });
    }

    // 4. Validate payload against DocuSeal API to prevent spoofing
    const DOCUSEAL_API_KEY = process.env.DOCUSEAL_API_KEY;
    const verifyRes = await fetch(`https://api.docuseal.com/submissions/${submissionId}`, {
      headers: { "X-Auth-Token": DOCUSEAL_API_KEY! }
    });
    
    if (!verifyRes.ok) {
      return new NextResponse("Failed to verify submission with DocuSeal", { status: 502 });
    }
    
    const verifiedData = await verifyRes.json();

    // 5. Handle Events
    if (eventType === "form.completed" && data.role === "Client") {
      // Client has signed. Notify Gitwork to countersign.
      await prisma.docusealSubmission.update({
        where: { id: submission.id },
        data: { status: "CLIENT_SIGNED" }
      });

      if (submission.gitworkSlug) {
        const signingUrl = `https://foundry.gitwork.co.uk/contract/${submission.gitworkSlug}`;
        
        await sendWorkspaceEmail({
          workspaceId: submission.document.workspaceId,
          to: "harry@gitwork.co.uk", // From handover document requirement
          subject: `Action Required: Countersign ${submission.document.title}`,
          html: `<p>The client has signed the MSA for ${submission.document.title}.</p>
                 <p>Please click the link below to review and countersign:</p>
                 <a href="${signingUrl}">${signingUrl}</a>`
        });
      }
    } 
    else if (eventType === "submission.completed") {
      // Both parties have signed.
      await prisma.docusealSubmission.update({
        where: { id: submission.id },
        data: { status: "COMPLETED" }
      });

      await prisma.document.update({
        where: { id: submission.documentId },
        data: { status: "ACCEPTED", acceptedAt: new Date() } // Update the document status
      });

      // Trigger the archiving pipeline asynchronously
      // We pass the verifiedData to avoid re-fetching
      archiveDocusealSubmission(submission.id, verifiedData).catch(err => {
        console.error("Failed to archive DocuSeal submission:", err);
      });
    }
    else if (eventType === "form.declined") {
      await prisma.docusealSubmission.update({
        where: { id: submission.id },
        data: { status: "DECLINED" }
      });
      await prisma.document.update({
        where: { id: submission.documentId },
        data: { status: "DECLINED", declinedAt: new Date() }
      });
    }

    return new NextResponse("OK", { status: 200 });
  } catch (error) {
    console.error("DocuSeal Webhook Error:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
