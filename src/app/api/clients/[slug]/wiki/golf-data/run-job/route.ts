import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { runCourseJob } from "@/server/bigwedge-course-api";
import { requireAuthedUser, assertCan, canManageClients } from "@/server/auth/effective-user";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const maxDuration = 60;

const bodySchema = z.object({
  job: z.string().min(1),
  batch: z.number().int().min(1).max(200).optional(),
});

/**
 * Trigger an enrichment/seed job on the Big Wedge course backend.
 * NOTE: this writes to the COURSE BACKEND (its own DB), never to Foundry. Gated
 * to client-managers; the backend additionally enforces approver/admin.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const user = await requireAuthedUser(req);
    assertCan(user, canManageClients, "run course enrichment jobs");

    const client = await prisma.workspaceClient.findUnique({
      where: { workspaceId_slug: { workspaceId: user.workspaceId, slug } },
      select: { id: true },
    });
    if (!client) return apiError("Client not found", 404);

    const { job, batch } = bodySchema.parse(await req.json());
    const result = await runCourseJob(client.id, job, batch ?? 50);
    return apiOk(result);
  } catch (err) {
    return fromError(err);
  }
}
