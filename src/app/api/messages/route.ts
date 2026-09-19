// GET  /api/messages            → messages addressed to me (+ ?sent=1 for ones I sent)
// POST /api/messages            → send a message to named people (Admin+)

import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import {
  listMyTeamMessages,
  listSentTeamMessages,
  sendTeamMessage,
} from "@/server/team-messages";
import { teamMessageCreateSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthedUser(request);
    const params = new URL(request.url).searchParams;
    const sent = params.get("sent") === "1";
    const cursor = params.get("cursor") ?? undefined;
    const rawLimit = params.get("limit");
    // An unparseable limit falls through to the default rather than 400ing — the
    // server clamps it anyway, so there is nothing a bad value can do.
    const limit = rawLimit ? Number(rawLimit) : undefined;

    const opts = { cursor, limit };
    const result = sent
      ? await listSentTeamMessages(user, opts)
      : await listMyTeamMessages(user, opts);
    return apiOk(result);
  } catch (error) {
    return fromError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthedUser(request);
    const body = teamMessageCreateSchema.parse(await request.json());
    const message = await sendTeamMessage(user, body);
    return apiOk({ message }, { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}
