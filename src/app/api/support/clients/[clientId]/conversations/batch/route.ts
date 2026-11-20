import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { batchUpdateConversations } from "@/server/support";
import { requireSupportClient } from "@/server/support-scope";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
) {
  try {
    const user = await getEffectiveUserOrNull(request);
    const { clientId } = await params;
    await requireSupportClient(request, clientId);
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
