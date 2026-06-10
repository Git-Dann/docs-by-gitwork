import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { runCourseFeedbackImport } from "@/server/wiki-course-feedback";
import { z } from "zod";

// AI extraction adds a batched completion to the import; give it headroom.
export const maxDuration = 60;

// Explicit ids (manual triage) OR a scan-all/keyword bulk pull. aiExtract pre-fills
// course name + country; onlyCourseRequests filters out non-course feedback.
const bodySchema = z.object({
  conversationIds: z.array(z.string()).optional(),
  keywords: z.array(z.string()).optional(),
  aiExtract: z.boolean().optional(),
  onlyCourseRequests: z.boolean().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const { workspace } = await ensureBaseRecords();
    const client = await prisma.workspaceClient.findUnique({
      where: { workspaceId_slug: { workspaceId: workspace.id, slug } },
      select: { id: true },
    });
    if (!client) return apiError("Client not found", 404);

    const opts = bodySchema.parse(await req.json());
    const result = await runCourseFeedbackImport(client.id, opts);
    return apiOk({
      created: result.created,
      count: result.created.length,
      skipped: result.skipped,
      scanned: result.scanned,
      aiUsed: result.aiUsed,
    });
  } catch (err) {
    return fromError(err);
  }
}
