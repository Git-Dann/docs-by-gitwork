import { apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { rejectLeaveRequest } from "@/server/backstage";
import { approvalDecisionSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthedUser(req);
    const { id } = await params;
    const body = approvalDecisionSchema.parse(
      await req.json().catch(() => ({})),
    );
    const lr = await rejectLeaveRequest(user, id, body.note);
    return apiOk(lr);
  } catch (e) {
    return fromError(e);
  }
}
