import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { applyCommentViewer, getWikiBySlug, updateWikiPlatforms } from "@/server/wiki";
import { getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { internalCommentViewer } from "@/server/wiki-comment-viewer";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { workspaceIdForRequest } from "@/server/workspaces/scope";
import { assertClientWriter } from "@/server/client-write-access";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const workspaceId = await workspaceIdForRequest(req);
    // `?courseRequests=0`: the app loads that list on its own (it's 5,000+ rows for Wedge).
    const courseRequests = req.nextUrl.searchParams.get("courseRequests") !== "0";
    const wiki = await getWikiBySlug(slug, workspaceId, { courseRequests });
    if (!wiki) return apiError("Client not found", 404);
    // Which replies the caller may edit/delete — an API-key caller (null) gets none.
    const viewer = internalCommentViewer(await getEffectiveUserOrNull(req));
    return apiOk(await applyCommentViewer(wiki, viewer));
  } catch (err) {
    return fromError(err);
  }
}

const patchSchema = z.object({
  platforms: z.array(z.enum(["IOS", "ANDROID", "FIRESTICK", "WEB"])).min(1),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    await assertClientWriter(req, slug);
    const workspaceId = await workspaceIdForRequest(req);

    const client = await prisma.workspaceClient.findUnique({
      where: { workspaceId_slug: { workspaceId, slug } },
      select: { id: true },
    });
    if (!client) return apiError("Client not found", 404);

    const body = patchSchema.parse(await req.json());
    const wiki = await updateWikiPlatforms(client.id, body.platforms);
    return apiOk(wiki);
  } catch (err) {
    return fromError(err);
  }
}
