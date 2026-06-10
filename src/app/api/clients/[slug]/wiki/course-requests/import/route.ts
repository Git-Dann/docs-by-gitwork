import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { importCourseFeedback } from "@/server/wiki-course-feedback";
import { z } from "zod";

const bodySchema = z.object({
  conversationIds: z.array(z.string()).min(1),
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

    const { conversationIds } = bodySchema.parse(await req.json());
    const created = await importCourseFeedback(client.id, conversationIds);
    return apiOk({ created, count: created.length });
  } catch (err) {
    return fromError(err);
  }
}
