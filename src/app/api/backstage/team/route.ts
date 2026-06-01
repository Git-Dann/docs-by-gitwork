import { apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { listWorkspaceMembers } from "@/server/backstage";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    const members = await listWorkspaceMembers(user);
    return apiOk(members);
  } catch (e) {
    return fromError(e);
  }
}
