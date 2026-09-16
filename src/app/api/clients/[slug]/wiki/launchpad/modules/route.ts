/** Internal: toggle which optional Launchpad modules a client's kit asks for. */

import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { applyLaunchpadPrefill, setLaunchpadModules } from "@/server/launchpad";
import { launchpadModulesSchema } from "@/server/validators";
import { assertCan, canManageClients, getEffectiveUserOrNull } from "@/server/auth/effective-user";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    assertCan(await getEffectiveUserOrNull(req), canManageClients, "manage the Launchpad");
    const { slug } = await params;
    const { workspace } = await ensureBaseRecords();
    const client = await prisma.workspaceClient.findUnique({
      where: { workspaceId_slug: { workspaceId: workspace.id, slug } },
      select: { id: true },
    });
    if (!client) return apiError("Client not found", 404);

    const { enabledModules } = launchpadModulesSchema.parse(await req.json());
    const updated = await setLaunchpadModules(client.id, enabledModules);
    if (!updated) return apiError("No Launchpad assigned for this client", 409);

    // A newly-enabled module brings fields we may already have answers for.
    const launchpad = (await applyLaunchpadPrefill(client.id)) ?? updated;
    return apiOk({ launchpad });
  } catch (err) {
    return fromError(err);
  }
}
