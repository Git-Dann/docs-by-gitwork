/**
 * GET /api/staff/[id]/access-log — who viewed or changed this person's HR record, newest
 * first. Needs `hr.manage`. Entries name what changed, never the values.
 */

import { apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { listAccessLog } from "@/server/hr/profile";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthedUser(request);
    const { id } = await params;
    return apiOk({ entries: await listAccessLog(user, id) });
  } catch (error) {
    return fromError(error);
  }
}
