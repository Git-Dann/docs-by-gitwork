import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { getWikiBySlug } from "@/server/wiki";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const { workspace } = await ensureBaseRecords();
    const workspaceId = workspace.id;
    const wiki = await getWikiBySlug(slug, workspaceId);
    if (!wiki) return apiError("Client not found", 404);
    return apiOk(wiki);
  } catch (err) {
    return fromError(err);
  }
}
