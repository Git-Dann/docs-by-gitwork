import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { ensureBaseRecords } from "@/server/bootstrap";
import {
  addMeetingDecision,
  getMeeting,
  linkActionItemTask,
  reassignMeetingClient,
  removeMeetingDecision,
  setActionItemDone,
} from "@/server/meetings";
import { meetingUpdateSchema } from "@/server/validators";
import { getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { assertClientAccessBySlug } from "@/server/client-assignments";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ slug: string; id: string }> };

/** GET /api/clients/{slug}/meetings/{id} — full meeting incl. transcript + notes. */
export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const { workspace } = await ensureBaseRecords();
    const { slug, id } = await context.params;
    await assertClientAccessBySlug(await getEffectiveUserOrNull(req), slug);
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
 *   { decisionText }        → add a manual decision bullet
 *   { removeDecisionIndex } → remove one decision bullet
 */
export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const { workspace } = await ensureBaseRecords();
    const { slug, id } = await context.params;
    await assertClientAccessBySlug(await getEffectiveUserOrNull(req), slug);
    const body = meetingUpdateSchema.parse(await req.json());

    if (body.actionItemId !== undefined && body.done !== undefined) {
      const updated = await setActionItemDone(workspace.id, body.actionItemId, body.done);
      if (!updated) return apiError("Action item not found", 404);
    }

    if (body.actionItemId !== undefined && body.taskId !== undefined) {
      const updated = await linkActionItemTask(workspace.id, body.actionItemId, body.taskId);
      if (!updated) return apiError("Action item not found", 404);
    }

    if (body.clientId !== undefined) {
      const updated = await reassignMeetingClient(workspace.id, id, body.clientId);
      if (!updated) return apiError("Meeting not found", 404);
    }

    if (body.decisionText !== undefined) {
      const updated = await addMeetingDecision(workspace.id, id, body.decisionText);
      if (!updated) return apiError("Meeting not found", 404);
    }

    if (body.removeDecisionIndex !== undefined) {
      const updated = await removeMeetingDecision(workspace.id, id, body.removeDecisionIndex);
      if (!updated) return apiError("Meeting decision not found", 404);
    }

    const meeting = await getMeeting(workspace.id, id);
    if (!meeting) return apiError("Meeting not found", 404);
    return apiOk({ meeting });
  } catch (error) {
    return fromError(error);
  }
}
