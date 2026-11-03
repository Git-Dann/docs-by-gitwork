import { apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { createHandover, listHandovers } from "@/server/handover";
import { handoverInputSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

// GET  /api/backstage/handover — every handover, newest first. Admin+.
export async function GET(req: Request) {
  try {
    return apiOk(await listHandovers(await requireAuthedUser(req)));
  } catch (e) {
    return fromError(e);
  }
}

// POST /api/backstage/handover — start one.
export async function POST(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    const body = handoverInputSchema.parse(await req.json());
    return apiOk(await createHandover(user, body), { status: 201 });
  } catch (e) {
    return fromError(e);
  }
}
