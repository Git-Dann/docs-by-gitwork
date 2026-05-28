const DISCORD_API = "https://discord.com/api/v10";

export interface DiscordMessage {
  id: string;
  content: string;
  author: { id: string; username: string; global_name: string | null; bot?: boolean };
  timestamp: string;
}

export interface DiscordChannel {
  id: string;
  name: string;
  type: number;
}

function authHeaders(botToken: string) {
  return { Authorization: `Bot ${botToken}`, "Content-Type": "application/json" };
}

export async function fetchNewMessages(
  channelId: string,
  botToken: string,
  afterSnowflake?: string | null,
): Promise<DiscordMessage[]> {
  const url = new URL(`${DISCORD_API}/channels/${channelId}/messages`);
  url.searchParams.set("limit", "100");
  if (afterSnowflake) url.searchParams.set("after", afterSnowflake);

  const res = await fetch(url.toString(), { headers: authHeaders(botToken) });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Discord channels/${channelId}/messages → ${res.status}: ${err}`);
  }
  const messages = (await res.json()) as DiscordMessage[];
  return messages.reverse(); // Discord returns newest-first; we want oldest-first
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

  const channels = ((await chanRes.json()) as DiscordChannel[])
    .filter((c) => c.type === 0)
    .sort((a, b) => a.name.localeCompare(b.name));

  const guild = (await guildRes.json()) as { name: string };
  return { channels, guildName: guild.name };
}
