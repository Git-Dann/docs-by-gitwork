import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { closeConversation, reopenConversation } from "@/server/support";
import { requireSupportClient, requireSupportRow } from "@/server/support-scope";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string; convId: string }> },
) {
  try {
    const user = await getEffectiveUserOrNull(request);
    const { clientId, convId } = await params;
    await requireSupportClient(request, clientId);
    await requireSupportRow("conversation", convId, clientId);
    const body = (await request.json().catch(() => ({}))) as { ignored?: boolean; reopen?: boolean };
    const conversation = body.reopen
      ? await reopenConversation(convId, user?.id)
      : await closeConversation(convId, { ignored: body.ignored }, user?.id);
    return apiOk({ conversation });
  } catch (error) {
    return fromError(error);
  }
}
