import { prisma } from "@/lib/prisma";
import type { SyncContext, SyncResult } from "./types";

const REDDIT_API = "https://www.reddit.com";
const USER_AGENT = "Foundry by Gitwork/1.0";

interface RedditPost {
  data: {
    id: string;
    title: string;
    selftext: string;
    author: string;
    permalink: string;
    created_utc: number;
    url: string;
    num_comments: number;
  };
}

interface RedditComment {
  data: {
    id: string;
    body: string;
    author: string;
    created_utc: number;
    replies?: { data?: { children?: RedditComment[] } } | string;
  };
}

interface RedditScraperConfig {
  subreddit?: string;
  keywords?: string[];
}

export async function syncReddit(ctx: SyncContext): Promise<SyncResult> {
  const { connection, client } = ctx;
  const result: SyncResult = { created: 0, skipped: 0, errors: [] };

  const config = (connection.scraperConfig ?? {}) as RedditScraperConfig;
  const subreddit = config.subreddit;
  const keywords = config.keywords ?? [];

  if (!subreddit && keywords.length === 0) {
    throw new Error("No subreddit or keywords configured");
  }

  const lastSyncedAt = connection.lastSyncedAt;
  const afterUtc = lastSyncedAt
    ? Math.floor(lastSyncedAt.getTime() / 1000)
    : Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000);

  const postsToProcess: RedditPost["data"][] = [];

  // Fetch from subreddit
  if (subreddit) {
    try {
      const url = `${REDDIT_API}/r/${subreddit}/new.json?limit=25`;
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT },
      });
      if (res.ok) {
        const data = (await res.json()) as { data: { children: RedditPost[] } };
        const posts = data.data.children
          .map((p) => p.data)
          .filter((p) => p.created_utc > afterUtc);
        postsToProcess.push(...posts);
      }
    } catch (err) {
      result.errors.push(`Subreddit fetch: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Search by keywords if provided
  for (const keyword of keywords) {
    try {
      const params = new URLSearchParams({
        q: subreddit ? `subreddit:${subreddit} ${keyword}` : keyword,
        sort: "new",
        limit: "10",
        t: "week",
      });
      const url = `${REDDIT_API}/search.json?${params}`;
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT },
      });
      if (res.ok) {
        const data = (await res.json()) as { data: { children: RedditPost[] } };
        const posts = data.data.children
          .map((p) => p.data)
          .filter((p) => p.created_utc > afterUtc);
        postsToProcess.push(...posts);
      }
    } catch (err) {
      result.errors.push(`Keyword "${keyword}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Deduplicate posts by id
  const seen = new Set<string>();
  const uniquePosts = postsToProcess.filter((p) => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });

  for (const post of uniquePosts) {
    try {
      const externalId = `reddit:${post.id}`;

      const existing = await prisma.supportConversation.findFirst({
        where: { clientId: client.id, externalId },
      });

      if (existing) {
        result.skipped++;
        continue;
      }

      const preview = post.selftext.slice(0, 200) || post.title;
      const conv = await prisma.supportConversation.create({
        data: {
          clientId: client.id,
          source: "REDDIT",
          externalId,
          customerLabel: `u/${post.author}`,
          subject: post.title,
          preview,
          receivedAt: new Date(post.created_utc * 1000),
          unread: true,
          tags: subreddit ? [`r/${subreddit}`] : [],
          sentiment: "NEUTRAL",
        },
      });

      // Create the OP as first message
      if (post.selftext.trim()) {
        await prisma.supportMessage.create({
          data: {
            conversationId: conv.id,
            externalId: `reddit:${post.id}:post`,
            direction: "inbound",
            authorLabel: `u/${post.author}`,
            body: post.selftext,
            createdAt: new Date(post.created_utc * 1000),
          },
        });
      }

      // Fetch top comments
      if (post.num_comments > 0) {
        await fetchRedditComments(conv.id, post.permalink, afterUtc, result);
      }

      result.created++;
    } catch (err) {
      result.errors.push(
        `Post ${post.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  await prisma.accountConnection.update({
    where: { id: connection.id },
    data: { lastSyncedAt: new Date(), health: "CONNECTED" },
  });

  return result;
}

async function fetchRedditComments(
  conversationId: string,
  permalink: string,
  afterUtc: number,
  result: SyncResult,
): Promise<void> {
  try {
    const url = `${REDDIT_API}${permalink}.json?limit=10&depth=1`;
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) return;

    const data = (await res.json()) as [unknown, { data: { children: RedditComment[] } }];
    const comments = data[1]?.data?.children ?? [];

    for (const comment of comments.slice(0, 10)) {
      if (!comment.data?.body || comment.data.body === "[deleted]") continue;
      if (comment.data.created_utc <= afterUtc) continue;

      const existingMsg = await prisma.supportMessage.findFirst({
        where: { conversationId, externalId: `reddit:comment:${comment.data.id}` },
      });
      if (existingMsg) continue;

      await prisma.supportMessage.create({
        data: {
          conversationId,
          externalId: `reddit:comment:${comment.data.id}`,
          direction: "inbound",
          authorLabel: `u/${comment.data.author}`,
          body: comment.data.body,
          createdAt: new Date(comment.data.created_utc * 1000),
        },
      });
    }
  } catch {
    result.errors.push(`Failed to fetch comments for ${permalink}`);
  }
}
