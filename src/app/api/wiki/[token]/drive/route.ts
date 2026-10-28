/**
 * GET /api/wiki/{token}/drive?view=added|edited|folder[&folder=<id>]
 *
 * The client's Drive files on their wiki, read with the sign-in of the team member who switched
 * the section on (src/server/wiki-drive.ts). Hardened posture: a logged-in client user or a
 * Gitwork session, never the link alone. Every failure the CLIENT can't fix reads
 * "unavailable" — whose Google account, and why it failed, is ours to know.
 */
import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { driveResponse } from "@/server/client-drive";
import {
  assertWikiDriveRate,
  readerDrive,
  resolveWikiDriveAccess,
  wikiDriveAccessError,
} from "@/server/wiki-drive";
import { parseDriveView } from "@/lib/client-drive";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const resolved = await resolveWikiDriveAccess(req, token);
    if (!resolved.ok) {
      const { message, status } = wikiDriveAccessError(resolved.reason);
      return apiError(message, status);
    }
    await assertWikiDriveRate(req, "list");
    const reader = await readerDrive(resolved.access);
    return apiOk(
      await driveResponse(reader?.drive ?? null, {
        folderUrl: null,
        rootId: resolved.access.rootId,
        view: parseDriveView(req.nextUrl.searchParams.get("view")),
        folder: req.nextUrl.searchParams.get("folder"),
        missingReader: "unavailable",
        forClient: true,
      }),
    );
  } catch (err) {
    return fromError(err);
  }
}
