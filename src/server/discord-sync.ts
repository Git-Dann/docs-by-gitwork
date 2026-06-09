const DISCORD_API = "https://discord.com/api/v10";

function authHeaders(botToken: string) {
  return { Authorization: `Bot ${botToken}`, "Content-Type": "application/json" };
}

/** Fetch wrapper that honours Discord's 429 Retry-After header (up to 4 retries). */
async function discordFetch(url: string, botToken: string, attempt = 0): Promise<Response> {
  const res = await fetch(url, { headers: authHeaders(botToken) });
  if (res.status === 429 && attempt < 4) {
    const body = await res.clone().json().catch(() => ({})) as { retry_after?: number };
    const waitMs = Math.ceil((body.retry_after ?? 5) * 1000) + 300;
    await new Promise((r) => setTimeout(r, waitMs));
    return discordFetch(url, botToken, attempt + 1);
  }
  return res;
}

export interface DiscordMessage {
  id: string;
  content: string;
  author: { id: string; username: string; global_name: string | null; bot?: boolean };
  timestamp: string;
  attachments?: Array<{ filename?: string; content_type?: string; url?: string }>;
  embeds?: Array<{ url?: string; title?: string; description?: string; type?: string }>;
  sticker_items?: Array<{ id: string; name: string }>;
  type?: number;
}

/**
 * Returns a displayable body for a Discord message. Falls back to a placeholder
 * synthesised from attachments / embeds / stickers when `content` is empty (image-only
 * posts, link shares, stickers). Returns "" only when the message carries nothing at
 * all — which, in bulk, signals the bot is missing the Message Content Intent (without
 * it Discord blanks content AND attachments AND embeds).
 */
export function discordMessageBody(msg: DiscordMessage): string {
  if (msg.content && msg.content.trim()) return msg.content;
  const parts: string[] = [];
  for (const a of msg.attachments ?? []) {
    const name = a.filename ?? "file";
    const type = a.content_type ?? "";
    if (type.startsWith("image/")) parts.push(`[image: ${name}]`);
    else if (type.startsWith("video/")) parts.push(`[video: ${name}]`);
    else parts.push(`[attachment: ${name}]`);
  }
  for (const e of msg.embeds ?? []) {
    if (e.url) parts.push(`[link: ${e.url}]`);
    else if (e.title) parts.push(`[embed: ${e.title}]`);
    else parts.push("[embed]");
  }
  if ((msg.sticker_items ?? []).length > 0) parts.push("[sticker]");
  return parts.join(" ");
}

export interface DiscordChannel {
  id: string;
  name: string;
  type: number;
  accessible: boolean; // false = bot cannot read messages (missing View Channel / Read Message History)
}

/**
 * Fetches messages newer than `afterSnowflake`, oldest-first, capped at `maxMessages`.
 * Capping prevents serverless timeouts on channels with large backlogs — the cursor
 * advances per run so subsequent syncs pick up where this one left off.
 */
export async function fetchNewMessages(
  channelId: string,
  botToken: string,
  afterSnowflake?: string | null,
  maxMessages = 500,
): Promise<DiscordMessage[]> {
  const all: DiscordMessage[] = [];
  let cursor = afterSnowflake ?? undefined;

  while (all.length < maxMessages) {
    const url = new URL(`${DISCORD_API}/channels/${channelId}/messages`);
    url.searchParams.set("limit", "100");
    if (cursor) url.searchParams.set("after", cursor);

    const res = await discordFetch(url.toString(), botToken);
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Discord channels/${channelId}/messages → ${res.status}: ${err}`);
    }
    const batch = (await res.json()) as DiscordMessage[];
    // Discord returns newest-first; reverse so we accumulate oldest-first
    const ordered = batch.reverse();
    all.push(...ordered);

    if (batch.length < 100) break; // last page
    // Advance cursor to the newest message in this batch (last after reverse)
    cursor = ordered[ordered.length - 1].id;
  }

  return all;
}

/**
 * Fetches channel history backwards from the newest message, oldest-first, capped at
 * `maxMessages`. Used on first sync / manual resync. Capping prevents timeouts on
 * large channels — each subsequent incremental sync catches up further.
 */
export async function fetchChannelHistory(
  channelId: string,
  botToken: string,
  maxMessages = 500,
): Promise<DiscordMessage[]> {
  const all: DiscordMessage[] = [];
  let before: string | undefined;
  while (all.length < maxMessages) {
    const url = new URL(`${DISCORD_API}/channels/${channelId}/messages`);
    url.searchParams.set("limit", "100");
    if (before) url.searchParams.set("before", before);
    const res = await discordFetch(url.toString(), botToken);
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Discord channels/${channelId}/messages → ${res.status}: ${err}`);
    }
    const batch = (await res.json()) as DiscordMessage[];
    if (batch.length === 0) break;
    // Discord returns newest-first; track the oldest ID in this batch for next page
    all.push(...batch);
    before = batch[batch.length - 1].id;
    if (batch.length < 100) break;
  }
  return all.reverse(); // oldest-first for insertion order
}

export async function sendDiscordMessage(
  channelId: string,
  botToken: string,
  content: string,
): Promise<void> {
  const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
    method: "POST",
    headers: authHeaders(botToken),
    body: JSON.stringify({ content }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Discord send to channel ${channelId} failed ${res.status}: ${err}`);
  }
}

async function probeChannelAccess(channelId: string, botToken: string): Promise<boolean> {
  const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages?limit=1`, {
    headers: authHeaders(botToken),
  });
  if (res.ok) return true;
  const body = await res.text();
  // 50001 = Missing Access, 50013 = Missing Permissions
  if (body.includes("50001") || body.includes("50013") || body.includes("Missing Access")) return false;
  // Any other error (rate limit, server error) — assume accessible so we don't block the setup
  return true;
}

export async function getGuildChannels(
  guildId: string,
  botToken: string,
): Promise<{ channels: DiscordChannel[]; guildName: string }> {
  const [chanRes, guildRes] = await Promise.all([
    fetch(`${DISCORD_API}/guilds/${guildId}/channels`, { headers: authHeaders(botToken) }),
    fetch(`${DISCORD_API}/guilds/${guildId}`, { headers: authHeaders(botToken) }),
  ]);

  if (!chanRes.ok) {
    const err = await chanRes.text();
    throw new Error(`Discord guilds/${guildId}/channels → ${chanRes.status}: ${err}`);
  }
  if (!guildRes.ok) {
    const err = await guildRes.text();
    throw new Error(`Discord guilds/${guildId} → ${guildRes.status}: ${err}`);
  }

  const rawChannels = ((await chanRes.json()) as Omit<DiscordChannel, "accessible">[])
    .filter((c) => c.type === 0)
    .sort((a, b) => a.name.localeCompare(b.name));

  const guild = (await guildRes.json()) as { name: string };

  // Probe read access for each channel in parallel
  const accessResults = await Promise.allSettled(
    rawChannels.map((ch) => probeChannelAccess(ch.id, botToken)),
  );

  const channels: DiscordChannel[] = rawChannels.map((ch, i) => ({
    ...ch,
    accessible: accessResults[i].status === "fulfilled" ? accessResults[i].value : true,
  }));

  return { channels, guildName: guild.name };
}
