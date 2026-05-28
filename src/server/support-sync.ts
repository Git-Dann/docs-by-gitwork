import { prisma } from "@/lib/prisma";
import { DEFAULT_WORKSPACE_SLUG } from "@/server/proposals";
import { fetchNewMessages } from "@/server/discord-sync";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DiscordChannelCursor {
  id: string;
  name: string;
  lastMessageId?: string | null;
}

interface RedditScraperConfig {
  subreddit?: string;
  keywords?: string[];
}

const REDDIT_API = "https://www.reddit.com";
const REDDIT_USER_AGENT = "Foundry by Gitwork/1.0";

interface DiscordScraperConfig {
  guildId: string;
  guildName?: string;
  botToken?: string;
  channels?: DiscordChannelCursor[];
  keywords?: string[];
}

export interface SyncResult {
  ingested: number;
  filtered: number;
  errors: string[];
}

export interface SyncContext {
  connection: {
    id: string;
    source: string;
    scraperConfig: unknown;
    syncCursor: string | null;
    lastSyncedAt: Date | null;
    channelTokens: unknown[];
  };
  client: { id: string; name: string; slug: string };
  workspace: {
    id: string;
    googleServiceAccountJson: string | null;
    googleSubjectEmail: string | null;
    aiProvider: string;
    anthropicApiKey: string | null;
    anthropicModel: string | null;
    openaiApiKey: string | null;
    openaiModel: string | null;
    geminiApiKey: string | null;
    geminiModel: string | null;
    localLlmUrl: string | null;
    localLlmModel: string | null;
  };
}

// ─── Context builder (used by the per-connection sync route) ──────────────────

export async function buildSyncContext(connId: string): Promise<SyncContext> {
  const workspace = await prisma.workspace.findFirst({
    where: { slug: DEFAULT_WORKSPACE_SLUG },
    select: {
      id: true,
      googleServiceAccountJson: true,
      googleSubjectEmail: true,
      aiProvider: true,
      anthropicApiKey: true,
      anthropicModel: true,
      openaiApiKey: true,
      openaiModel: true,
      geminiApiKey: true,
      geminiModel: true,
      localLlmUrl: true,
      localLlmModel: true,
    },
  });
  if (!workspace) throw new Error("Workspace not found");

  const conn = await prisma.accountConnection.findUniqueOrThrow({
    where: { id: connId },
    include: {
      channelTokens: true,
      client: { select: { id: true, name: true, slug: true } },
    },
  });

  return { connection: conn, client: conn.client, workspace };
}

// ─── Discord sync ─────────────────────────────────────────────────────────────

async function syncDiscordConnection(ctx: SyncContext): Promise<SyncResult> {
  const config = ctx.connection.scraperConfig as DiscordScraperConfig | null;

  if (!config?.guildId) {
    return { ingested: 0, filtered: 0, errors: ["No guildId in scraperConfig"] };
  }

  const botToken = config.botToken;
  if (!botToken) {
    return { ingested: 0, filtered: 0, errors: ["No botToken in scraperConfig — re-save the connector"] };
  }

  const channels = config.channels ?? [];
  if (channels.length === 0) {
    return { ingested: 0, filtered: 0, errors: ["No channels configured"] };
  }

  let ingested = 0;
  let filtered = 0;
  const errors: string[] = [];
  const updatedChannels = [...channels];

  for (let i = 0; i < channels.length; i++) {
    const ch = channels[i];
    try {
      const messages = await fetchNewMessages(ch.id, botToken, ch.lastMessageId);
      if (messages.length === 0) continue;

      // Find or create one conversation per Discord channel
      let conv = await prisma.supportConversation.findFirst({
        where: { clientId: ctx.client.id, source: "DISCORD", externalId: ch.id },
      });

      if (!conv) {
        conv = await prisma.supportConversation.create({
          data: {
            clientId: ctx.client.id,
            source: "DISCORD",
            externalId: ch.id,
            customerLabel: config.guildName ?? ctx.client.name,
            subject: `#${ch.name}`,
            preview: messages[0].content.slice(0, 150),
            receivedAt: new Date(messages[0].timestamp),
            unread: true,
            tags: ["discord"],
          },
        });
      }

      let lastMessageId = ch.lastMessageId ?? null;

      const keywords = (config.keywords ?? []).map((k) => k.toLowerCase()).filter(Boolean);

      for (const msg of messages) {
        if (msg.author.bot) { filtered++; continue; }
        if (!msg.content.trim()) { filtered++; continue; }

        // Keyword filter — if configured, only ingest messages containing at least one keyword
        if (keywords.length > 0) {
          const lower = msg.content.toLowerCase();
          if (!keywords.some((kw) => lower.includes(kw))) { filtered++; continue; }
        }

        // Skip already-ingested messages (guards against partial sync failures)
        const already = await prisma.supportMessage.findFirst({
          where: { conversationId: conv.id, externalId: msg.id },
          select: { id: true },
        });
        if (already) { filtered++; continue; }

        await prisma.supportMessage.create({
          data: {
            conversationId: conv.id,
            direction: "inbound",
            authorLabel: msg.author.global_name ?? msg.author.username,
            body: msg.content,
            externalId: msg.id,
            createdAt: new Date(msg.timestamp),
          },
        });

        ingested++;
        lastMessageId = msg.id;
      }

      if (ingested > 0) {
        const lastMsg = messages[messages.length - 1];
        await prisma.supportConversation.update({
          where: { id: conv.id },
          data: { unread: true, preview: lastMsg.content.slice(0, 150) },
        });
      }

      updatedChannels[i] = { ...ch, lastMessageId };
    } catch (err) {
      errors.push(`#${ch.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Persist updated per-channel cursors and timestamp
  await prisma.accountConnection.update({
    where: { id: ctx.connection.id },
    data: {
      scraperConfig: { ...config, channels: updatedChannels } as object,
      lastSyncedAt: new Date(),
    },
  });

  return { ingested, filtered, errors };
}

// ─── Reddit sync ──────────────────────────────────────────────────────────────

async function syncRedditConnection(ctx: SyncContext): Promise<SyncResult> {
  const config = ctx.connection.scraperConfig as RedditScraperConfig | null;
  const subreddit = config?.subreddit?.trim();

  if (!subreddit) {
    return { ingested: 0, filtered: 0, errors: ["No subreddit configured"] };
  }

  // Use lastSyncedAt as cursor; on first sync go back 7 days
  const lastSyncedAt = ctx.connection.lastSyncedAt;
  const afterUtc = lastSyncedAt
    ? Math.floor(lastSyncedAt.getTime() / 1000)
    : Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000);

  let ingested = 0;
  let filtered = 0;
  const errors: string[] = [];
  const keywords = (config?.keywords ?? []).map((k) => k.toLowerCase()).filter(Boolean);

  try {
    const res = await fetch(`${REDDIT_API}/r/${subreddit}/new.json?limit=25`, {
      headers: { "User-Agent": REDDIT_USER_AGENT },
    });

    if (!res.ok) {
      return { ingested: 0, filtered: 0, errors: [`Reddit API error: ${res.status} ${res.statusText}`] };
    }

    const data = (await res.json()) as {
      data: { children: Array<{ data: { id: string; title: string; selftext: string; author: string; permalink: string; created_utc: number } }> };
    };

    const posts = data.data.children.map((p) => p.data).filter((p) => p.created_utc > afterUtc);

    for (const post of posts) {
      // Keyword filter — if configured, skip posts that don't match
      if (keywords.length > 0) {
        const text = `${post.title} ${post.selftext}`.toLowerCase();
        if (!keywords.some((kw) => text.includes(kw))) { filtered++; continue; }
      }

      // Skip completely empty posts
      if (!post.title.trim()) { filtered++; continue; }

      const externalId = `reddit:${post.id}`;

      // Find or create one conversation per Reddit post
      let conv = await prisma.supportConversation.findFirst({
        where: { clientId: ctx.client.id, source: "REDDIT", externalId },
      });

      if (!conv) {
        conv = await prisma.supportConversation.create({
          data: {
            clientId: ctx.client.id,
            source: "REDDIT",
            externalId,
            customerLabel: `u/${post.author}`,
            subject: post.title,
            preview: (post.selftext || post.title).slice(0, 150),
            receivedAt: new Date(post.created_utc * 1000),
            unread: true,
            tags: ["reddit", subreddit],
          },
        });

        // Save the post body as the first message
        if (post.selftext.trim()) {
          await prisma.supportMessage.create({
            data: {
              conversationId: conv.id,
              direction: "inbound",
              authorLabel: `u/${post.author}`,
              body: post.selftext,
              externalId: `${externalId}:post`,
              createdAt: new Date(post.created_utc * 1000),
            },
          });
        }

        ingested++;
      }

      // Pull top-level comments and store new ones
      try {
        const commentsRes = await fetch(`${REDDIT_API}${post.permalink}.json?limit=10&depth=1`, {
          headers: { "User-Agent": REDDIT_USER_AGENT },
        });
        if (commentsRes.ok) {
          const commentsData = (await commentsRes.json()) as [
            unknown,
            { data: { children: Array<{ data: { id: string; body: string; author: string; created_utc: number } }> } },
          ];
          const comments = commentsData[1]?.data?.children ?? [];

          for (const comment of comments) {
            const c = comment.data;
            if (!c.body || c.body === "[deleted]" || c.body === "[removed]") continue;
            if (c.created_utc <= afterUtc) continue;

            const already = await prisma.supportMessage.findFirst({
              where: { conversationId: conv.id, externalId: `reddit:comment:${c.id}` },
              select: { id: true },
            });
            if (already) continue;

            await prisma.supportMessage.create({
              data: {
                conversationId: conv.id,
                direction: "inbound",
                authorLabel: `u/${c.author}`,
                body: c.body,
                externalId: `reddit:comment:${c.id}`,
                createdAt: new Date(c.created_utc * 1000),
              },
            });
          }
        }
      } catch { /* ignore comment fetch errors — post is already saved */ }
    }
  } catch (err) {
    errors.push(`r/${subreddit}: ${err instanceof Error ? err.message : String(err)}`);
  }

  await prisma.accountConnection.update({
    where: { id: ctx.connection.id },
    data: { lastSyncedAt: new Date() },
  });

  return { ingested, filtered, errors };
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────

export async function syncConnection(ctx: SyncContext): Promise<SyncResult> {
  switch (ctx.connection.source) {
    case "DISCORD":
      return syncDiscordConnection(ctx);
    case "REDDIT":
      return syncRedditConnection(ctx);
    default:
      return {
        ingested: 0,
        filtered: 0,
        errors: [`Source ${ctx.connection.source} not yet implemented`],
      };
  }
}
