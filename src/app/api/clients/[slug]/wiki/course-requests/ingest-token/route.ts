import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { getCourseIngest, setCourseIngest } from "@/server/wiki";
import { z } from "zod";

const bodySchema = z.object({
  enabled: z.boolean(),
  rotate: z.boolean().optional(),
});

async function resolveClientId(slug: string): Promise<string | null> {
  const { workspace } = await ensureBaseRecords();
  const client = await prisma.workspaceClient.findUnique({
    where: { workspaceId_slug: { workspaceId: workspace.id, slug } },
    select: { id: true },
  });
  return client?.id ?? null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const clientId = await resolveClientId(slug);
    if (!clientId) return apiError("Client not found", 404);
    return apiOk(await getCourseIngest(clientId));
  } catch (err) {
    return fromError(err);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const clientId = await resolveClientId(slug);
    if (!clientId) return apiError("Client not found", 404);

    const { enabled, rotate } = bodySchema.parse(await req.json());
    return apiOk(await setCourseIngest(clientId, { enabled, rotate }));
  } catch (err) {
    return fromError(err);
  }
}
