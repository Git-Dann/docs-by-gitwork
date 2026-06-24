import { fetchNewMessages, fetchChannelHistory, discordMessageBody, sendDiscordMessage, type DiscordMessage } from "@/server/discord-sync";
import type { ChannelAdapter, ChannelFetchResult, RawConversationItem, RawMessageItem } from "./types";

interface DiscordChannelCursor {
  id: string;
  name: string;
  lastMessageId?: string | null;
}

interface DiscordScraperConfig {
  guildId: string;
  guildName?: string;
  botToken?: string;
  channels?: DiscordChannelCursor[];
  keywords?: string[];
  excludeKeywords?: string[];
  lookbackDays?: number;
  maxItems?: number;
  ignoreBots?: boolean;
}

export const discordAdapter: ChannelAdapter = {
  key: "DISCORD",

  async fetchItems(ctx): Promise<ChannelFetchResult> {
    const config = ctx.connection.scraperConfig as DiscordScraperConfig | null;
    const errors: string[] = [];
    const hints: string[] = [];

    if (!config?.guildId) {
      return { items: [], diagnostics: { fetched: 0, filterReasons: {}, hints, errors: ["No guildId in scraperConfig"] } };
    }
    const botToken = config.botToken;
    if (!botToken) {
      return { items: [], diagnostics: { fetched: 0, filterReasons: {}, hints, errors: ["No botToken in scraperConfig — re-save the connector"] } };
    }
    const channels = config.channels ?? [];
    if (channels.length === 0) {
      return { items: [], diagnostics: { fetched: 0, filterReasons: {}, hints, errors: ["No channels configured"] } };
    }

    const ignoreBots = config.ignoreBots ?? true;
    const maxItems = config.maxItems && config.maxItems > 0 ? config.maxItems : undefined;
    // Treat lastSyncedAt === null as "start fresh" — covers both first sync and manual re-sync.
    const isFirstOrResync = !ctx.connection.lastSyncedAt;
    // Keywords stored as "kw:<term>" tags for UI-side highlighting — Discord never gates on them.
    const keywords = (config.keywords ?? []).map((k) => k.toLowerCase()).filter(Boolean);
    const convTags = ["discord", ...keywords.map((k) => `kw:${k}`)];

    const items: RawConversationItem[] = [];
    const updatedChannels = [...channels];
    let fetched = 0;
    let botCount = 0;
    let emptyCount = 0;
    let emitted = 0; // messages emitted across all channels this run (respects maxItems)
    let nonBotEvaluated = 0;
    let emptyNoMedia = 0;

    for (let i = 0; i < channels.length; i++) {
      const ch = channels[i];
      if (maxItems && emitted >= maxItems) break;
      try {
        // First sync / resync: full history backwards; incremental: only after the stored cursor.
        const messages: DiscordMessage[] = isFirstOrResync
          ? await fetchChannelHistory(ch.id, botToken)
          : await fetchNewMessages(ch.id, botToken, ch.lastMessageId ?? undefined);
        fetched += messages.length;
        if (messages.length === 0) continue;

        const msgs: RawMessageItem[] = [];
        let lastMessageId = ch.lastMessageId ?? null;
        let lastBody = discordMessageBody(messages[0]);

        for (const msg of messages) {
          // Stop before advancing the cursor when the cap is hit, so capped messages are
          // picked up on the next sync rather than silently skipped.
          if (maxItems && emitted >= maxItems) break;
          lastMessageId = msg.id;

          if (ignoreBots && msg.author.bot) { botCount++; continue; }
          nonBotEvaluated++;
          // Media-only posts (images/links/stickers) get a placeholder body so they're kept;
          // only truly-empty messages are dropped (a high rate signals the missing intent).
          const body = discordMessageBody(msg);
          if (!body.trim()) { emptyCount++; emptyNoMedia++; continue; }

          msgs.push({
            externalId: msg.id,
            direction: "inbound",
            authorLabel: msg.author.global_name ?? msg.author.username,
            body,
            createdAt: new Date(msg.timestamp),
          });
          lastBody = body;
          emitted++;
        }

        // One conversation per channel — emit even when all messages were filtered so the
        // channel still appears (and the intent hint can surface).
        items.push({
          externalId: ch.id,
          customerLabel: config.guildName ?? ctx.client.name,
          subject: `#${ch.name}`,
          preview: lastBody,
          receivedAt: new Date(messages[0].timestamp),
          tags: convTags,
          refreshTags: true,
          // "Open in Discord" → the channel, scoped to the latest message when known.
          externalUrl: `https://discord.com/channels/${config.guildId}/${ch.id}${lastMessageId ? `/${lastMessageId}` : ""}`,
          externalGuildId: config.guildId,
          messages: msgs,
        });

        updatedChannels[i] = { ...ch, lastMessageId };
      } catch (err) {
        const raw = err instanceof Error ? err.message : String(err);
        // Discord error 50001 = Missing Access: the bot is in the server but lacks permission
        // on THIS channel. Surface an actionable hint rather than the raw payload.
        if (raw.includes("50001") || raw.includes("Missing Access")) {
          errors.push(
            `#${ch.name}: bot lacks access to this channel. In Discord, edit the channel → ` +
              `Permissions → add the bot (or its role) with "View Channel" + "Read Message History". ` +
              `Private, announcement, and forum channels need this granted per-channel.`,
          );
        } else {
          errors.push(`#${ch.name}: ${raw}`);
        }
      }
    }

    // Near-total contentless fetch ⇒ the bot is almost certainly missing the privileged
    // Message Content Intent (Discord blanks content + attachments + embeds without it).
    if (nonBotEvaluated >= 20 && emptyNoMedia / nonBotEvaluated >= 0.8) {
      hints.push(
        "Most messages came back empty — the bot is likely missing the Message Content Intent. " +
          "In the Discord Developer Portal → your app → Bot → Privileged Gateway Intents, enable " +
          '"Message Content Intent", then Re-sync history.',
      );
    }

    return {
      items,
      diagnostics: { fetched, filterReasons: { bots: botCount, empty: emptyCount }, hints, errors },
      configPatch: { channels: updatedChannels },
    };
  },

  async sendReply(ctx, channelId, body) {
    const config = ctx.connection.scraperConfig as DiscordScraperConfig | null;
    const botToken = config?.botToken;
    if (!botToken) throw new Error("Discord sendReply: no botToken in scraperConfig");
    await sendDiscordMessage(channelId, botToken, body);
  },
};
