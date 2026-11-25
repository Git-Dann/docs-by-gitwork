/**
 * Whether a client's releases are shown by their changelog version (§162).
 *   GET ?clientId=  → { useChangelog }
 *   PUT { clientId, useChangelog } → { useChangelog }
 * Same access as changing a release: the caller's workspace, and this client in their scope.
 */
import { z } from "zod";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { getReleasesUseChangelog, setReleasesUseChangelog } from "@/server/releases";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ clientId: z.string().min(1).max(64), useChangelog: z.boolean() }).strict();

export async function GET(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    const clientId = new URL(req.url).searchParams.get("clientId");
    if (!clientId) return apiError("Missing clientId", 400);
    return apiOk({ useChangelog: await getReleasesUseChangelog(user, clientId) });
  } catch (e) {
    return fromError(e);
  }
}

export async function PUT(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    const { clientId, useChangelog } = bodySchema.parse(await req.json());
    return apiOk(await setReleasesUseChangelog(user, clientId, useChangelog));
  } catch (e) {
    return fromError(e);
  }
}
