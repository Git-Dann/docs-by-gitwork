import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { listMessages, createMessage } from "@/server/support";
import { sendReply, type ReplyResult } from "@/server/support-reply";

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

    // Outbound replies are SENT and VERIFIED before the message is persisted. A real
    // send failure (bad SMTP creds, API rejection, …) returns a 502 so the operator
    // sees it — rather than the old fire-and-forget path that logged a "sent" message
    // the customer never actually received. Inherently-manual sources (no automated
    // send path) still fall through and get logged so the copy-to-send flow works.
    let reply: ReplyResult | null = null;
    if (body.direction === "outbound") {
      reply = await sendReply(convId, clientId, body.body);
      if (!reply.sent && !reply.manual) {
        return apiError(reply.reason, 502);
      }
    }

    const message = await createMessage(convId, body as Parameters<typeof createMessage>[1]);
    return apiOk({ message, reply }, { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}
