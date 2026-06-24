import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { assertCan, canManageSupport, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { setConversationTriage } from "@/server/support";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string; convId: string }> },
) {
  try {
    const user = await getEffectiveUserOrNull(request);
    assertCan(user, canManageSupport, "triage Care conversations");
    const { convId } = await params;
    const body = await request.json();
    const conversation = await setConversationTriage(convId, body, user?.id);
    return apiOk({ conversation });
  } catch (error) {
    return fromError(error);
  }
}
