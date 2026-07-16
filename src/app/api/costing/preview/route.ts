import { apiOk, fromError } from "@/lib/api-response";
import { assertSuperAdmin, requireAuthedUser } from "@/server/auth/effective-user";
import { computeGitworkCosting } from "@/server/costing";
import { costingPreviewSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

// Compute (no persistence). Super-Admin only — exposes internal cost + margin.
export async function POST(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    assertSuperAdmin(user);
    const body = costingPreviewSchema.parse(await req.json());
    return apiOk(await computeGitworkCosting(user.workspaceId, body.config, body.scope));
  } catch (e) {
    return fromError(e);
  }
}
