import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { listMessages, createMessage } from "@/server/support";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ clientId: string; convId: string }> },
) {
  try {
    const { convId } = await params;
    const messages = await listMessages(convId);
    return apiOk({ messages });
  } catch (error) {
    return fromError(error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string; convId: string }> },
) {
  try {
    const { convId } = await params;
    const body = await request.json();
    const message = await createMessage(convId, body);
    return apiOk({ message }, { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}
