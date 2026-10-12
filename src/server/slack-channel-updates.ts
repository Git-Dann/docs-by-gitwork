/**
 * Reading a Slack channel's recent messages — ONE implementation, two audiences.
 *
 * Extracted from `/api/clients/[slug]/slack-activity` so the client-facing wiki
 * route reads a channel exactly the way the internal one does. Two copies of a
 * Slack reader is the duplicated-rule disease this codebase keeps paying for
 * (CLAUDE.md §31, §43.4): one of them drifts, and the one that drifts is the one
 * nobody is looking at.
 *
 * ⚠️ This module does NOT decide WHICH channel. That is the caller's job, and it
 * is the whole safety boundary:
 *
 *   internal (`slackInternalChannelId ?? slackChannelId`) — Gitwork talking among
 *     itself about a client. Team audience only.
 *   shared   (`slackExternalChannelId`) — the Slack Connect channel the client is
 *     already a member of. Safe to show them: they can read it in their own Slack.
 *
 * Pass a channel the audience is not entitled to and this will happily read it.
 */

const SLACK_API = "https://slack.com/api";

export interface SlackChannelMessage {
  id: string;
  author: string;
  text: string;
  /** ISO8601. */
  ts: string;
}

export type SlackReadFailure = "no_token" | "no_channel" | "not_in_channel" | "slack_error";

export type SlackChannelRead =
  | { ok: true; channelName: string | null; messages: SlackChannelMessage[]; participants: string[] }
  | { ok: false; reason: SlackReadFailure };

/**
 * Recent messages in one channel, oldest → newest, with @mentions and author ids
 * resolved to display names.
 *
 * Never throws: a Slack outage returns `{ ok: false }` with a reason the caller
 * can render, because "we could not read the channel" and "the channel is quiet"
 * are different facts (§35) and a thrown error would collapse them into a 500.
 */
export async function readSlackChannel(opts: {
  botToken: string | null | undefined;
  channelId: string | null | undefined;
  /** Shown when Slack will not tell us the channel's name. */
  fallbackName?: string | null;
  limit?: number;
}): Promise<SlackChannelRead> {
  const token = (opts.botToken ?? "").trim();
  const channelId = (opts.channelId ?? "").trim();
  if (!token) return { ok: false, reason: "no_token" };
  if (!channelId) return { ok: false, reason: "no_channel" };

  const auth = { Authorization: `Bearer ${token}` };
  const limit = opts.limit ?? 40;

  let history: {
    ok: boolean;
    error?: string;
    messages?: Array<{ type: string; subtype?: string; text?: string; ts: string; user?: string; bot_id?: string }>;
  };
  try {
    const res = await fetch(
      `${SLACK_API}/conversations.history?channel=${encodeURIComponent(channelId)}&limit=${limit}`,
      { headers: auth, next: { revalidate: 120 } },
    );
    history = await res.json();
  } catch {
    return { ok: false, reason: "slack_error" };
  }

  if (!history.ok) {
    return {
      ok: false,
      reason: history.error === "not_in_channel" ? "not_in_channel" : "slack_error",
    };
  }

  const raw = (history.messages ?? []).filter(
    (m) => m.type === "message" && !m.subtype && (m.text ?? "").trim().length > 0,
  );

  const mentionIds = new Set<string>();
  for (const m of raw) {
    for (const match of (m.text ?? "").matchAll(/<@([A-Z0-9]+)/g)) mentionIds.add(match[1]);
  }
  const userIds = [...new Set([...(raw.map((m) => m.user).filter(Boolean) as string[]), ...mentionIds])];
  const nameById = new Map<string, string>();
  await Promise.all(
    userIds.map(async (uid) => {
      try {
        const res = await fetch(`${SLACK_API}/users.info?user=${uid}`, {
          headers: auth,
          next: { revalidate: 3600 },
        });
        const data = (await res.json()) as {
          ok: boolean;
          user?: { name?: string; real_name?: string; profile?: { display_name?: string; real_name?: string } };
        };
        if (data.ok && data.user) {
          const name =
            data.user.profile?.display_name?.trim() ||
            data.user.profile?.real_name?.trim() ||
            data.user.real_name?.trim() ||
            data.user.name?.trim();
          if (name) nameById.set(uid, name);
        }
      } catch {
        /* leave unresolved — the caller labels it rather than dropping it */
      }
    }),
  );

  let channelName: string | null = opts.fallbackName ?? null;
  try {
    const res = await fetch(`${SLACK_API}/conversations.info?channel=${encodeURIComponent(channelId)}`, {
      headers: auth,
      next: { revalidate: 3600 },
    });
    const info = (await res.json()) as { ok: boolean; channel?: { name?: string } };
    if (info.ok && info.channel?.name) channelName = `#${info.channel.name}`;
  } catch {
    /* keep the fallback */
  }

  const messages: SlackChannelMessage[] = raw
    .map((m) => ({
      id: m.ts,
      author: (m.user && nameById.get(m.user)) || (m.bot_id ? "Bot" : "Teammate"),
      text: formatSlackText(m.text ?? "", nameById),
      ts: new Date(Math.floor(Number(m.ts) * 1000)).toISOString(),
    }))
    .reverse();

  const participants = [
    ...new Set(messages.map((m) => m.author).filter((a) => a !== "Bot" && a !== "Teammate")),
  ];

  return { ok: true, channelName, messages, participants };
}

/// Turns Slack's mrkdwn tokens into readable text:
/// <@U123> → @Name, <#C123|name> → #name, <url|label> → label, and unescapes
/// &amp;/&lt;/&gt;. Used for the message bodies the app displays.
export function formatSlackText(text: string, names: Map<string, string>): string {
  let t = text;
  // User mentions: <@U123> or <@U123|fallback>
  t = t.replace(/<@([A-Z0-9]+)(?:\|([^>]+))?>/g, (_m, id: string, fb: string) =>
    "@" + (names.get(id) || fb || "someone"));
  // Channels: <#C123|name> or <#C123>
  t = t.replace(/<#[A-Z0-9]+(?:\|([^>]+))?>/g, (_m, name: string) => "#" + (name || "channel"));
  // Subteam / group mentions: <!subteam^S123|@group>
  t = t.replace(/<!subteam\^[A-Z0-9]+(?:\|([^>]+))?>/g, (_m, label: string) => label || "@group");
  // Special mentions: <!here> <!channel> <!everyone>
  t = t.replace(/<!(here|channel|everyone)>/g, (_m, k: string) => "@" + k);
  // Links: <https://x|label> or <https://x>
  t = t.replace(/<((?:https?|mailto):[^>|]+)(?:\|([^>]+))?>/g, (_m, url: string, label: string) => label || url);
  // Unescape Slack HTML entities.
  t = t.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  return t;
}

