import type { ChannelAdapter, ChannelFetchResult, RawConversationItem } from "./types";
import { normalizeKeywords, passesKeywordFilters, lookbackSeconds, parseRedditAtom } from "./shared";

interface RedditScraperConfig {
  subreddit?: string;
  keywords?: string[];
  excludeKeywords?: string[];
  lookbackDays?: number;
  maxItems?: number;
}

export const redditAdapter: ChannelAdapter = {
  key: "REDDIT",

  async fetchItems(ctx): Promise<ChannelFetchResult> {
    const config = ctx.connection.scraperConfig as RedditScraperConfig | null;
    const subreddit = config?.subreddit?.trim();
    if (!subreddit) {
      return { items: [], diagnostics: { fetched: 0, filterReasons: {}, hints: [], errors: ["No subreddit configured"] } };
    }

    // First sync / resync: ingest all posts (no date gate); incremental: only newer posts.
    const isFirstOrResync = !ctx.connection.lastSyncedAt;
    const afterUtc = ctx.connection.lastSyncedAt
      ? Math.floor(ctx.connection.lastSyncedAt.getTime() / 1000)
      : lookbackSeconds(config?.lookbackDays, 7);

    const include = normalizeKeywords(config?.keywords);
    const exclude = normalizeKeywords(config?.excludeKeywords);
    const maxItems = config?.maxItems && config.maxItems > 0 ? config.maxItems : undefined;
    const limit = Math.min(maxItems ?? 100, 100);

    const items: RawConversationItem[] = [];
    let emptyCount = 0;
    let excludedCount = 0;
    let fetched = 0;

    try {
      // RSS/Atom feed — no credentials required.
      const res = await fetch(`https://www.reddit.com/r/${subreddit}/new.rss?limit=${limit}`, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; FeedReader/1.0)",
          Accept: "application/atom+xml, application/rss+xml, text/xml, */*",
        },
      });
      if (!res.ok) {
        return { items: [], diagnostics: { fetched: 0, filterReasons: {}, hints: [], errors: [`Reddit RSS error: ${res.status} ${res.statusText}`] } };
      }

      const xml = await res.text();
      const posts = isFirstOrResync ? parseRedditAtom(xml) : parseRedditAtom(xml).filter((p) => p.created_utc > afterUtc);
      fetched = posts.length;

      for (const post of posts) {
        if (maxItems && items.length >= maxItems) break;
        if (!post.title.trim()) { emptyCount++; continue; }
        // Exclude keywords gate; include keywords only tag (no gate).
        if (exclude.length > 0 && !passesKeywordFilters(`${post.title} ${post.body}`, [], exclude)) { excludedCount++; continue; }

        const text = `${post.title} ${post.body}`.toLowerCase();
        const matchedKws = include.filter((kw) => text.includes(kw.toLowerCase()));
        const externalId = `reddit:${post.id}`;
        items.push({
          externalId,
          customerLabel: `u/${post.author}`,
          subject: post.title,
          preview: (post.body || post.title).slice(0, 150),
          receivedAt: new Date(post.created_utc * 1000),
          tags: ["reddit", subreddit, ...matchedKws.map((k) => `kw:${k}`)],
          // Always seed a message so the thread isn't "No messages yet" — link/image posts
          // with no selftext fall back to the title + permalink.
          messages: [{
            externalId: `${externalId}:post`,
            direction: "inbound",
            authorLabel: `u/${post.author}`,
            body: post.body.trim() || `${post.title}\n\n${post.permalink}`,
            createdAt: new Date(post.created_utc * 1000),
          }],
        });
      }
    } catch (err) {
      return { items, diagnostics: { fetched, filterReasons: { empty: emptyCount, excluded: excludedCount }, hints: [], errors: [`r/${subreddit}: ${err instanceof Error ? err.message : String(err)}`] } };
    }

    return { items, diagnostics: { fetched, filterReasons: { empty: emptyCount, excluded: excludedCount }, hints: [], errors: [] } };
  },
};
