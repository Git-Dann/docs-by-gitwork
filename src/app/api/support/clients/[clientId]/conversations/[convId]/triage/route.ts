import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { assertCan, canManageSupport, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { setConversationTriage } from "@/server/support";
import { requireSupportClient, requireSupportRow } from "@/server/support-scope";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string; convId: string }> },
) {
  try {
    const user = await getEffectiveUserOrNull(request);
    assertCan(user, canManageSupport, "triage Care conversations");
    const { clientId, convId } = await params;
    await requireSupportClient(request, clientId);
    await requireSupportRow("conversation", convId, clientId);
    const body = await request.json();
    const conversation = await setConversationTriage(convId, body, user?.id);
    return apiOk({ conversation });
  } catch (error) {
    return fromError(error);
  }
}
