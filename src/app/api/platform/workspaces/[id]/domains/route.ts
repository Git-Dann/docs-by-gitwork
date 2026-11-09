import { z } from "zod";
import { apiOk, fromError } from "@/lib/api-response";
import { requirePlatformAdmin } from "@/server/platform/admin";
import { setPlatformWorkspaceDomains } from "@/server/platform/workspaces";

/** PUT /api/platform/workspaces/[id]/domains { domains } — Google sign-in domains. Platform admins. */
export const dynamic = "force-dynamic";

const schema = z.object({ domains: z.array(z.string().max(253)).max(20) }).strict();

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePlatformAdmin(request);
    const { id } = await params;
    const { domains } = schema.parse(await request.json());
    return apiOk({ workspace: await setPlatformWorkspaceDomains(actor.id, id, domains) });
  } catch (error) {
    return fromError(error);
  }
}
