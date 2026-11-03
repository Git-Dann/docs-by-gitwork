/**
 * GET /api/wiki/{token}/drive/file/{fileId}[?inline=1] — one file from the client's folder,
 * so a client can open it without a Google account of their own. Google Docs and Slides come
 * as PDF, Sheets as Excel, Drawings as PNG; everything else as itself, up to 100 MB.
 *
 * Inline only for PDFs and images (the preview); everything else is a download with
 * `nosniff`, so nothing from a Drive folder can render as a page on Foundry's origin.
 */
import { NextRequest } from "next/server";
import { apiError, fromError } from "@/lib/api-response";
import { DriveReadError, INLINE_MIME, readFileForClient } from "@/server/client-drive";
import {
  assertWikiDriveRate,
  readerDrive,
  resolveWikiDriveAccess,
  wikiDriveAccessError,
} from "@/server/wiki-drive";
import { isDriveId } from "@/lib/client-drive";
import { attachmentDisposition } from "@/lib/launchpad/files";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string; fileId: string }> }) {
  try {
    const { token, fileId } = await params;
    if (!isDriveId(fileId)) return apiError("Not a Drive file id", 400);
    const resolved = await resolveWikiDriveAccess(req, token);
    if (!resolved.ok) {
      const { message, status } = wikiDriveAccessError(resolved.reason);
      return apiError(message, status);
    }
    if (!resolved.access.rootId) return apiError("File not found", 404);
    await assertWikiDriveRate(req, "file");
    const reader = await readerDrive(resolved.access);
    if (!reader) return apiError("These files aren't available right now.", 503);
    try {
      const file = await readFileForClient(reader.drive, resolved.access.rootId, fileId);
      if (!file) return apiError("File not found", 404);
      const inline = req.nextUrl.searchParams.get("inline") === "1" && INLINE_MIME.has(file.mime);
      const disposition = attachmentDisposition(file.filename);
      return new Response(file.body, {
        headers: {
          "Content-Type": file.mime,
          "Content-Disposition": inline ? disposition.replace(/^attachment/, "inline") : disposition,
          "Cache-Control": "private, max-age=300",
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch (err) {
      if (err instanceof DriveReadError) return apiError("These files aren't available right now.", 503);
      throw err;
    }
  } catch (err) {
    return fromError(err);
  }
}
