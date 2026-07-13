import { apiOk, fromError } from "@/lib/api-response";
import { listWorkspaceMembers } from "@/server/support";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ clientId: string }> },
) {
  try {
    const { clientId } = await params;
    const members = await listWorkspaceMembers(clientId);
    return apiOk({ members });
  } catch (error) {
    return fromError(error);
  }
}
