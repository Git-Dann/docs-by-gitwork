/**
 * POST /api/staff/[id]/archive — archive ({ archived: true }) or restore ({ archived: false })
 * someone WITHOUT a login. Needs Staff manage or `hr.manage`. Someone who signs in is
 * archived through /api/team/members/[memberId]/archive, so access and the roster can
 * never disagree about whether they have left.
 */

import { z } from "zod";
import { apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { recordAuditEntry } from "@/server/audit-log";
import { setRecordArchived } from "@/server/hr/profile";

export const dynamic = "force-dynamic";

const schema = z.object({ archived: z.boolean() }).strict();

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthedUser(request);
    const { id } = await params;
    const { archived } = schema.parse(await request.json());
    await setRecordArchived(user, id, archived);
    await recordAuditEntry({
      workspaceId: user.workspaceId,
      actorId: user.id,
      action: archived ? "staff.record.archived" : "staff.record.restored",
      target: `staff:${id}`,
    });
    return apiOk({ ok: true });
  } catch (error) {
    return fromError(error);
  }
}
