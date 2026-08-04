import { prisma } from "@/lib/prisma";
import { archiveDocusealSubmission } from "@/server/docuseal-archive";

/**
 * Robustly finds a submitter by role name with case-insensitivity and positional fallback.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findSubmitter(submitters: any[], roleName: "client" | "gitwork") {
  if (!Array.isArray(submitters) || submitters.length === 0) return undefined;

  const matched = submitters.find(
    (s) => s.role?.toString().toLowerCase().trim() === roleName
  );
  if (matched) return matched;

  if (roleName === "client" && submitters[0]) return submitters[0];
  if (roleName === "gitwork" && submitters[1]) return submitters[1];

  return undefined;
}

/**
 * On-demand sync of pending/client-signed DocuSeal submissions with DocuSeal API.
 * Updates local DB status to match live DocuSeal status if changed.
 */
export async function syncPendingDocusealSubmissions(documentIds?: string[]): Promise<boolean> {
  const DOCUSEAL_API_KEY = process.env.DOCUSEAL_API_KEY;
  if (!DOCUSEAL_API_KEY) return false;

  try {
    const submissions = await prisma.docusealSubmission.findMany({
      where: {
        status: { in: ["PENDING", "CLIENT_SIGNED"] },
        ...(documentIds && documentIds.length > 0 ? { documentId: { in: documentIds } } : {}),
      },
      include: { document: true },
    });

    if (submissions.length === 0) return false;

    let updatedAny = false;

    for (const sub of submissions) {
      try {
        const res = await fetch(`https://api.docuseal.com/submissions/${sub.submissionId}`, {
          headers: { "X-Auth-Token": DOCUSEAL_API_KEY },
        });

        if (!res.ok) continue;

        const verifiedData = await res.json();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const submitters: any[] = verifiedData.submitters || (Array.isArray(verifiedData) ? verifiedData : [verifiedData]);

        const clientSubmitter = findSubmitter(submitters, "client");
        const gitworkSubmitter = findSubmitter(submitters, "gitwork");

        let newStatus = sub.status;
        if (clientSubmitter?.status === "completed" && gitworkSubmitter?.status === "completed") {
          newStatus = "COMPLETED";
        } else if (clientSubmitter?.status === "completed") {
          newStatus = "CLIENT_SIGNED";
        } else if (clientSubmitter?.status === "declined" || gitworkSubmitter?.status === "declined") {
          newStatus = "DECLINED";
        }

        if (newStatus !== sub.status) {
          updatedAny = true;
          await prisma.docusealSubmission.update({
            where: { id: sub.id },
            data: { status: newStatus },
          });

          if (newStatus === "COMPLETED") {
            await prisma.document.update({
              where: { id: sub.documentId },
              data: { status: "ACCEPTED", acceptedAt: new Date() },
            });
            archiveDocusealSubmission(sub.id, verifiedData).catch((err: unknown) => {
              console.error("Failed to archive submission on sync:", err);
            });
          } else if (newStatus === "DECLINED") {
            await prisma.document.update({
              where: { id: sub.documentId },
              data: { status: "DECLINED", declinedAt: new Date() },
            });
          }
        }
      } catch (err) {
        console.error(`Failed to sync DocuSeal submission ${sub.submissionId}:`, err);
      }
    }

    return updatedAny;
  } catch (err) {
    console.error("Failed to sync pending DocuSeal submissions:", err);
    return false;
  }
}
