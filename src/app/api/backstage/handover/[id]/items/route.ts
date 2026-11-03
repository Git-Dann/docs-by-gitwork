import { apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { addHandoverItem } from "@/server/handover";
import { handoverItemInputSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

// POST /api/backstage/handover/[id]/items — add a decision, risk, duty or client note.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthedUser(req);
    const { id } = await params;
    const body = handoverItemInputSchema.parse(await req.json());
    return apiOk(await addHandoverItem(user, id, body), { status: 201 });
  } catch (e) {
    return fromError(e);
  }
}
