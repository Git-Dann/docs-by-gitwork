import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { listConversations, createConversation } from "@/server/support";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
) {
  try {
    const { clientId } = await params;
    const conversations = await listConversations(clientId);
    return apiOk({ conversations });
  } catch (error) {
    return fromError(error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
) {
  try {
    const { clientId } = await params;
    const body = await request.json();
    const conversation = await createConversation(clientId, body);
    return apiOk({ conversation }, { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}
