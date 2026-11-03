/**
 * GET /api/wiki/{token}/drive/thumbnail/{fileId} — a file's small preview, for the client's
 * copy. Same gate as the list; only for a file under the client's folder.
 */
import { NextRequest } from "next/server";
import { apiError, fromError } from "@/lib/api-response";
import { DriveReadError, readThumbnail } from "@/server/client-drive";
import {
  assertWikiDriveRate,
  readerDrive,
  resolveWikiDriveAccess,
  wikiDriveAccessError,
} from "@/server/wiki-drive";
import { isDriveId } from "@/lib/client-drive";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string; fileId: string }> }) {
  try {
    const { token, fileId } = await params;
    if (!isDriveId(fileId)) return apiError("Not a Drive file id", 400);
    const resolved = await resolveWikiDriveAccess(req, token);
    if (!resolved.ok) {
      const { message, status } = wikiDriveAccessError(resolved.reason);
      return apiError(message, status);
    }
    if (!resolved.access.rootId) return apiError("No preview", 404);
    await assertWikiDriveRate(req, "thumb");
    const reader = await readerDrive(resolved.access);
    const accessToken = reader ? await reader.accessToken() : null;
    if (!reader || !accessToken) return apiError("No preview", 404);
    try {
      const thumb = await readThumbnail(reader.drive, accessToken, resolved.access.rootId, fileId);
      if (!thumb) return apiError("No preview", 404);
      return new Response(thumb.bytes, {
        headers: {
          "Content-Type": thumb.contentType,
          "Cache-Control": "private, max-age=600",
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch (err) {
      if (err instanceof DriveReadError) return apiError("No preview", 404);
      throw err;
    }
  } catch (err) {
    return fromError(err);
  }
}
