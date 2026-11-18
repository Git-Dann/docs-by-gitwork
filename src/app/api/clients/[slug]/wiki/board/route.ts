/**
 * Enable/disable the Board section (the sidebar Add New / delete). The board is the client's own
 * tasks, so there is nothing else to store: turning it off hides it, and keeps every card and
 * every piece of feedback.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { assertCan, canManageClients, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { setWikiBoardEnabled } from "@/server/wiki-board";
import { workspaceIdForRequest } from "@/server/workspaces/scope";

const bodySchema = z.object({ enabled: z.boolean() });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    assertCan(await getEffectiveUserOrNull(req), canManageClients, "manage the Board section");
    const { slug } = await params;
    const workspaceId = await workspaceIdForRequest(req);
    const client = await prisma.workspaceClient.findUnique({
      where: { workspaceId_slug: { workspaceId, slug } },
      select: { id: true },
    });
    if (!client) return apiError("Client not found", 404);
    const { enabled } = bodySchema.parse(await req.json());
    await setWikiBoardEnabled(client.id, enabled);
    return apiOk({ enabled });
  } catch (err) {
    return fromError(err);
  }
}
