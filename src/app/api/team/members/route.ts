import { listMembers } from "@/server/team";
import { apiOk, fromError } from "@/lib/api-response";

export async function GET() {
  try {
    const members = await listMembers();
    return apiOk(members);
  } catch (e) {
    return fromError(e);
  }
}
