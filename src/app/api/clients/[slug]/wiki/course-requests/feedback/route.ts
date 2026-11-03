import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { listCourseFeedbackCandidates } from "@/server/wiki-course-feedback";
import { workspaceIdForRequest } from "@/server/workspaces/scope";

export const maxDuration = 30;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const workspaceId = await workspaceIdForRequest(req);
    const client = await prisma.workspaceClient.findUnique({
      where: { workspaceId_slug: { workspaceId, slug } },
      select: { id: true },
    });
    if (!client) return apiError("Client not found", 404);

    const candidates = await listCourseFeedbackCandidates(client.id);
    return apiOk({ candidates });
  } catch (err) {
    return fromError(err);
  }
}
