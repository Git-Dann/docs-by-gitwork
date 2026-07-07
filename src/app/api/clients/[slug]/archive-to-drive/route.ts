import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { enqueueJob } from "@/server/jobs/queue";
import { assertCan, canManageClients, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { assertClientAccessBySlug } from "@/server/client-assignments";

export const dynamic = "force-dynamic";

/** GET — read the client's Drive archive status. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const user = await getEffectiveUserOrNull(request);
    assertCan(user, canManageClients, "view client archive status");
    await assertClientAccessBySlug(user, slug);

    const { workspace } = await ensureBaseRecords();
    const client = await prisma.workspaceClient.findUnique({
      where: { workspaceId_slug: { workspaceId: workspace.id, slug } },
      select: { archivedToDriveAt: true, archiveDriveFolderId: true },
    });
    if (!client) return apiError("Client not found", 404);

    return apiOk({
      archivedToDriveAt: client.archivedToDriveAt?.toISOString() ?? null,
      folderUrl: client.archiveDriveFolderId
        ? `https://drive.google.com/drive/folders/${client.archiveDriveFolderId}`
        : null,
    });
  } catch (error) {
    return fromError(error);
  }
}

/** POST — manually (re-)run the Drive archive for this client. Enqueues a durable, deduped job. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const user = await getEffectiveUserOrNull(request);
    assertCan(user, canManageClients, "archive a client to Drive");
    await assertClientAccessBySlug(user, slug);

    const { workspace } = await ensureBaseRecords();
    const client = await prisma.workspaceClient.findUnique({
      where: { workspaceId_slug: { workspaceId: workspace.id, slug } },
      select: { id: true },
    });
    if (!client) return apiError("Client not found", 404);

    const { id, deduped } = await enqueueJob({
      type: "CLIENT_ARCHIVE",
      payload: { clientId: client.id, reason: "manual" },
      workspaceId: workspace.id,
      dedupeKey: `client-archive:${client.id}`,
    });

    return apiOk({ jobId: id, queued: !deduped, alreadyRunning: deduped });
  } catch (error) {
    return fromError(error);
  }
}
