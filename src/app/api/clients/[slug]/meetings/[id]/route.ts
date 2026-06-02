import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { ensureBaseRecords } from "@/server/bootstrap";
import { getMeeting, setActionItemDone, reassignMeetingClient } from "@/server/meetings";
import { meetingUpdateSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ slug: string; id: string }> };

/** GET /api/clients/{slug}/meetings/{id} — full meeting incl. transcript + notes. */
export async function GET(_req: NextRequest, context: RouteContext) {
  try {
    const { workspace } = await ensureBaseRecords();
    const { id } = await context.params;
    const meeting = await getMeeting(workspace.id, id);
    if (!meeting) return apiError("Meeting not found", 404);
    return apiOk({ meeting });
  } catch (error) {
    return fromError(error);
  }
}

/**
 * PATCH /api/clients/{slug}/meetings/{id}
 *   { actionItemId, done }  → toggle an action item
 *   { clientId }            → re-attribute the meeting to a client (or null)
 */
export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const { workspace } = await ensureBaseRecords();
    const { id } = await context.params;
    const body = meetingUpdateSchema.parse(await req.json());

    if (body.actionItemId !== undefined && body.done !== undefined) {
      const updated = await setActionItemDone(workspace.id, body.actionItemId, body.done);
      if (!updated) return apiError("Action item not found", 404);
    }

    if (body.clientId !== undefined) {
      const updated = await reassignMeetingClient(workspace.id, id, body.clientId);
      if (!updated) return apiError("Meeting not found", 404);
    }

    const meeting = await getMeeting(workspace.id, id);
    if (!meeting) return apiError("Meeting not found", 404);
    return apiOk({ meeting });
  } catch (error) {
    return fromError(error);
  }
}
