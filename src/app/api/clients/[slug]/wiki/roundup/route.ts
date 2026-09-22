/**
 * Enable/disable the RoundUp section (the sidebar Add New / delete). Nothing else:
 * the page derives everything from the timeline the wiki already carries,
 * so there is nothing here to write.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { assertCan, canManageClients, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { setWikiRoundupEnabled } from "@/server/wiki-support";

const bodySchema = z.object({ enabled: z.boolean() });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    assertCan(await getEffectiveUserOrNull(req), canManageClients, "manage the RoundUp section");
    const { slug } = await params;
    const { workspace } = await ensureBaseRecords();
    const client = await prisma.workspaceClient.findUnique({
      where: { workspaceId_slug: { workspaceId: workspace.id, slug } },
      select: { id: true },
    });
    if (!client) return apiError("Client not found", 404);
    const { enabled } = bodySchema.parse(await req.json());
    await setWikiRoundupEnabled(client.id, enabled);
    return apiOk({ enabled });
  } catch (err) {
    return fromError(err);
  }
}
