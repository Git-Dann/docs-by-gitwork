import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { setWikiAccess } from "@/server/wiki";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { z } from "zod";

const bodySchema = z.object({
  protected: z.boolean(),
  username: z.string().max(120).optional(),
  password: z.string().max(200).optional(),
});

// Set/clear the public-link username/password gate for this client's wiki.
export async function PATCH(
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

    const body = bodySchema.parse(await req.json());
    const result = await setWikiAccess(client.id, body);
    return apiOk(result);
  } catch (err) {
    return fromError(err);
  }
}
