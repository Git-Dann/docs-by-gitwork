// PATCH  /api/backstage/commitments/[id]  → edit, accept, complete, snooze, dismiss, reopen
// DELETE /api/backstage/commitments/[id]  → delete one typed by hand (suggestions are dismissed)
import { apiOk, fromError } from "@/lib/api-response";
import { commitmentsUser } from "@/server/commitments-route";
import { deleteCommitment, updateCommitment } from "@/server/commitments";
import { commitmentUpdateSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await commitmentsUser(req);
    const { id } = await params;
    const body = commitmentUpdateSchema.parse(await req.json());
    return apiOk({ commitment: await updateCommitment(user, id, body) });
  } catch (e) {
    return fromError(e);
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await commitmentsUser(req);
    const { id } = await params;
    await deleteCommitment(user, id);
    return apiOk({ deleted: true });
  } catch (e) {
    return fromError(e);
  }
}
