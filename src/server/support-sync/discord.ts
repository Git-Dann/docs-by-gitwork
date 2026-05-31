import { prisma } from "@/lib/prisma";
import type { RawIngestItem } from "@/server/care-agents/types";
import type { AgentContext } from "@/server/care-agents/types";

const DISCORD_API = "https://discord.com/api/v10";

interface DiscordScraperConfig {
  guildId?: string;
  channelIds?: string[];
  channels?: Array<{ id: string; name?: string }>; // legacy format
  botToken?: string;
}

interface DiscordMessage {
  id: string;
  content: string;
  author: { id: string; username: string; global_name?: string };
  timestamp: string;
}

export async function fetchDiscord(ctx: AgentContext): Promise<RawIngestItem[]> {
  const { connection } = ctx;
  const results: RawIngestItem[] = [];
  const errors: string[] = [];

  const config = (connection.scraperConfig ?? {}) as DiscordScraperConfig;
  const botToken = config.botToken;
  // Support both new format (channelIds: string[]) and legacy format (channels: [{id, name}])
  const channelIds = config.channelIds ?? config.channels?.map((c) => c.id) ?? [];

  if (!botToken) throw new Error("Discord bot token not configured");
  if (channelIds.length === 0) throw new Error("No Discord channel IDs configured");

  const headers = {
    Authorization: `Bot ${botToken}`,
    "Content-Type": "application/json",
  };

  const lastSyncedAt = connection.lastSyncedAt;
  const afterSnowflake = lastSyncedAt
    ? dateToSnowflake(lastSyncedAt)
    : dateToSnowflake(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));

  for (const channelId of channelIds) {
    const channelRes = await fetch(`${DISCORD_API}/channels/${channelId}`, { headers });
    if (!channelRes.ok) {
      const body = await channelRes.text();
      errors.push(`Channel ${channelId}: ${channelRes.status} ${body}`);
      continue;
    }
    const channelData = (await channelRes.json()) as { name?: string };
    const channelName = channelData.name ?? channelId;

    const params = new URLSearchParams({ limit: "50", after: afterSnowflake });
    const msgsRes = await fetch(`${DISCORD_API}/channels/${channelId}/messages?${params}`, { headers });
    if (!msgsRes.ok) {
      const body = await msgsRes.text();
      errors.push(`#${channelName}: ${msgsRes.status} ${body}`);
      continue;
    }

    const messages = (await msgsRes.json()) as DiscordMessage[];
    if (!Array.isArray(messages) || messages.length === 0) continue;

    // Reverse to chronological order
    messages.reverse();

    // Group into 30-min windows
    const windows: DiscordMessage[][] = [];
    let currentWindow: DiscordMessage[] = [];
    let windowStart: Date | null = null;

    for (const msg of messages) {
      const msgDate = new Date(msg.timestamp);
      if (!windowStart || msgDate.getTime() - windowStart.getTime() > 30 * 60 * 1000) {
        if (currentWindow.length > 0) windows.push(currentWindow);
        currentWindow = [msg];
        windowStart = msgDate;
      } else {
        currentWindow.push(msg);
      }
    }
    if (currentWindow.length > 0) windows.push(currentWindow);

    for (const window of windows) {
      const firstMsg = window[0];
      const authorName = firstMsg.author.global_name ?? firstMsg.author.username;
      const rawBody = window.map((m) => `${m.author.global_name ?? m.author.username}: ${m.content}`).join("\n");

      results.push({
        externalId: `discord:${channelId}:${firstMsg.id}`,
        customerLabel: authorName,
        rawSubject: `#${channelName} — ${authorName}`,
        rawBody: rawBody.slice(0, 4000),
        receivedAt: new Date(firstMsg.timestamp),
        threadItems: window.map((m) => ({
          id: `discord:${m.id}`,
          authorLabel: m.author.global_name ?? m.author.username,
          body: m.content || "[no content]",
          createdAt: new Date(m.timestamp),
          isOutbound: false,
        })),
        sourceMetadata: { channelName, channelId },
      });
    }
  }

  // If every channel failed, surface the errors so the caller can mark connection as errored
  if (errors.length > 0 && results.length === 0) {
    throw new Error(errors.join("; "));
  }

  return results;
}

function dateToSnowflake(date: Date): string {
  const DISCORD_EPOCH = 1420070400000;
  const ms = date.getTime() - DISCORD_EPOCH;
  return String(ms * 4194304); // 2^22 = 4194304
}

export async function syncDiscord(ctx: AgentContext): Promise<{ created: number; skipped: number; errors: string[] }> {
  const items = await fetchDiscord(ctx);
  await prisma.accountConnection.update({ where: { id: ctx.connection.id }, data: { lastSyncedAt: new Date(), health: "CONNECTED" } });
  return { created: items.length, skipped: 0, errors: [] };
}
