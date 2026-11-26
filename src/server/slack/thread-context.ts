/**
 * The Slack conversation around a question, read for Dispatch (§172): the thread it was asked in,
 * or for a top-level mention in a channel, the channel's last few messages. Names come from
 * users.info; mentions inside messages are turned into names (formatSlackText). Best effort:
 * if Slack won't give it, Dispatch answers without it.
 */

import { asSource } from "@/lib/dispatch/prompt";
import { slackContextLines, type SlackMessage, SLACK_CONTEXT_MESSAGES } from "@/lib/dispatch/slack-thread";
import { formatSlackText } from "@/server/slack-channel-updates";
import { conversationHistory, conversationReplies, usersInfo, type RawSlackMessage } from "./client";

export async function readSlackMessages(
  token: string,
  where: { channel: string; threadTs: string | null; currentTs: string },
): Promise<SlackMessage[]> {
  const res = where.threadTs
    ? await conversationReplies(token, { channel: where.channel, ts: where.threadTs, limit: SLACK_CONTEXT_MESSAGES + 20 })
    : await conversationHistory(token, { channel: where.channel, latest: where.currentTs, limit: 15 });
  if (!res.ok) return [];
  return (res.data.messages ?? [])
    // Joins, topic changes and the like carry a subtype; a bot's own post carries bot_message.
    .filter((m: RawSlackMessage) => !m.subtype || m.subtype === "bot_message" || m.subtype === "thread_broadcast")
    .map((m) => ({ ts: m.ts, user: m.user, botId: m.bot_id, text: m.text ?? "" }));
}

/** The context block for the model, or null when there's nothing worth adding. */
export async function slackContextFor(input: {
  token: string;
  channel: string;
  threadTs: string | null;
  currentTs: string;
  botUserId: string | null;
  /** Only what was said since Foundry last spoke (the chat already holds the rest). */
  sinceFoundry: boolean;
  messages?: SlackMessage[];
}): Promise<string | null> {
  try {
    const messages = input.messages ?? (await readSlackMessages(input.token, { channel: input.channel, threadTs: input.threadTs, currentTs: input.currentTs }));
    if (!messages.length) return null;
    const ids = new Set<string>();
    for (const m of messages) {
      if (m.user) ids.add(m.user);
      for (const hit of m.text.matchAll(/<@([A-Z0-9]+)/g)) ids.add(hit[1]);
    }
    const names = new Map<string, string>();
    await Promise.all(
      [...ids].slice(0, 25).map(async (id) => {
        const info = await usersInfo(input.token, id).catch(() => null);
        const u = info?.ok ? info.data.user : undefined;
        const name = u?.profile?.real_name?.trim() || u?.real_name?.trim() || u?.profile?.display_name?.trim() || u?.name;
        if (name) names.set(id, name);
      }),
    );
    const lines = slackContextLines(
      messages.map((m) => ({ ...m, text: formatSlackText(m.text, names) })),
      { currentTs: input.currentTs, botUserId: input.botUserId, sinceFoundry: input.sinceFoundry, nameOf: (id) => names.get(id) ?? "Someone" },
    );
    if (!lines.length) return null;
    const heading = input.threadTs
      ? input.sinceFoundry
        ? "Said in this Slack thread since you last replied (oldest first):"
        : "Earlier in this Slack thread (oldest first):"
      : "The last messages in this Slack channel before the question (oldest first):";
    return asSource("slack_conversation", input.threadTs ?? input.channel, `${heading}\n${lines.join("\n")}`);
  } catch {
    return null;
  }
}
