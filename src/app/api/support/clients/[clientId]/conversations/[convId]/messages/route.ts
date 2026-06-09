import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { listMessages, createMessage } from "@/server/support";
import { sendReply } from "@/server/support-reply";

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
    const { clientId, convId } = await params;
    const body = await request.json() as { direction: string; authorLabel: string; body: string };
    const message = await createMessage(convId, body as Parameters<typeof createMessage>[1]);

    // Best-effort outbound send — never blocks the Care response
    if (body.direction === "outbound") {
      void sendReply(convId, clientId, body.body).catch((err) => {
        console.error("[care:reply]", err);
      });
    }

    return apiOk({ message }, { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}
