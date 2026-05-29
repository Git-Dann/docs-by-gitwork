import { google } from "googleapis";
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

// ─── Reddit RSS helpers ───────────────────────────────────────────────────────

interface RedditRssPost {
  id: string;
  title: string;
  author: string;
  body: string;
  permalink: string;
  created_utc: number;
}

function xmlTag(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
  return m?.[1]?.trim() ?? "";
}

function decodeXmlEntities(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function parseRedditAtom(xml: string): RedditRssPost[] {
  const posts: RedditRssPost[] = [];
  for (const [, entry] of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const permalink = decodeXmlEntities(xmlTag(entry, "id"));
    const postIdMatch = permalink.match(/\/comments\/([a-z0-9]+)\//i);
    if (!postIdMatch) continue;
    const title = decodeXmlEntities(xmlTag(entry, "title"));
    if (!title) continue;
    const author = decodeXmlEntities(xmlTag(entry, "name")).replace(/^\/u\//, "");
    const updatedStr = xmlTag(entry, "updated");
    const created_utc = updatedStr ? Math.floor(new Date(updatedStr).getTime() / 1000) : Math.floor(Date.now() / 1000);
    const contentHtml = decodeXmlEntities(xmlTag(entry, "content"));
    const body = stripHtml(contentHtml);
    posts.push({ id: postIdMatch[1], title, author: author || "unknown", body, permalink, created_utc });
  }
  return posts;
}

interface DiscordScraperConfig {
  guildId: string;
  guildName?: string;
  botToken?: string;
  channels?: DiscordChannelCursor[];
  keywords?: string[];
}

export interface SyncResult {
  fetched?: number;
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
    googleOAuthRefreshToken: string | null;
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
      googleOAuthRefreshToken: true,
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
    // Use the RSS/Atom feed — no credentials required
    const res = await fetch(`https://www.reddit.com/r/${subreddit}/new.rss?limit=25`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; FeedReader/1.0)",
        Accept: "application/atom+xml, application/rss+xml, text/xml, */*",
      },
    });

    if (!res.ok) {
      return { ingested: 0, filtered: 0, errors: [`Reddit RSS error: ${res.status} ${res.statusText}`] };
    }

    const xml = await res.text();
    const posts = parseRedditAtom(xml).filter((p) => p.created_utc > afterUtc);

    for (const post of posts) {
      // Keyword filter — if configured, skip posts that don't match
      if (keywords.length > 0) {
        const text = `${post.title} ${post.body}`.toLowerCase();
        if (!keywords.some((kw) => text.includes(kw))) { filtered++; continue; }
      }

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
            preview: (post.body || post.title).slice(0, 150),
            receivedAt: new Date(post.created_utc * 1000),
            unread: true,
            tags: ["reddit", subreddit],
          },
        });

        if (post.body.trim()) {
          await prisma.supportMessage.create({
            data: {
              conversationId: conv.id,
              direction: "inbound",
              authorLabel: `u/${post.author}`,
              body: post.body,
              externalId: `${externalId}:post`,
              createdAt: new Date(post.created_utc * 1000),
            },
          });
        }

        ingested++;
      }
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

// ─── Gmail sync ───────────────────────────────────────────────────────────────

function extractGmailBodyText(msg: { payload?: { parts?: unknown[]; body?: { data?: string | null }; mimeType?: string } | null }): string {
  const payload = msg.payload;
  if (!payload) return "";

  function decodeBase64(data: string): string {
    return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
  }

  function extractFromParts(parts: unknown[]): string {
    const p = parts as Array<{ mimeType?: string; body?: { data?: string | null }; parts?: unknown[] }>;
    for (const part of p) {
      if (part.mimeType === "text/plain" && part.body?.data) return decodeBase64(part.body.data);
    }
    for (const part of p) {
      if (part.mimeType === "text/html" && part.body?.data) {
        return decodeBase64(part.body.data).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      }
    }
    for (const part of p) {
      if (part.parts) {
        const found = extractFromParts(part.parts);
        if (found) return found;
      }
    }
    return "";
  }

  if (payload.parts) return extractFromParts(payload.parts);
  if (payload.body?.data) return decodeBase64(payload.body.data);
  return "";
}

async function syncGmailConnection(ctx: SyncContext): Promise<SyncResult> {
  const { workspace, connection, client } = ctx;

  let gmailAuth: Parameters<typeof google.gmail>[0]["auth"];

  if (workspace.googleOAuthRefreshToken) {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return { fetched: 0, ingested: 0, filtered: 0, errors: ["GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET env vars not configured"] };
    }
    const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
    oauth2.setCredentials({ refresh_token: workspace.googleOAuthRefreshToken });
    gmailAuth = oauth2 as Parameters<typeof google.gmail>[0]["auth"];
  } else if (workspace.googleServiceAccountJson) {
    try {
      const credentials = JSON.parse(workspace.googleServiceAccountJson) as Record<string, unknown>;
      const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ["https://www.googleapis.com/auth/gmail.readonly"],
      });
      const authClient = await auth.getClient();
      if (workspace.googleSubjectEmail && "subject" in authClient) {
        (authClient as { subject?: string }).subject = workspace.googleSubjectEmail;
      }
      gmailAuth = authClient as Parameters<typeof google.gmail>[0]["auth"];
    } catch (err) {
      return { fetched: 0, ingested: 0, filtered: 0, errors: [`Gmail auth failed: ${err instanceof Error ? err.message : String(err)}`] };
    }
  } else {
    return { fetched: 0, ingested: 0, filtered: 0, errors: ["Gmail not connected — go to Settings → Google Workspace and click Connect Gmail"] };
  }

  const gmail = google.gmail({ version: "v1", auth: gmailAuth });
  const config = (connection.scraperConfig ?? {}) as { query?: string; intakeAddress?: string };
  const queryBase = config.query ?? (config.intakeAddress ? `to:${config.intakeAddress}` : "");
  const lastSyncedAt = connection.lastSyncedAt;
  const afterSeconds = lastSyncedAt
    ? Math.floor(lastSyncedAt.getTime() / 1000)
    : Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000);
  const fullQuery = [queryBase, `after:${afterSeconds}`].filter(Boolean).join(" ");

  let ingested = 0;
  let filtered = 0;
  const errors: string[] = [];

  try {
    const listRes = await gmail.users.messages.list({ userId: "me", q: fullQuery, maxResults: 50 });
    const messageItems = listRes.data.messages ?? [];
    const fetched = messageItems.length;
    const threadsSeen = new Set<string>();

    for (const item of messageItems) {
      if (!item.id || !item.threadId) continue;
      if (threadsSeen.has(item.threadId)) { filtered++; continue; }
      threadsSeen.add(item.threadId);

      try {
        const threadRes = await gmail.users.threads.get({
          userId: "me",
          id: item.threadId,
          format: "metadata",
          metadataHeaders: ["Subject", "From", "Date"],
        });
        const threadMessages = threadRes.data.messages ?? [];
        if (threadMessages.length === 0) { filtered++; continue; }

        const firstMsg = threadMessages[0];
        const hdrs = firstMsg.payload?.headers ?? [];
        const subject = hdrs.find((h) => h.name === "Subject")?.value ?? "(no subject)";
        const from = hdrs.find((h) => h.name === "From")?.value ?? "unknown";
        const dateStr = hdrs.find((h) => h.name === "Date")?.value;
        const receivedAt = dateStr ? new Date(dateStr) : new Date();
        const customerLabel = from.replace(/<[^>]+>/g, "").trim() || from;

        let conv = await prisma.supportConversation.findFirst({
          where: { clientId: client.id, source: "GMAIL", externalId: item.threadId },
        });

        if (!conv) {
          conv = await prisma.supportConversation.create({
            data: {
              clientId: client.id,
              source: "GMAIL",
              externalId: item.threadId,
              customerLabel,
              subject,
              preview: subject,
              receivedAt,
              unread: true,
              tags: ["gmail"],
            },
          });
          ingested++;
        } else {
          filtered++;
        }

        for (const msg of threadMessages) {
          if (!msg.id) continue;
          const already = await prisma.supportMessage.findFirst({
            where: { conversationId: conv.id, externalId: msg.id },
            select: { id: true },
          });
          if (already) continue;

          try {
            const msgRes = await gmail.users.messages.get({ userId: "me", id: msg.id, format: "full" });
            const body = extractGmailBodyText(msgRes.data);
            if (!body.trim()) continue;

            const msgHdrs = (msg.payload?.headers ?? []) as Array<{ name?: string | null; value?: string | null }>;
            const msgFrom = msgHdrs.find((h) => h.name === "From")?.value ?? "";
            const isOutbound = workspace.googleSubjectEmail ? msgFrom.includes(workspace.googleSubjectEmail) : false;

            await prisma.supportMessage.create({
              data: {
                conversationId: conv.id,
                direction: isOutbound ? "outbound" : "inbound",
                authorLabel: msgFrom.replace(/<[^>]+>/g, "").trim() || msgFrom,
                body: body.slice(0, 4000),
                externalId: msg.id,
                createdAt: msg.internalDate ? new Date(parseInt(msg.internalDate)) : receivedAt,
              },
            });
          } catch {
            // skip individual message errors
          }
        }
      } catch (err) {
        errors.push(`Thread ${item.threadId}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    await prisma.accountConnection.update({
      where: { id: connection.id },
      data: { lastSyncedAt: new Date() },
    });

    return { fetched, ingested, filtered, errors };
  } catch (err) {
    return { fetched: 0, ingested: 0, filtered: 0, errors: [`Gmail sync failed: ${err instanceof Error ? err.message : String(err)}`] };
  }
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────

export async function syncConnection(ctx: SyncContext): Promise<SyncResult> {
  switch (ctx.connection.source) {
    case "GMAIL":
      return syncGmailConnection(ctx);
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
