// GET    /api/messages/[id] → one message, if it was addressed to you or you sent it
// DELETE /api/messages/[id] → author deletes it for everyone

import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { deleteTeamMessage, getTeamMessage } from "@/server/team-messages";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuthedUser(request);
    const { id } = await params;
    const message = await getTeamMessage(user, id);
    // 404 rather than 403 on purpose: "this exists but is not yours" tells someone a
    // message was sent and to whom, which is more than they should learn from a URL.
    if (!message) return apiError("Message not found.", 404);
    return apiOk({ message });
  } catch (error) {
    return fromError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuthedUser(request);
    const { id } = await params;
    // Author-only, and a non-author gets the same 404 a stranger gets — the outcome
    // must not reveal that the message exists.
    const deleted = await deleteTeamMessage(user, id);
    if (!deleted) return apiError("Message not found.", 404);
    return apiOk({ deleted: true });
  } catch (error) {
    return fromError(error);
  }
}
