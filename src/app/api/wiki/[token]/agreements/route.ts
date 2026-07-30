import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { resolvePublicWiki } from "@/server/wiki";

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

    const mapped = submissions.map((sub) => ({
      id: sub.id,
      submissionId: sub.submissionId,
      slug: sub.slug,
      status: sub.status,
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
