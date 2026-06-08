import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { addChangelogEntry } from "@/server/wiki";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { z } from "zod";

const bodySchema = z.object({
  platform: z.enum(["IOS", "ANDROID", "FIRESTICK", "WEB", "ALL"]),
  version: z.string().min(1),
  title: z.string().min(1),
  body: z.string().optional(),
  releasedAt: z.string().optional(),
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
    const entry = await addChangelogEntry(client.id, body);
    return apiOk(entry);
  } catch (err) {
    return fromError(err);
  }
}
