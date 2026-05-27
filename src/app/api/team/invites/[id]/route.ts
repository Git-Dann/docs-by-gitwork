import { revokeInvite } from "@/server/team";
import { apiOk, apiError, fromError } from "@/lib/api-response";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!id) return apiError("Missing id", 400);
    const invite = await revokeInvite(id);
    return apiOk(invite);
  } catch (e) {
    return fromError(e);
  }
}
