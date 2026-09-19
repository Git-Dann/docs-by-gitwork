// POST /api/messages/[id]/dismiss → remove it from MY list only.
//
// Separate from DELETE on the message itself, which is the author removing it for
// everyone. A recipient clearing their own inbox must not destroy a message addressed
// to other people.

import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { dismissTeamMessage } from "@/server/team-messages";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuthedUser(request);
    const { id } = await params;
    await dismissTeamMessage(user, id);
    return apiOk({ ok: true });
  } catch (error) {
    return fromError(error);
  }
}
