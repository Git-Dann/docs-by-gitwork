/**
 * Enable/disable the Drive section (the sidebar Add New / delete), or hand the client's reader
 * over to the caller ("Read as me"). Switching on makes the CALLER the Google account the
 * client's copy is read with, so it needs a signed-in person — an API-key caller has no
 * Google account to lend — and is refused unless their Drive can open the folder now.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { assertCan, canManageClients, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { assertClientAccessBySlug } from "@/server/client-assignments";
import { auth } from "@/auth";
import { setWikiDriveEnabled, WikiDriveSetupError } from "@/server/wiki-drive";

const bodySchema = z.object({ enabled: z.boolean() });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const user = await getEffectiveUserOrNull(req);
    assertCan(user, canManageClients, "manage the Drive section");
    const { slug } = await params;
    await assertClientAccessBySlug(user, slug);
    const { workspace } = await ensureBaseRecords();
    const client = await prisma.workspaceClient.findUnique({
      where: { workspaceId_slug: { workspaceId: workspace.id, slug } },
      select: { id: true },
    });
    if (!client) return apiError("Client not found", 404);
    const { enabled } = bodySchema.parse(await req.json());
    try {
      // ⚠️ The SIGNED-IN person, never the "view as" user: previewing as a teammate must not
      // lend the client their Google account.
      const session = await auth();
      await setWikiDriveEnabled(client.id, enabled, session?.user?.id ?? null);
    } catch (err) {
      if (err instanceof WikiDriveSetupError) return apiError(err.message, err.status);
      throw err;
    }
    return apiOk({ enabled });
  } catch (err) {
    return fromError(err);
  }
}
