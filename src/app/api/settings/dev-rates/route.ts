// PATCH /api/settings/dev-rates → { showDevRates: boolean }
// Toggles the workspace-level developer-rates visibility flag (Super Admin only).

import { z } from "zod";
import { apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser, assertSuperAdmin } from "@/server/auth/effective-user";
import { prisma } from "@/lib/prisma";
import { DEFAULT_WORKSPACE_SLUG } from "@/server/proposals";

export const dynamic = "force-dynamic";

const patchSchema = z.object({ showDevRates: z.boolean() });

export async function PATCH(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    assertSuperAdmin(user);
    const { showDevRates } = patchSchema.parse(await req.json());
    await prisma.workspace.update({
      where: { slug: DEFAULT_WORKSPACE_SLUG },
      data: { showDevRates },
    });
    return apiOk({ showDevRates });
  } catch (e) {
    return fromError(e);
  }
}
