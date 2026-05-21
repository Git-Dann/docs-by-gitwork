import { prisma } from "@/lib/prisma";
import type { SyncContext, SyncResult } from "./types";

const DISCORD_API = "https://discord.com/api/v10";

interface DiscordScraperConfig {
  guildId?: string;
  channelIds?: string[];
  botToken?: string;
}

interface DiscordMessage {
  id: string;
  content: string;
  author: { id: string; username: string; global_name?: string };
  timestamp: string;
  referenced_message?: { id: string };
}

export async function syncDiscord(ctx: SyncContext): Promise<SyncResult> {
  const { connection, client } = ctx;
  const result: SyncResult = { created: 0, skipped: 0, errors: [] };

  const config = (connection.scraperConfig ?? {}) as DiscordScraperConfig;
  const botToken = config.botToken;
  const channelIds = config.channelIds ?? [];

  if (!botToken) throw new Error("Discord bot token not configured");
  if (channelIds.length === 0) throw new Error("No Discord channel IDs configured");

  const headers = {
    Authorization: `Bot ${botToken}`,
    "Content-Type": "application/json",
  };

  for (const channelId of channelIds) {
    try {
      // Fetch channel info for label
      const channelRes = await fetch(`${DISCORD_API}/channels/${channelId}`, { headers });
      if (!channelRes.ok) {
        result.errors.push(`Channel ${channelId}: ${channelRes.status} ${channelRes.statusText}`);
        continue;
      }
      const channelData = (await channelRes.json()) as { name?: string };
      const channelName = channelData.name ?? channelId;

      // Fetch messages after sync cursor (Discord snowflake) or last 7 days
      const lastSyncedAt = connection.lastSyncedAt;
      const afterSnowflake = lastSyncedAt
        ? dateToSnowflake(lastSyncedAt)
        : dateToSnowflake(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));

      const params = new URLSearchParams({
        limit: "50",
        after: afterSnowflake,
      });

      const msgsRes = await fetch(`${DISCORD_API}/channels/${channelId}/messages?${params}`, { headers });
      if (!msgsRes.ok) {
        result.errors.push(`Channel ${channelId} messages: ${msgsRes.status}`);
        continue;
      }

      const messages = (await msgsRes.json()) as DiscordMessage[];
      if (!Array.isArray(messages) || messages.length === 0) continue;

      // Reverse to chronological order (Discord returns newest first)
      messages.reverse();

      // Group messages into 30-min conversation windows
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
        const externalId = `discord:${channelId}:${firstMsg.id}`;

        const existing = await prisma.supportConversation.findFirst({
          where: { clientId: client.id, externalId },
        });

        if (existing) {
          // Add any new messages to existing conversation
          for (const msg of window) {
            const msgExternalId = `discord:${msg.id}`;
            const existingMsg = await prisma.supportMessage.findFirst({
              where: { conversationId: existing.id, externalId: msgExternalId },
            });
            if (!existingMsg) {
              await prisma.supportMessage.create({
                data: {
                  conversationId: existing.id,
                  externalId: msgExternalId,
                  direction: "inbound",
                  authorLabel: msg.author.global_name ?? msg.author.username,
                  body: msg.content || "[no content]",
                  createdAt: new Date(msg.timestamp),
                },
              });
            }
          }
          result.skipped++;
          continue;
        }

        const authorName = firstMsg.author.global_name ?? firstMsg.author.username;
        const subject = `#${channelName} — ${authorName}`;
        const preview = firstMsg.content.slice(0, 120) || "[no content]";

        const conv = await prisma.supportConversation.create({
          data: {
            clientId: client.id,
            source: "DISCORD",
            externalId,
            customerLabel: authorName,
            subject,
            preview,
            receivedAt: new Date(firstMsg.timestamp),
            unread: true,
            tags: [`#${channelName}`],
            sentiment: "NEUTRAL",
          },
        });

        for (const msg of window) {
          await prisma.supportMessage.create({
            data: {
              conversationId: conv.id,
              externalId: `discord:${msg.id}`,
              direction: "inbound",
              authorLabel: msg.author.global_name ?? msg.author.username,
              body: msg.content || "[no content]",
              createdAt: new Date(msg.timestamp),
            },
          });
        }

        result.created++;
      }

      // Update sync cursor to latest message ID (largest snowflake)
      const latestId = messages.at(-1)?.id;
      if (latestId) {
        await prisma.accountConnection.update({
          where: { id: connection.id },
          data: { syncCursor: latestId },
        });
      }
    } catch (err) {
      result.errors.push(
        `Channel ${channelId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  await prisma.accountConnection.update({
    where: { id: connection.id },
    data: { lastSyncedAt: new Date(), health: "CONNECTED" },
  });

  return result;
}

// Convert a Date to a Discord snowflake (approximate — discord epoch is 2015-01-01)
function dateToSnowflake(date: Date): string {
  const DISCORD_EPOCH = 1420070400000;
  const ms = date.getTime() - DISCORD_EPOCH;
  // Snowflake = (ms << 22), done via string math to avoid BigInt target issues
  return String(ms * 4194304); // 2^22 = 4194304
}
