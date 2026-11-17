/**
 * POST /api/staff/[id]/merge — { otherRecordId }: the two records are the same person.
 * The older record is kept and everything on the other moves onto it (src/lib/staff-merge.ts,
 * mergeRecords in src/server/hr/profile.ts). Needs Staff manage plus Admin or `hr.manage`.
 * Returns the kept record's id, which may not be the one in the URL.
 */

import { z } from "zod";
import { apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { recordAuditEntry } from "@/server/audit-log";
import { mergeRecords } from "@/server/hr/profile";

export const dynamic = "force-dynamic";

const schema = z.object({ otherRecordId: z.string().min(1).max(64) }).strict();

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthedUser(request);
    const { id } = await params;
    const { otherRecordId } = schema.parse(await request.json());
    const result = await mergeRecords(user, id, otherRecordId);
    await recordAuditEntry({
      workspaceId: user.workspaceId,
      actorId: user.id,
      action: "staff.record.merged",
      target: `staff:${result.keptId}`,
      metadata: { records: [id, otherRecordId], kept: result.keptId },
    });
    return apiOk(result);
  } catch (error) {
    return fromError(error);
  }
}
