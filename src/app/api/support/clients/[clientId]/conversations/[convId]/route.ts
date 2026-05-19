import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { getConversation, updateConversation } from "@/server/support";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ clientId: string; convId: string }> },
) {
  try {
    const { convId } = await params;
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
    const { convId } = await params;
    const body = await request.json();
    const conversation = await updateConversation(convId, body);
    return apiOk({ conversation });
  } catch (error) {
    return fromError(error);
  }
}
