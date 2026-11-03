/**
 * GET  /api/staff/me — the signed-in person's own Staff record id, or null (Backstage → Me).
 * POST /api/staff/me — set it up for themselves if HR hasn't. Only ever their own record.
 */

import { apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { createOwnStaffRecord, getOwnStaffRecordId } from "@/server/staff";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requireAuthedUser(request);
    return apiOk({ recordId: await getOwnStaffRecordId(user.workspaceId, user.membershipId) });
  } catch (error) {
    return fromError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAuthedUser(request);
    return apiOk(await createOwnStaffRecord(user.workspaceId, user.membershipId), { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}
