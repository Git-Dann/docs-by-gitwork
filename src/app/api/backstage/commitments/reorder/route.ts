// POST /api/backstage/commitments/reorder  { ids: string[] }  → orderKey = position, in one go.
// At most 500 ids, every one the caller's own.
import { apiOk, fromError } from "@/lib/api-response";
import { commitmentsUser } from "@/server/commitments-route";
import { reorderCommitments } from "@/server/commitments";
import { commitmentReorderSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const user = await commitmentsUser(req);
    const { ids } = commitmentReorderSchema.parse(await req.json());
    await reorderCommitments(user, ids);
    return apiOk({ reordered: ids.length });
  } catch (e) {
    return fromError(e);
  }
}
