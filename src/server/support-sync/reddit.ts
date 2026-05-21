import { prisma } from "@/lib/prisma";
import type { RawIngestItem } from "@/server/care-agents/types";
import type { AgentContext } from "@/server/care-agents/types";

const REDDIT_API = "https://www.reddit.com";
const USER_AGENT = "Foundry by Gitwork/1.0";

interface RedditPost {
  data: { id: string; title: string; selftext: string; author: string; permalink: string; created_utc: number; num_comments: number };
}

interface RedditComment {
  data: { id: string; body: string; author: string; created_utc: number };
}

interface RedditScraperConfig {
  subreddit?: string;
  keywords?: string[];
}

export async function fetchReddit(ctx: AgentContext): Promise<RawIngestItem[]> {
  const { connection } = ctx;
  const config = (connection.scraperConfig ?? {}) as RedditScraperConfig;
  const subreddit = config.subreddit;
  const keywords = config.keywords ?? [];

  if (!subreddit && keywords.length === 0) throw new Error("No subreddit or keywords configured");

  const lastSyncedAt = connection.lastSyncedAt;
  const afterUtc = lastSyncedAt
    ? Math.floor(lastSyncedAt.getTime() / 1000)
    : Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000);

  const postsToProcess: RedditPost["data"][] = [];

  if (subreddit) {
    try {
      const res = await fetch(`${REDDIT_API}/r/${subreddit}/new.json?limit=25`, {
        headers: { "User-Agent": USER_AGENT },
      });
      if (res.ok) {
        const data = (await res.json()) as { data: { children: RedditPost[] } };
        postsToProcess.push(...data.data.children.map((p) => p.data).filter((p) => p.created_utc > afterUtc));
      }
    } catch { /* ignore */ }
  }

  for (const keyword of keywords) {
    try {
      const params = new URLSearchParams({ q: subreddit ? `subreddit:${subreddit} ${keyword}` : keyword, sort: "new", limit: "10", t: "week" });
      const res = await fetch(`${REDDIT_API}/search.json?${params}`, { headers: { "User-Agent": USER_AGENT } });
      if (res.ok) {
        const data = (await res.json()) as { data: { children: RedditPost[] } };
        postsToProcess.push(...data.data.children.map((p) => p.data).filter((p) => p.created_utc > afterUtc));
      }
    } catch { /* ignore */ }
  }

  // Deduplicate
  const seen = new Set<string>();
  const unique = postsToProcess.filter((p) => { if (seen.has(p.id)) return false; seen.add(p.id); return true; });

  const results: RawIngestItem[] = [];

  for (const post of unique) {
    const comments = await fetchTopComments(post.permalink, afterUtc);
    const rawBody = [post.selftext, ...comments.map((c) => `u/${c.data.author}: ${c.data.body}`)].join("\n\n").slice(0, 4000);

    results.push({
      externalId: `reddit:${post.id}`,
      customerLabel: `u/${post.author}`,
      rawSubject: post.title,
      rawBody,
      receivedAt: new Date(post.created_utc * 1000),
      threadItems: [
        ...(post.selftext.trim() ? [{ id: `reddit:${post.id}:post`, authorLabel: `u/${post.author}`, body: post.selftext, createdAt: new Date(post.created_utc * 1000) }] : []),
        ...comments.filter((c) => c.data.body !== "[deleted]").map((c) => ({
          id: `reddit:comment:${c.data.id}`,
          authorLabel: `u/${c.data.author}`,
          body: c.data.body,
          createdAt: new Date(c.data.created_utc * 1000),
        })),
      ],
      sourceMetadata: { subreddit, permalink: post.permalink },
    });
  }

  return results;
}

async function fetchTopComments(permalink: string, afterUtc: number): Promise<RedditComment[]> {
  try {
    const res = await fetch(`${REDDIT_API}${permalink}.json?limit=10&depth=1`, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) return [];
    const data = (await res.json()) as [unknown, { data: { children: RedditComment[] } }];
    return (data[1]?.data?.children ?? []).filter((c) => c.data?.created_utc > afterUtc && c.data?.body !== "[deleted]").slice(0, 10);
  } catch { return []; }
}

export async function syncReddit(ctx: AgentContext): Promise<{ created: number; skipped: number; errors: string[] }> {
  const items = await fetchReddit(ctx);
  await prisma.accountConnection.update({ where: { id: ctx.connection.id }, data: { lastSyncedAt: new Date(), health: "CONNECTED" } });
  return { created: items.length, skipped: 0, errors: [] };
}
