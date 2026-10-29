/**
 * GET   /api/platform/workspaces/[id] — one business, so its popup opens from a link.
 * PATCH /api/platform/workspaces/[id] — change which modules a business has and
 * whether it may use Gitwork's AI keys. Platform admins only; every change is audited.
 * A save carrying an out-of-date expectedUpdatedAt is refused with 409.
 */

import { z } from "zod";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { requirePlatformAdmin } from "@/server/platform/admin";
import { getPlatformWorkspace, updatePlatformWorkspace } from "@/server/platform/workspaces";

export const dynamic = "force-dynamic";

const updateSchema = z
  .object({
    modulesRestricted: z.boolean().optional(),
    enabledModules: z.array(z.string().max(40)).max(40).optional(),
    platformAiKeysAllowed: z.boolean().optional(),
    confirmHome: z.boolean().optional(),
    expectedUpdatedAt: z.string().datetime().optional(),
  })
  .strict();

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePlatformAdmin(request);
    const { id } = await params;
    const workspace = await getPlatformWorkspace(id);
    if (!workspace) return apiError("Business not found", 404);
    return apiOk({ workspace });
  } catch (error) {
    return fromError(error);
  }
}

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
