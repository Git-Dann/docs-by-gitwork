/**
 * GET    /api/staff/[id]/public-profile — a person's public page settings, for the person
 *        themselves or an Admin who may edit them (canEditPublicPage in src/lib/hr.ts).
 * PATCH  /api/staff/[id]/public-profile — edit them. An Admin can edit and hide a page, but
 *        switching one ON is only ever the person's own choice (CLAUDE.md §139).
 * DELETE /api/staff/[id]/public-profile — someone managing Staff takes a person's page down.
 */
import { apiOk, fromError } from "@/lib/api-response";
import { assertCan, canManageCode, requireAuthedUser } from "@/server/auth/effective-user";
import { getPublicProfileForRecord, savePublicProfileForRecord, unpublishProfile } from "@/server/public-profile";
import { publicProfileSchema } from "@/app/api/staff/me/public-profile/schema";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Ctx) {
  try {
    const user = await requireAuthedUser(request);
    const { id } = await params;
    return apiOk(await getPublicProfileForRecord(user, id));
  } catch (error) {
    return fromError(error);
  }
}

export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const user = await requireAuthedUser(request);
    const { id } = await params;
    return apiOk(await savePublicProfileForRecord(user, id, publicProfileSchema.parse(await request.json())));
  } catch (error) {
    return fromError(error);
  }
}

export async function DELETE(request: Request, { params }: Ctx) {
  try {
    const user = await requireAuthedUser(request);
    assertCan(user, canManageCode, "manage Staff");
    const { id } = await params;
    await unpublishProfile(user.workspaceId, id);
    return apiOk({ unpublished: true });
  } catch (error) {
    return fromError(error);
  }
}
