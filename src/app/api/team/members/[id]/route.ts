import { removeMember } from "@/server/team";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { auth } from "@/auth";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (session?.user?.role !== "ADMIN") return apiError("Forbidden", 403);
    const { id } = await params;
    if (!id) return apiError("Missing id", 400);
    await removeMember(id);
    return apiOk({ ok: true });
  } catch (e) {
    return fromError(e);
  }
}
