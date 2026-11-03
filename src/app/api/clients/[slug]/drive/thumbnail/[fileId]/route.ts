import { NextRequest } from "next/server";
import { google } from "googleapis";
import { apiError, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { assertClientAccessBySlug } from "@/server/client-assignments";
import { getUserGoogleAuth } from "@/server/google-auth";
import { DriveReadError, readThumbnail } from "@/server/client-drive";
import { driveFolderIdFromUrl, isDriveId } from "@/lib/client-drive";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

type RouteContext = { params: Promise<{ slug: string; fileId: string }> };

/**
 * GET /api/clients/{slug}/drive/thumbnail/{fileId}
 *
 * A Drive file's small preview image. Drive's thumbnail links need the viewer's Google token,
 * which the browser doesn't hold, so Foundry fetches it as them. Only for a file under this
 * client's folder — the route is not a way to read any image in someone's Drive.
 */
export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const { workspace } = await ensureBaseRecords();
    const { slug, fileId } = await context.params;
    await assertClientAccessBySlug(await getEffectiveUserOrNull(req), slug);
    if (!isDriveId(fileId)) return apiError("Not a Drive file id", 400);

    const client = await prisma.workspaceClient.findFirst({
      where: { slug, workspaceId: workspace.id },
      select: { googleDriveFolderUrl: true },
    });
    const rootId = driveFolderIdFromUrl(client?.googleDriveFolderUrl);
    if (!rootId) return apiError("No Drive folder", 404);

    const auth = await getUserGoogleAuth();
    if (!auth.ok) return apiError("Google isn't connected", 404);
    const { token } = await auth.client.getAccessToken();
    if (!token) return apiError("Google isn't connected", 404);

    try {
      const drive = google.drive({ version: "v3", auth: auth.client });
      const thumb = await readThumbnail(drive, token, rootId, fileId);
      if (!thumb) return apiError("No preview", 404);
      return new Response(thumb.bytes, {
        headers: {
          "Content-Type": thumb.contentType,
          // Per person (their token read it), so never a shared cache.
          "Cache-Control": "private, max-age=600",
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch (err) {
      if (err instanceof DriveReadError) return apiError("No preview", 404);
      throw err;
    }
  } catch (error) {
    return fromError(error);
  }
}
