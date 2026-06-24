import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { assertCan, canManageSupport, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { assignConversation } from "@/server/support";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string; convId: string }> },
) {
  try {
    const user = await getEffectiveUserOrNull(request);
    assertCan(user, canManageSupport, "assign Care conversations");
    const { convId } = await params;
    const body = (await request.json()) as { assigneeId?: string | null };
    const conversation = await assignConversation(convId, body.assigneeId ?? null, user?.id);
    return apiOk({ conversation });
  } catch (error) {
    return fromError(error);
  }
}
