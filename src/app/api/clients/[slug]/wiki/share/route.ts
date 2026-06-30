import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { setWikiShare, setWikiSectionShare } from "@/server/wiki";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { z } from "zod";

// `section` present → per-page share; absent → whole-wiki share.
const bodySchema = z.object({
  enabled: z.boolean(),
  section: z
    .enum([
      "timeline",
      "system-status",
      "design-system",
      "ia",
      "dev-guide",
      "api-docs",
      "architecture",
      "runbook",
      "data-model",
      "changelog",
      "course-requests",
    ])
    .optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const { workspace } = await ensureBaseRecords();
    const workspaceId = workspace.id;
    const client = await prisma.workspaceClient.findUnique({
      where: { workspaceId_slug: { workspaceId, slug } },
      select: { id: true },
    });
    if (!client) return apiError("Client not found", 404);

    const { enabled, section } = bodySchema.parse(await req.json());
    const result = section
      ? await setWikiSectionShare(client.id, section, enabled)
      : await setWikiShare(client.id, enabled);
    return apiOk(result);
  } catch (err) {
    return fromError(err);
  }
}
