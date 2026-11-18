import { apiOk, apiError, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { createRelease, listReleases } from "@/server/releases";
import { releaseInputSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    const clientId = new URL(req.url).searchParams.get("clientId");
    if (!clientId) return apiError("Missing clientId", 400);
    return apiOk(await listReleases(user, clientId));
  } catch (e) {
    return fromError(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    const body = releaseInputSchema.parse(await req.json());
    return apiOk(await createRelease(user, body), { status: 201 });
  } catch (e) {
    return fromError(e);
  }
}
