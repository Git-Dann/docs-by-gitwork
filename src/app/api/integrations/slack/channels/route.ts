/**
 * GET /api/integrations/slack/channels → all channels the bot can see in the connected
 * Slack workspace. Drives the multi-select in Settings → Integrations → Slack.
 *
 * Pulls from Slack's conversations.list (paginated). Returns public + private channels
 * the bot is a member of. Requires the bot to have `channels:read` (public) and
 * `groups:read` (private) scopes.
 */

import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { getSlackBotToken } from "@/server/slack/client";

export const dynamic = "force-dynamic";

interface SlackChannel {
  id: string;
  name: string;
  isPrivate: boolean;
  isMember: boolean;
  memberCount: number;
}

interface SlackApiChannel {
  id: string;
  name?: string;
  is_private?: boolean;
  is_archived?: boolean;
  is_member?: boolean;
  num_members?: number;
}

interface SlackApiResponse {
  ok: boolean;
  channels?: SlackApiChannel[];
  response_metadata?: { next_cursor?: string };
  error?: string;
  needed?: string;
}

export async function GET() {
  try {
    const { workspace } = await ensureBaseRecords();
    const wsWithToken = await prisma.workspace.findUnique({
      where: { id: workspace.id },
      select: { slackBotToken: true, slackBotTokenEncrypted: true },
    });
    const botToken = getSlackBotToken(wsWithToken);
    if (!botToken) {
      return apiError("Slack isn't connected. Add a bot token in Settings → Integrations.", 422);
    }

    const channels: SlackChannel[] = [];
    let cursor: string | undefined;
    let pages = 0;
    const MAX_PAGES = 10; // safety — 10 × 200 = 2000 channels is way more than any team needs

    do {
      const params = new URLSearchParams({
        types: "public_channel,private_channel",
        exclude_archived: "true",
        limit: "200",
      });
      if (cursor) params.set("cursor", cursor);

      const res = await fetch(`https://slack.com/api/conversations.list?${params}`, {
        headers: { Authorization: `Bearer ${botToken}` },
        signal: AbortSignal.timeout(10_000),
      });
      const data = (await res.json()) as SlackApiResponse;

      if (!data.ok) {
        const detail = data.needed ? ` (missing scope: ${data.needed})` : "";
        return apiError(
          `Slack rejected the request: ${data.error ?? "unknown"}${detail}. Re-install the bot with channels:read + groups:read scopes.`,
          502,
        );
      }

      for (const c of data.channels ?? []) {
        if (!c.id || !c.name) continue;
        channels.push({
          id: c.id,
          name: c.name,
          isPrivate: c.is_private ?? false,
          isMember: c.is_member ?? false,
          memberCount: c.num_members ?? 0,
        });
      }

      cursor = data.response_metadata?.next_cursor || undefined;
      pages += 1;
    } while (cursor && pages < MAX_PAGES);

    // Sort: bot-member channels first (most relevant), then alphabetical.
    channels.sort((a, b) => {
      if (a.isMember !== b.isMember) return a.isMember ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return apiOk({ channels });
  } catch (error) {
    return fromError(error);
  }
}
