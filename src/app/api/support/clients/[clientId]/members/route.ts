import { apiOk, fromError } from "@/lib/api-response";
import { listWorkspaceMembers } from "@/server/support";
import { requireSupportClient } from "@/server/support-scope";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ clientId: string }> },
) {
  try {
    const { clientId } = await params;
    const workspaceId = await requireSupportClient(request, clientId);
    const members = await listWorkspaceMembers(workspaceId, clientId);
    return apiOk({ members });
  } catch (error) {
    return fromError(error);
  }
}
