import { apiOk, fromError } from "@/lib/api-response";
import { listWorkspaceMembers } from "@/server/support";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const members = await listWorkspaceMembers();
    return apiOk({ members });
  } catch (error) {
    return fromError(error);
  }
}
