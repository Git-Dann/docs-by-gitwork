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

/**
 * Robustly finds a submitter by role name with case-insensitivity and positional fallback.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findSubmitter(submitters: any[], roleName: "client" | "gitwork") {
  if (!Array.isArray(submitters) || submitters.length === 0) return undefined;

  // 1. Case-insensitive & trimmed role match
  const matched = submitters.find(
    (s) => s.role?.toString().toLowerCase().trim() === roleName,
  );
  if (matched) return matched;

  // 2. Positional fallback: order is preserved (Client = 0, Gitwork = 1)
  if (roleName === "client" && submitters[0]) return submitters[0];
  if (roleName === "gitwork" && submitters[1]) return submitters[1];

  return undefined;
}

export async function POST(request: NextRequest) {
  try {
    // 1. Security: Secret path/token validation
    const token = request.nextUrl.searchParams.get("token");
    if (!token || token !== process.env.DOCUSEAL_WEBHOOK_SECRET) {
      console.warn("DocuSeal Webhook 401: Secret token mismatch or missing token parameter");
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
    let submission = null;

    // Extract potential submission IDs
    const rawSubId =
      data.submission_id ??
      data.submission?.id ??
      (eventType.startsWith("submission.") ? data.id : null);

    const directSubmissionId = typeof rawSubId === "number" ? rawSubId : rawSubId ? Number(rawSubId) : null;

    if (directSubmissionId && !isNaN(directSubmissionId)) {
      submission = await prisma.docusealSubmission.findUnique({
        where: { submissionId: directSubmissionId },
        include: { document: true },
      });
    }

    // Fallback: parse documentId from external_id
    if (!submission) {
      const rawExtId = data.external_id ?? data.submission?.external_id;
      if (typeof rawExtId === "string") {
        const documentId = rawExtId.split(":")[0];
        if (documentId) {
          submission = await prisma.docusealSubmission.findFirst({
            where: { documentId },
            orderBy: { createdAt: "desc" },
            include: { document: true },
          });
        }
      }
    }

    if (!submission) {
      console.warn("DocuSeal webhook: submission not found for event", eventType, {
        id: data.id,
        submission_id: data.submission_id,
        external_id: data.external_id,
      });
      return new NextResponse("Submission not found locally", { status: 200 });
    }

    // ── 3. Idempotency guards ─────────────────────────────────────────────────
    if (submission.status === "COMPLETED") {
      return new NextResponse("Already completed", { status: 200 });
    }

    const eventRole = data.role?.toString().toLowerCase().trim();
    if (
      (eventType === "form.completed" || eventType === "form.declined") &&
      eventRole === "client" &&
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
    const submitters: any[] = verifiedData.submitters || (Array.isArray(verifiedData) ? verifiedData : []);

    const clientSubmitter = findSubmitter(submitters, "client");
    const gitworkSubmitter = findSubmitter(submitters, "gitwork");

    console.log(`DocuSeal webhook event: ${eventType} for submission ${submission.submissionId}`, {
      clientStatus: clientSubmitter?.status,
      gitworkStatus: gitworkSubmitter?.status,
      currentDbStatus: submission.status,
    });

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
      console.log(`Updating submission ${submission.submissionId} status: ${submission.status} -> ${newStatus}`);

      await prisma.docusealSubmission.update({
        where: { id: submission.id },
        data: { status: newStatus },
      });

      if (newStatus === "CLIENT_SIGNED") {
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
        await prisma.document.update({
          where: { id: submission.documentId },
          data: { status: "ACCEPTED", acceptedAt: new Date() },
        });

        archiveDocusealSubmission(submission.id, verifiedData).catch((err: unknown) => {
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
