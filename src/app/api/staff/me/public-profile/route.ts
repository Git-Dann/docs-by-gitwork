/**
 * GET   /api/staff/me/public-profile — the signed-in person's own public profile settings.
 * PATCH /api/staff/me/public-profile — edit them, or switch the page on/off. Their own record only;
 *       switching a page ON is only ever the person's choice (CLAUDE.md §139).
 */
import { apiOk, fromError } from "@/lib/api-response";
import { publicProfileSchema } from "./schema";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { getMyPublicProfile, saveMyPublicProfile } from "@/server/public-profile";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requireAuthedUser(request);
    return apiOk(await getMyPublicProfile(user.workspaceId, user.membershipId));
  } catch (error) {
    return fromError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireAuthedUser(request);
    return apiOk(await saveMyPublicProfile(user.workspaceId, user.membershipId, publicProfileSchema.parse(await request.json())));
  } catch (error) {
    return fromError(error);
  }
}
