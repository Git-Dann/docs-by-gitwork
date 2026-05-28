import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { getGuildChannels } from "@/server/discord-sync";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { guildId?: string; botToken?: string };
    const guildId = body.guildId?.trim();
    const botToken = body.botToken?.trim();

    if (!guildId) return apiError("guildId is required", 400);
    if (!botToken) return apiError("botToken is required", 400);

    const { channels, guildName } = await getGuildChannels(guildId, botToken);
    return apiOk({ channels, guildName });
  } catch (error) {
    return fromError(error);
  }
}
