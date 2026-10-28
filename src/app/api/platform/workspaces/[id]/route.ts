/**
 * PATCH /api/platform/workspaces/[id] — change which modules a business has and
 * whether it may use Gitwork's AI keys. Platform admins only; every change is audited.
 */

import { z } from "zod";
import { apiOk, fromError } from "@/lib/api-response";
import { requirePlatformAdmin } from "@/server/platform/admin";
import { updatePlatformWorkspace } from "@/server/platform/workspaces";

export const dynamic = "force-dynamic";

const updateSchema = z
  .object({
    modulesRestricted: z.boolean().optional(),
    enabledModules: z.array(z.string().max(40)).max(40).optional(),
    platformAiKeysAllowed: z.boolean().optional(),
    confirmHome: z.boolean().optional(),
  })
  .strict();

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePlatformAdmin(request);
    const { id } = await params;
    const input = updateSchema.parse(await request.json());
    return apiOk({ workspace: await updatePlatformWorkspace(actor.id, id, input) });
  } catch (error) {
    return fromError(error);
  }
}
