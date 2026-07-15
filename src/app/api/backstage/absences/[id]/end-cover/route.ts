import { apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { endAbsenceCover } from "@/server/absences";

export const dynamic = "force-dynamic";

// POST /api/backstage/absences/[id]/end-cover — revert an active cover now
// (removes the cover dev from the tasks + temp access) without deleting the absence.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthedUser(req);
    const { id } = await params;
    return apiOk(await endAbsenceCover(user, id));
  } catch (e) {
    return fromError(e);
  }
}
