import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { deleteWikiPage, upsertWikiPage } from "@/server/wiki";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { z } from "zod";

const wikiPageTypeSchema = z.enum([
  "IA_GUIDE",
  "DEV_API_GUIDE",
  "API_DOCS",
  "ARCHITECTURE",
  "RUNBOOK",
  "DATA_MODEL",
  "APP_STORE_IOS",
  "APP_STORE_ANDROID",
  "APP_STORE_FIRESTICK",
  "CUSTOM",
]);

const bodySchema = z.object({
  type: wikiPageTypeSchema,
  title: z.string().min(1),
  content: z.unknown().optional(),
});

const deleteSchema = z.object({
  type: wikiPageTypeSchema,
});

export async function POST(
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

    const body = bodySchema.parse(await req.json());
    const page = await upsertWikiPage(client.id, body);
    return apiOk(page);
  } catch (err) {
    return fromError(err);
  }
}

export async function DELETE(
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

    const body = deleteSchema.parse(await req.json());
    const result = await deleteWikiPage(client.id, body);
    return apiOk(result);
  } catch (err) {
    return fromError(err);
  }
}
