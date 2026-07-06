import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { addWikiIntakeItem } from "@/server/wiki";

const bodySchema = z.object({
  type: z.enum(["BUG", "FEEDBACK", "TASK"]).default("FEEDBACK"),
  title: z.string().trim().min(1).max(180),
  description: z.string().trim().max(10_000).optional().nullable(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).default("MEDIUM"),
  requestedBy: z.string().trim().max(120).optional().nullable(),
  externalRef: z.string().trim().max(180).optional().nullable(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const { workspace } = await ensureBaseRecords();
    const client = await prisma.workspaceClient.findUnique({
      where: { workspaceId_slug: { workspaceId: workspace.id, slug } },
      select: { id: true },
    });
    if (!client) return apiError("Client not found", 404);
    return apiOk(await addWikiIntakeItem(client.id, bodySchema.parse(await req.json())), { status: 201 });
  } catch (err) {
    return fromError(err);
  }
}
