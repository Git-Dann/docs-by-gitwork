// GET  /api/backstage/commitments/lists  → the signed-in person's lists (not archived), in order
// POST /api/backstage/commitments/lists  → make one. Private to the caller, like Commitments.
import { apiOk, fromError } from "@/lib/api-response";
import { commitmentsUser } from "@/server/commitments-route";
import { createCommitmentList, listCommitmentLists } from "@/server/commitment-lists";
import { commitmentListCreateSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const user = await commitmentsUser(req);
    return apiOk({ lists: await listCommitmentLists(user) });
  } catch (e) {
    return fromError(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await commitmentsUser(req);
    const body = commitmentListCreateSchema.parse(await req.json());
    return apiOk({ list: await createCommitmentList(user, body) }, { status: 201 });
  } catch (e) {
    return fromError(e);
  }
}
