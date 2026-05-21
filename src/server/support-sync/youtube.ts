import { google } from "googleapis";
import { prisma } from "@/lib/prisma";
import type { SyncContext, SyncResult } from "./types";

interface YouTubeScraperConfig {
  youtubeChannelId?: string;
  videoIds?: string[];
}

export async function syncYouTube(ctx: SyncContext): Promise<SyncResult> {
  const { connection, client, workspace } = ctx;
  const result: SyncResult = { created: 0, skipped: 0, errors: [] };

  if (!workspace.googleServiceAccountJson) {
    throw new Error("Google service account not configured in Settings → Integrations");
  }

  const credentials = JSON.parse(workspace.googleServiceAccountJson);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/youtube.readonly"],
  });

  const youtube = google.youtube({ version: "v3", auth });
  const config = (connection.scraperConfig ?? {}) as YouTubeScraperConfig;
  const videoIds = config.videoIds ?? [];
  const channelId = config.youtubeChannelId;

  if (!channelId && videoIds.length === 0) {
    throw new Error("No YouTube channel ID or video IDs configured");
  }

  const lastSyncedAt = connection.lastSyncedAt;
  const publishedAfter = lastSyncedAt
    ? lastSyncedAt.toISOString()
    : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const targetVideoIds: string[] = [...videoIds];

  // If channelId provided, discover recent video IDs
  if (channelId) {
    try {
      const searchRes = await youtube.search.list({
        part: ["id", "snippet"],
        channelId,
        type: ["video"],
        order: "date",
        publishedAfter,
        maxResults: 10,
      });
      const items = searchRes.data.items ?? [];
      for (const item of items) {
        if (item.id?.videoId) targetVideoIds.push(item.id.videoId);
      }
    } catch (err) {
      result.errors.push(`Channel video search: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  for (const videoId of [...new Set(targetVideoIds)]) {
    try {
      // Fetch video title
      let videoTitle = videoId;
      try {
        const videoRes = await youtube.videos.list({
          part: ["snippet"],
          id: [videoId],
        });
        videoTitle = videoRes.data.items?.[0]?.snippet?.title ?? videoId;
      } catch {
        // ignore
      }

      const commentsRes = await youtube.commentThreads.list({
        part: ["snippet", "replies"],
        videoId,
        textFormat: "plainText",
        maxResults: 50,
        order: "time",
      });

      const threads = commentsRes.data.items ?? [];

      for (const thread of threads) {
        const topComment = thread.snippet?.topLevelComment?.snippet;
        if (!topComment) continue;

        const publishedAt = topComment.publishedAt
          ? new Date(topComment.publishedAt)
          : new Date();

        if (publishedAt.toISOString() <= publishedAfter && !config.videoIds?.includes(videoId)) {
          continue;
        }

        const externalId = `yt:${thread.id}`;

        const existing = await prisma.supportConversation.findFirst({
          where: { clientId: client.id, externalId },
        });

        if (existing) {
          result.skipped++;
          continue;
        }

        const authorName = topComment.authorDisplayName ?? "unknown";
        const subject = `YouTube: ${videoTitle}`;
        const preview = (topComment.textDisplay ?? "").slice(0, 200);

        const conv = await prisma.supportConversation.create({
          data: {
            clientId: client.id,
            source: "YOUTUBE",
            externalId,
            customerLabel: authorName,
            subject,
            preview,
            receivedAt: publishedAt,
            unread: true,
            tags: [`video:${videoId}`],
            sentiment: "NEUTRAL",
          },
        });

        // Top-level comment
        await prisma.supportMessage.create({
          data: {
            conversationId: conv.id,
            externalId: `yt:msg:${thread.snippet?.topLevelComment?.id ?? thread.id}`,
            direction: "inbound",
            authorLabel: authorName,
            body: topComment.textDisplay ?? "",
            createdAt: publishedAt,
          },
        });

        // Replies
        const replies = thread.replies?.comments ?? [];
        for (const reply of replies) {
          const replySnippet = reply.snippet;
          if (!replySnippet) continue;

          await prisma.supportMessage.create({
            data: {
              conversationId: conv.id,
              externalId: `yt:msg:${reply.id}`,
              direction: "inbound",
              authorLabel: replySnippet.authorDisplayName ?? "unknown",
              body: replySnippet.textDisplay ?? "",
              createdAt: replySnippet.publishedAt
                ? new Date(replySnippet.publishedAt)
                : new Date(),
            },
          });
        }

        result.created++;
      }
    } catch (err) {
      result.errors.push(
        `Video ${videoId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  await prisma.accountConnection.update({
    where: { id: connection.id },
    data: { lastSyncedAt: new Date(), health: "CONNECTED" },
  });

  return result;
}
