// POST /api/messages/[id]/read → mark this message read for me.

import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { markTeamMessageRead } from "@/server/team-messages";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuthedUser(request);
    const { id } = await params;
    await markTeamMessageRead(user, id);
    return apiOk({ ok: true });
  } catch (error) {
    return fromError(error);
  }
}
