// POST /api/backstage/commitments/sync → read the caller's enabled sources now.
import { apiOk, fromError } from "@/lib/api-response";
import { commitmentsUser } from "@/server/commitments-route";
import { syncCommitments } from "@/server/commitments";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const user = await commitmentsUser(req);
    return apiOk({ result: await syncCommitments(user) });
  } catch (e) {
    return fromError(e);
  }
}
