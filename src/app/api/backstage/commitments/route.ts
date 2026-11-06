// GET  /api/backstage/commitments  → the signed-in person's commitments, settings and lists
// POST /api/backstage/commitments  → add one by hand
// Used by Backstage → Commitments and by Foundry for Mac (mobile JWT). Private to the caller.
import { apiOk, fromError } from "@/lib/api-response";
import { commitmentsUser } from "@/server/commitments-route";
import { createCommitment, getCommitmentSettings, listCommitments } from "@/server/commitments";
import { listCommitmentLists } from "@/server/commitment-lists";
import { commitmentCreateSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const user = await commitmentsUser(req);
    const [commitments, settings, lists] = await Promise.all([
      listCommitments(user),
      getCommitmentSettings(user),
      listCommitmentLists(user),
    ]);
    return apiOk({ commitments, settings, lists });
  } catch (e) {
    return fromError(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await commitmentsUser(req);
    const body = commitmentCreateSchema.parse(await req.json());
    return apiOk({ commitment: await createCommitment(user, body) }, { status: 201 });
  } catch (e) {
    return fromError(e);
  }
}
