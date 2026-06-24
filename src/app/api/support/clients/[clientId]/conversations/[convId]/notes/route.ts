import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { assertCan, canManageSupport, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { listConversationNotes, addConversationNote } from "@/server/support";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ clientId: string; convId: string }> },
) {
  try {
    const { convId } = await params;
    const notes = await listConversationNotes(convId);
    return apiOk({ notes });
  } catch (error) {
    return fromError(error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string; convId: string }> },
) {
  try {
    const user = await getEffectiveUserOrNull(request);
    assertCan(user, canManageSupport, "add Care conversation notes");
    const { convId } = await params;
    const body = (await request.json()) as { body?: string };
    if (!body.body || !body.body.trim()) {
      return apiError("Note `body` is required", 400);
    }
    const note = await addConversationNote(convId, { authorId: user?.id, body: body.body.trim() });
    return apiOk({ note }, { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}
