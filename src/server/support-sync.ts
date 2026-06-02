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
  excludeKeywords?: string[];
  lookbackDays?: number;
  maxItems?: number;
}

// ─── Shared filter helpers ──────────────────────────────────────────────────────

function normalizeKeywords(list?: string[]): string[] {
  return (list ?? []).map((k) => k.toLowerCase().trim()).filter(Boolean);
}

/**
 * Returns true if `text` passes the include/exclude keyword filters.
 * - include: if non-empty, text must contain at least one term
 * - exclude: if any term is present, the item is rejected
 */
function passesKeywordFilters(text: string, include: string[], exclude: string[]): boolean {
  const lower = text.toLowerCase();
  if (exclude.length > 0 && exclude.some((kw) => lower.includes(kw))) return false;
  if (include.length > 0 && !include.some((kw) => lower.includes(kw))) return false;
  return true;
}

function lookbackSeconds(lookbackDays: number | undefined, fallbackDays: number): number {
  const days = lookbackDays && lookbackDays > 0 ? lookbackDays : fallbackDays;
  return Math.floor((Date.now() - days * 24 * 60 * 60 * 1000) / 1000);
}

/** Convert a Date to a Discord snowflake (used as an `after` cursor). */
function dateToSnowflake(date: Date): string {
  const DISCORD_EPOCH = 1420070400000;
  const ms = Math.max(0, date.getTime() - DISCORD_EPOCH);
  return String(ms * 4194304); // << 22
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
  excludeKeywords?: string[];
  lookbackDays?: number;
  maxItems?: number;
  ignoreBots?: boolean;
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

  const ignoreBots = config.ignoreBots ?? true;
  const maxItems = config.maxItems && config.maxItems > 0 ? config.maxItems : undefined;
  // firstSyncAfter: used both for first-time syncs AND when lastSyncedAt has been cleared
  // (i.e. the user hit "Re-sync history"). We reach back `lookbackDays` (default 30).
  const firstSyncAfter = dateToSnowflake(
    new Date(lookbackSeconds(config.lookbackDays, 30) * 1000),
  );
  // Treat lastSyncedAt === null as "start fresh" — covers both first sync and manual re-sync.
  // This ensures re-sync actually goes back to the lookback window instead of being a no-op.
  const isFirstOrResync = !ctx.connection.lastSyncedAt;
  // Keywords stored as "kw:<term>" tags on the conversation for UI-side highlighting.
  // Discord ingests ALL messages — keyword filtering happens at display time, not here.
  const keywords = (config.keywords ?? []).map((k) => k.toLowerCase()).filter(Boolean);
  const convTags = ["discord", ...keywords.map((k) => `kw:${k}`)];

  for (let i = 0; i < channels.length; i++) {
    const ch = channels[i];
    if (maxItems && ingested >= maxItems) break;
    try {
      const afterCursor = (!isFirstOrResync && ch.lastMessageId) ? ch.lastMessageId : firstSyncAfter;
      const messages = await fetchNewMessages(ch.id, botToken, afterCursor);
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
            tags: convTags,
          },
        });
      } else {
        // Keep keyword tags in sync with current connector config on every sync
        await prisma.supportConversation.update({
          where: { id: conv.id },
          data: { tags: convTags },
        });
      }

      let lastMessageId = ch.lastMessageId ?? null;

      for (const msg of messages) {
        // Stop before advancing the cursor when the cap is hit, so capped messages
        // are picked up on the next sync rather than silently skipped.
        if (maxItems && ingested >= maxItems) break;

        // Advance the cursor past messages we've seen, even when filtered out,
        // so filtered noise isn't re-evaluated on every sync.
        lastMessageId = msg.id;

        if (ignoreBots && msg.author.bot) { filtered++; continue; }
        if (!msg.content.trim()) { filtered++; continue; }

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
      const raw = err instanceof Error ? err.message : String(err);
      // Discord error code 50001 = Missing Access: the bot is in the server but lacks
      // permission on THIS channel. Surface an actionable hint rather than the raw payload.
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

  // Use lastSyncedAt as cursor; on first sync go back `lookbackDays` (default 7)
  const lastSyncedAt = ctx.connection.lastSyncedAt;
  const afterUtc = lastSyncedAt
    ? Math.floor(lastSyncedAt.getTime() / 1000)
    : lookbackSeconds(config?.lookbackDays, 7);

  let ingested = 0;
  let filtered = 0;
  const errors: string[] = [];
  const include = normalizeKeywords(config?.keywords);
  const exclude = normalizeKeywords(config?.excludeKeywords);
  const maxItems = config?.maxItems && config.maxItems > 0 ? config.maxItems : undefined;
  const limit = Math.min(maxItems ?? 25, 100);

  try {
    // Use the RSS/Atom feed — no credentials required
    const res = await fetch(`https://www.reddit.com/r/${subreddit}/new.rss?limit=${limit}`, {
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
      if (maxItems && ingested >= maxItems) break;

      // Include / exclude keyword filters on title + body
      if (!passesKeywordFilters(`${post.title} ${post.body}`, include, exclude)) { filtered++; continue; }

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

// Gmail API types: `mimeType` is `string | null | undefined`. Widening here so
// callers can hand us the raw Schema$Message without an intermediate cast.
function extractGmailBodyText(msg: { payload?: { parts?: unknown[]; body?: { data?: string | null }; mimeType?: string | null } | null }): string {
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

  if (!workspace.googleServiceAccountJson) {
    return { fetched: 0, ingested: 0, filtered: 0, errors: ["Google service account not configured — paste the JSON in Settings → Google Workspace"] };
  }

  const config = (connection.scraperConfig ?? {}) as RedditScraperConfig & {
    query?: string;
    intakeAddress?: string;
    impersonateEmail?: string;
  };

  const impersonateEmail = config.impersonateEmail ?? workspace.googleSubjectEmail ?? null;
  if (!impersonateEmail) {
    return { fetched: 0, ingested: 0, filtered: 0, errors: ["No inbox configured — set 'Inbox to read' on this Gmail connector"] };
  }

  let gmail: ReturnType<typeof google.gmail>;
  try {
    const credentials = JSON.parse(workspace.googleServiceAccountJson) as Record<string, unknown>;
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/gmail.readonly"],
      clientOptions: { subject: impersonateEmail },
    });
    const gmailAuth = (await auth.getClient()) as Parameters<typeof google.gmail>[0]["auth"];
    gmail = google.gmail({ version: "v1", auth: gmailAuth });
  } catch (err) {
    return { fetched: 0, ingested: 0, filtered: 0, errors: [`Gmail auth failed: ${err instanceof Error ? err.message : String(err)}`] };
  }

  // Query is fully optional — leave blank to pull all mail since last sync.
  // No restrictive fallback: if the client hasn't set up forwarding the `to:` filter
  // would return zero results, silently appearing to "not work".
  const queryBase = config.query?.trim() ?? "";
  const lastSyncedAt = connection.lastSyncedAt;
  const afterSeconds = lastSyncedAt
    ? Math.floor(lastSyncedAt.getTime() / 1000)
    : lookbackSeconds(config.lookbackDays, 30);

  // Push keyword filters into the Gmail query itself (server-side, most efficient).
  const include = normalizeKeywords(config.keywords);
  const exclude = normalizeKeywords(config.excludeKeywords);
  const includeClause = include.length > 0 ? `(${include.map((k) => `"${k}"`).join(" OR ")})` : "";
  const excludeClause = exclude.map((k) => `-"${k}"`).join(" ");
  const maxResults = config.maxItems && config.maxItems > 0 ? Math.min(config.maxItems, 100) : 50;
  const fullQuery = [queryBase, includeClause, excludeClause, `after:${afterSeconds}`]
    .filter(Boolean)
    .join(" ");

  let ingested = 0;
  let filtered = 0;
  const errors: string[] = [];

  try {
    const listRes = await gmail.users.messages.list({ userId: "me", q: fullQuery, maxResults });
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
            const isOutbound = impersonateEmail ? msgFrom.includes(impersonateEmail) : false;

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
