import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { resolvePublicWiki } from "@/server/wiki";
import { archiveDocusealSubmission } from "@/server/docuseal-archive";

interface RouteContext {
  params: Promise<{ token: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { token } = await context.params;
    const resolved = await resolvePublicWiki(token);
    if (!resolved) {
      return apiError("Unauthorized or invalid token", 401);
    }

    // Fetch all DocuSeal submissions for this client
    const submissions = await prisma.docusealSubmission.findMany({
      where: {
        document: {
          clientId: resolved.wiki.clientId,
        },
      },
      include: {
        document: {
          select: {
            title: true,
            documentType: true,
            createdAt: true,
          }
        }
      },
      orderBy: { createdAt: "desc" },
    });

    const DOCUSEAL_API_KEY = process.env.DOCUSEAL_API_KEY;
    let needsRefetch = false;

    // Check DocuSeal API for any unresolved submissions
    if (DOCUSEAL_API_KEY) {
      for (const sub of submissions) {
        if (sub.status === "PENDING" || sub.status === "CLIENT_SIGNED") {
          try {
            const res = await fetch(`https://api.docuseal.com/submissions/${sub.submissionId}`, {
              headers: { "X-Auth-Token": DOCUSEAL_API_KEY }
            });
            if (res.ok) {
              const data = await res.json();
              // data is an array of submitters
              const submitters = Array.isArray(data) ? data : [data];
              
              const clientSubmitter = submitters.find(s => s.role === "Client");
              const gitworkSubmitter = submitters.find(s => s.role === "Gitwork");
              
              let newStatus = sub.status;
              if (clientSubmitter?.status === "completed" && gitworkSubmitter?.status === "completed") {
                newStatus = "COMPLETED";
              } else if (clientSubmitter?.status === "completed") {
                newStatus = "CLIENT_SIGNED";
              }

              if (newStatus !== sub.status) {
                await prisma.docusealSubmission.update({
                  where: { id: sub.id },
                  data: { status: newStatus }
                });
                needsRefetch = true;

                if (newStatus === "COMPLETED") {
                  archiveDocusealSubmission(sub.id, data).catch((err: unknown) => {
                    console.error("Failed to archive submission from poll:", err);
                  });
                }
              }
            }
          } catch (e) {
            console.error(`Failed to poll DocuSeal for submission ${sub.submissionId}:`, e);
          }
        }
      }
    }

    let finalSubmissions = submissions;
    if (needsRefetch) {
      finalSubmissions = await prisma.docusealSubmission.findMany({
        where: { document: { clientId: resolved.wiki.clientId } },
        include: { document: { select: { title: true, documentType: true, createdAt: true } } },
        orderBy: { createdAt: "desc" },
      });
    }

    const mapped = finalSubmissions.map((sub) => ({
      id: sub.id,
      submissionId: sub.submissionId,
      slug: sub.slug,
      status: sub.status,
      combinedPdfUrl: sub.combinedPdfUrl,
      createdAt: sub.createdAt.toISOString(),
      document: {
        title: sub.document.title,
        documentType: String(sub.document.documentType),
        createdAt: sub.document.createdAt.toISOString(),
      }
    }));

    return apiOk(mapped);
  } catch (error) {
    return fromError(error);
  }
}
