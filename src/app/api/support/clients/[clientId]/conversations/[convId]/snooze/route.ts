import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { snoozeConversation } from "@/server/support";
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
    const body = (await request.json()) as { until?: string };
    if (!body.until || Number.isNaN(Date.parse(body.until))) {
      return apiError("`until` must be a valid ISO date-time", 400);
    }
    const conversation = await snoozeConversation(convId, body.until, user?.id);
    return apiOk({ conversation });
  } catch (error) {
    return fromError(error);
  }
}
