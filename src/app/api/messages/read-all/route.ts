// POST /api/messages/read-all → mark every message addressed to me as read.

import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { markAllTeamMessagesRead } from "@/server/team-messages";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthedUser(request);
    return apiOk({ marked: await markAllTeamMessagesRead(user) });
  } catch (error) {
    return fromError(error);
  }
}
