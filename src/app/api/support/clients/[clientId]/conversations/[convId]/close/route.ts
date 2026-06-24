import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { assertCan, canManageSupport, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { closeConversation, reopenConversation } from "@/server/support";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string; convId: string }> },
) {
  try {
    const user = await getEffectiveUserOrNull(request);
    assertCan(user, canManageSupport, "close Care conversations");
    const { convId } = await params;
    const body = (await request.json().catch(() => ({}))) as { ignored?: boolean; reopen?: boolean };
    const conversation = body.reopen
      ? await reopenConversation(convId, user?.id)
      : await closeConversation(convId, { ignored: body.ignored }, user?.id);
    return apiOk({ conversation });
  } catch (error) {
    return fromError(error);
  }
}
