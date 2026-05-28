import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { listMessages, createMessage } from "@/server/support";
import { prisma } from "@/lib/prisma";
import { sendDiscordMessage } from "@/server/discord-sync";

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

    // Best-effort outbound Discord send — never blocks the Care response
    if (body.direction === "outbound") {
      void (async () => {
        try {
          const [conv, conn] = await Promise.all([
            prisma.supportConversation.findUnique({
              where: { id: convId },
              select: { source: true, externalId: true },
            }),
            prisma.accountConnection.findFirst({
              where: { clientId, source: "DISCORD", health: "CONNECTED" },
              select: { scraperConfig: true },
            }),
          ]);

          const botToken = (conn?.scraperConfig as { botToken?: string } | null)?.botToken;
          if (conv?.source === "DISCORD" && conv.externalId && botToken) {
            await sendDiscordMessage(conv.externalId, botToken, body.body);
          }
        } catch (err) {
          console.error("[care:discord:send]", err);
        }
      })();
    }

    return apiOk({ message }, { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}
