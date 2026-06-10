import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { addCourseRequest } from "@/server/wiki";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { z } from "zod";

const bodySchema = z.object({
  courseName: z.string().min(1),
  country: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  status: z.enum(["NEW", "SENT", "ADDED", "REJECTED"]).optional(),
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

    const body = bodySchema.parse(await req.json());
    const request = await addCourseRequest(client.id, body);
    return apiOk(request);
  } catch (err) {
    return fromError(err);
  }
}
