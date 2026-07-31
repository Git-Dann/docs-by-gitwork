import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendWorkspaceEmail } from "@/server/email";
import { archiveDocusealSubmission } from "@/server/docuseal-archive";

/**
 * GET handler — DocuSeal sometimes follows a 307 redirect (nginx trailing-slash
 * normalisation) and ends up hitting the same URL with a GET. Returning 200 here
 * stops that from showing as a "failure" in the DocuSeal events log and prevents
 * any retry loops on their side.
 */
export async function GET() {
  return new NextResponse("OK", { status: 200 });
}

export async function POST(request: NextRequest) {
  try {
    // 1. Security: Secret path/token validation
    const token = request.nextUrl.searchParams.get("token");
    if (!token || token !== process.env.DOCUSEAL_WEBHOOK_SECRET) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const payload = await request.json();
    const eventType: string = payload.event_type;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: Record<string, any> = payload.data;

    if (!eventType || !data) {
      return new NextResponse("Bad Request", { status: 400 });
    }

    // ── 2. Resolve the local DocusealSubmission record ────────────────────────
    //
    // DocuSeal sends different shapes depending on the event type:
    //
    //   form.completed / form.declined / form.viewed / form.started
    //     → `data` is the SUBMITTER object
    //       data.id           = submitter ID  (NOT the submission ID)
    //       data.external_id  = "<documentId>:<role>"  (e.g. "abc123:client")
    //       data.submission_id may be present on some versions but is unreliable
    //
    //   submission.completed / submission.created / submission.expired
    //     → `data` is the SUBMISSION object
    //       data.id           = submission ID
    //       data.submitters   = [...] (array of submitter objects)
    //
    // Strategy: try submission_id first (reliable for submission.* events), then
    // fall back to parsing external_id for form.* events.

    let submission = null;

    // Path A — submission-level events carry the submission ID directly
    const directSubmissionId: number | null =
      typeof data.submission_id === "number"
        ? data.submission_id
        : eventType.startsWith("submission.")
          ? Number(data.id)
          : null;

    if (directSubmissionId) {
      submission = await prisma.docusealSubmission.findUnique({
        where: { submissionId: directSubmissionId },
        include: { document: true },
      });
    }

    // Path B — form-level events: parse documentId from external_id
    if (!submission && typeof data.external_id === "string") {
      // external_id format: "<documentId>:<role>"  e.g. "cms8tywr00186t701hxvvzh68:client"
      const documentId = data.external_id.split(":")[0];
      if (documentId) {
        submission = await prisma.docusealSubmission.findFirst({
          where: { documentId },
          orderBy: { createdAt: "desc" }, // newest if somehow multiple exist
          include: { document: true },
        });
      }
    }

    if (!submission) {
      // Not found — log and return 200 so DocuSeal doesn't retry endlessly
      console.warn("DocuSeal webhook: submission not found for event", eventType, data);
      return new NextResponse("Submission not found locally", { status: 200 });
    }

    // ── 3. Idempotency guards ─────────────────────────────────────────────────
    if (submission.status === "COMPLETED") {
      return new NextResponse("Already completed", { status: 200 });
    }
    if (
      (eventType === "form.completed" || eventType === "form.declined") &&
      data.role === "Client" &&
      submission.status !== "PENDING"
    ) {
      return new NextResponse("Client already processed", { status: 200 });
    }

    // ── 4. Verify against DocuSeal API (anti-spoofing) ────────────────────────
    const DOCUSEAL_API_KEY = process.env.DOCUSEAL_API_KEY;
    const verifyRes = await fetch(
      `https://api.docuseal.com/submissions/${submission.submissionId}`,
      { headers: { "X-Auth-Token": DOCUSEAL_API_KEY! } },
    );

    if (!verifyRes.ok) {
      console.error("DocuSeal verify failed:", verifyRes.status, await verifyRes.text());
      return new NextResponse("Failed to verify submission with DocuSeal", { status: 502 });
    }

    const verifiedData = await verifyRes.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const submitters: any[] = verifiedData.submitters || [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clientSubmitter = submitters.find((s: any) => s.role === "Client");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gitworkSubmitter = submitters.find((s: any) => s.role === "Gitwork");

    // ── 5. Determine the new status from live API data ────────────────────────
    let newStatus = submission.status;

    if (
      clientSubmitter?.status === "completed" &&
      gitworkSubmitter?.status === "completed"
    ) {
      newStatus = "COMPLETED";
    } else if (clientSubmitter?.status === "completed") {
      newStatus = "CLIENT_SIGNED";
    } else if (
      eventType.includes("declined") ||
      clientSubmitter?.status === "declined"
    ) {
      newStatus = "DECLINED";
    }

    // ── 6. Persist and fire side-effects if status changed ────────────────────
    if (newStatus !== submission.status) {
      await prisma.docusealSubmission.update({
        where: { id: submission.id },
        data: { status: newStatus },
      });

      if (newStatus === "CLIENT_SIGNED") {
        // Notify Gitwork admin to countersign
        if (submission.gitworkSlug) {
          const baseUrl =
            process.env.NEXT_PUBLIC_APP_URL || "https://staging.foundry.gitwork.tech";
          const signingUrl = `${baseUrl}/contract/${submission.gitworkSlug}`;

          await sendWorkspaceEmail({
            workspaceId: submission.document.workspaceId,
            to:
              process.env.GITWORK_ADMIN_EMAIL || "muhammad.usman@gitwork.co.uk",
            subject: `Action Required: Countersign ${submission.document.title}`,
            html: `<p>The client has signed the MSA for <strong>${submission.document.title}</strong>.</p>
                   <p>Please click the link below to review and countersign:</p>
                   <a href="${signingUrl}">${signingUrl}</a>`,
          });
        }
      } else if (newStatus === "COMPLETED") {
        // Mark document as accepted
        await prisma.document.update({
          where: { id: submission.documentId },
          data: { status: "ACCEPTED", acceptedAt: new Date() },
        });

        // Trigger async archiving (fire-and-forget — don't block the webhook response)
        archiveDocusealSubmission(submission.id, verifiedData).catch((err) => {
          console.error("Failed to archive DocuSeal submission:", err);
        });
      } else if (newStatus === "DECLINED") {
        await prisma.document.update({
          where: { id: submission.documentId },
          data: { status: "DECLINED", declinedAt: new Date() },
        });
      }
    }

    return new NextResponse("OK", { status: 200 });
  } catch (error) {
    console.error("DocuSeal Webhook Error:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
