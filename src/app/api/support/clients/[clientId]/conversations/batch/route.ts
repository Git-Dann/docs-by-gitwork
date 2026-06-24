import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { assertCan, canManageSupport, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { batchUpdateConversations } from "@/server/support";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
) {
  try {
    const user = await getEffectiveUserOrNull(request);
    assertCan(user, canManageSupport, "bulk-triage Care conversations");
    const { clientId } = await params;
    const body = (await request.json()) as {
      conversationIds: string[];
      data: Parameters<typeof batchUpdateConversations>[2];
    };
    if (!Array.isArray(body.conversationIds) || body.conversationIds.length === 0) {
      return apiError("conversationIds must be a non-empty array", 400);
    }
    const result = await batchUpdateConversations(clientId, body.conversationIds, body.data ?? {}, user?.id);
    return apiOk(result);
  } catch (error) {
    return fromError(error);
  }
}
