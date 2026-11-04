// PATCH  /api/backstage/commitments/lists/[id]  → rename, recolour, move
// DELETE /api/backstage/commitments/lists/[id]  → archive it and take its to-dos out of it
// Another person's list id is a 404.
import { apiOk, fromError } from "@/lib/api-response";
import { commitmentsUser } from "@/server/commitments-route";
import { archiveCommitmentList, updateCommitmentList } from "@/server/commitment-lists";
import { commitmentListUpdateSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await commitmentsUser(req);
    const { id } = await params;
    const body = commitmentListUpdateSchema.parse(await req.json());
    return apiOk({ list: await updateCommitmentList(user, id, body) });
  } catch (e) {
    return fromError(e);
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await commitmentsUser(req);
    const { id } = await params;
    await archiveCommitmentList(user, id);
    return apiOk({ archived: true });
  } catch (e) {
    return fromError(e);
  }
}
