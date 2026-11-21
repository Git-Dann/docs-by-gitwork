import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { getConversation, updateConversation } from "@/server/support";
import { requireSupportClient, requireSupportRow } from "@/server/support-scope";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string; convId: string }> },
) {
  try {
    const { clientId, convId } = await params;
    await requireSupportClient(request, clientId);
    await requireSupportRow("conversation", convId, clientId);
    const conversation = await getConversation(convId);
    return apiOk({ conversation });
  } catch (error) {
    return fromError(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string; convId: string }> },
) {
  try {
    const { clientId, convId } = await params;
    await requireSupportClient(request, clientId);
    await requireSupportRow("conversation", convId, clientId);
    const body = await request.json();
    const conversation = await updateConversation(convId, body);
    return apiOk({ conversation });
  } catch (error) {
    return fromError(error);
  }
}
