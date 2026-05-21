import { google } from "googleapis";
import { prisma } from "@/lib/prisma";
import type { RawIngestItem } from "@/server/care-agents/types";
import type { AgentContext } from "@/server/care-agents/types";

interface YouTubeScraperConfig {
  youtubeChannelId?: string;
  videoIds?: string[];
}

export async function fetchYouTube(ctx: AgentContext): Promise<RawIngestItem[]> {
  const { connection, workspace } = ctx;

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
  const videoIds = [...(config.videoIds ?? [])];
  const channelId = config.youtubeChannelId;

  if (!channelId && videoIds.length === 0) throw new Error("No YouTube channel ID or video IDs configured");

  const lastSyncedAt = connection.lastSyncedAt;
  const publishedAfter = lastSyncedAt
    ? lastSyncedAt.toISOString()
    : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  if (channelId) {
    try {
      const searchRes = await youtube.search.list({ part: ["id", "snippet"], channelId, type: ["video"], order: "date", publishedAfter, maxResults: 10 });
      for (const item of searchRes.data.items ?? []) {
        if (item.id?.videoId) videoIds.push(item.id.videoId);
      }
    } catch { /* ignore */ }
  }

  const results: RawIngestItem[] = [];

  for (const videoId of [...new Set(videoIds)]) {
    try {
      let videoTitle = videoId;
      try {
        const v = await youtube.videos.list({ part: ["snippet"], id: [videoId] });
        videoTitle = v.data.items?.[0]?.snippet?.title ?? videoId;
      } catch { /* ignore */ }

      const commentsRes = await youtube.commentThreads.list({ part: ["snippet", "replies"], videoId, textFormat: "plainText", maxResults: 50, order: "time" });

      for (const thread of commentsRes.data.items ?? []) {
        const top = thread.snippet?.topLevelComment?.snippet;
        if (!top) continue;

        const publishedAt = top.publishedAt ? new Date(top.publishedAt) : new Date();
        if (publishedAt.toISOString() <= publishedAfter) continue;

        const replies = thread.replies?.comments ?? [];
        const rawBody = [top.textDisplay ?? "", ...replies.map((r) => `${r.snippet?.authorDisplayName}: ${r.snippet?.textDisplay}`)].join("\n\n");

        results.push({
          externalId: `yt:${thread.id}`,
          customerLabel: top.authorDisplayName ?? "unknown",
          rawSubject: `YouTube: ${videoTitle}`,
          rawBody: rawBody.slice(0, 4000),
          receivedAt: publishedAt,
          threadItems: [
            { id: `yt:msg:${thread.snippet?.topLevelComment?.id ?? thread.id}`, authorLabel: top.authorDisplayName ?? "unknown", body: top.textDisplay ?? "", createdAt: publishedAt },
            ...replies.map((r) => ({
              id: `yt:msg:${r.id}`,
              authorLabel: r.snippet?.authorDisplayName ?? "unknown",
              body: r.snippet?.textDisplay ?? "",
              createdAt: r.snippet?.publishedAt ? new Date(r.snippet.publishedAt) : new Date(),
            })),
          ],
          sourceMetadata: { videoId, videoTitle },
        });
      }
    } catch { /* skip video errors */ }
  }

  return results;
}

export async function syncYouTube(ctx: AgentContext): Promise<{ created: number; skipped: number; errors: string[] }> {
  const items = await fetchYouTube(ctx);
  await prisma.accountConnection.update({ where: { id: ctx.connection.id }, data: { lastSyncedAt: new Date(), health: "CONNECTED" } });
  return { created: items.length, skipped: 0, errors: [] };
}
