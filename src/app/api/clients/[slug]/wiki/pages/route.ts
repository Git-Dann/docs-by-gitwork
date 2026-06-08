import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { upsertWikiPage } from "@/server/wiki";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { z } from "zod";

const bodySchema = z.object({
  type: z.enum(["IA_GUIDE", "DEV_API_GUIDE", "APP_STORE_IOS", "APP_STORE_ANDROID", "APP_STORE_FIRESTICK", "CUSTOM"]),
  title: z.string().min(1),
  content: z.unknown().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const { workspaceId } = await ensureBaseRecords();
    const client = await prisma.workspaceClient.findUnique({
      where: { workspaceId_slug: { workspaceId, slug } },
      select: { id: true },
    });
    if (!client) return apiError("Client not found", 404);

    const body = bodySchema.parse(await req.json());
    const page = await upsertWikiPage(client.id, body);
    return apiOk(page);
  } catch (err) {
    return fromError(err);
  }
}
