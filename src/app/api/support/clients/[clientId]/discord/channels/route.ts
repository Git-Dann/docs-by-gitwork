import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { getGuildChannels } from "@/server/discord-sync";
import { requireSupportClient } from "@/server/support-scope";

export const dynamic = "force-dynamic";

/**
 * List a Discord guild's channels, so the connector form can offer a picker before anything is
 * saved. The bot token is supplied by whoever is filling the form in — there is no connection to
 * read it from yet.
 *
 * ⚠️ This route used to live at `/api/support/discord/channels`, with **no permission check, no
 * workspace scope and no client in its path at all** — any authenticated account in any workspace
 * could hand it a guild id and a bot token and have Foundry call Discord with them. It survived
 * two audits for one reason: having no `[clientId]` segment, it was outside every sweep that
 * walks `clients/[clientId]/**`, and it was then written into the route test's EXEMPT list with a
 * note describing what it does rather than why that made it safe. Moving it under the client is
 * most of the fix — `requireSupportClient` now applies, and nothing can be exempted by being
 * filed somewhere a sweep does not look.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
) {
  try {
    const { clientId } = await params;
    await requireSupportClient(request, clientId, "manage");

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
