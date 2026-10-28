import { NextRequest } from "next/server";
import { google } from "googleapis";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { assertClientAccessBySlug } from "@/server/client-assignments";
import { getUserGoogleAuth } from "@/server/google-auth";
import { driveResponse } from "@/server/client-drive";
import { driveFolderIdFromUrl, parseDriveView } from "@/lib/client-drive";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type RouteContext = { params: Promise<{ slug: string }> };

/**
 * GET /api/clients/{slug}/drive?view=added|edited|folder[&folder=<id>]
 *
 * The client's Drive folder for the TEAM, read with the caller's OWN Google sign-in — so Drive's
 * own sharing decides what each person sees. Every failure is a 200 carrying a `state`, so the
 * card can say what to do instead of showing an empty list that reads as "there are no files".
 */
export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const { workspace } = await ensureBaseRecords();
    const { slug } = await context.params;
    await assertClientAccessBySlug(await getEffectiveUserOrNull(req), slug);

    const client = await prisma.workspaceClient.findFirst({
      where: { slug, workspaceId: workspace.id },
      select: { googleDriveFolderUrl: true },
    });
    if (!client) return apiError("Client not found", 404);

    const folderUrl = client.googleDriveFolderUrl?.trim() || null;
    const auth = await getUserGoogleAuth();
    const drive = auth.ok ? google.drive({ version: "v3", auth: auth.client }) : null;
    return apiOk(
      await driveResponse(drive, {
        folderUrl,
        rootId: driveFolderIdFromUrl(folderUrl),
        view: parseDriveView(req.nextUrl.searchParams.get("view")),
        folder: req.nextUrl.searchParams.get("folder"),
        missingReader: !auth.ok && auth.reason === "not_connected" ? "not_connected" : "error",
      }),
    );
  } catch (error) {
    return fromError(error);
  }
}
