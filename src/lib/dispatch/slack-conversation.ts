/**
 * Which Dispatch conversation a Slack message belongs to (Dan, 25 Nov 2026: "I need to be able
 * to converse with Foundry, and not be locked to stale replies"). Pure, so every case is tested.
 *
 * - A direct message to Foundry is one running chat, threaded or not: a message carries on the
 *   person's latest DM chat (if it was active in the last few hours), so "and next week?"
 *   follows on from the question before. It moves to a new chat when they name a different
 *   client, or when the chat has grown long (silently: no "start a new chat" wall).
 * - In a channel, a thread is the chat.
 * - In a client's own channel, that client.
 * - With no client to go on, the person is asked which client, by name, rather than refused.
 */

/** How long a DM chat stays "the one we're in" without a message. */
export const DM_CHAT_IDLE_MS = 3 * 60 * 60 * 1000;

export interface SlackChatContext {
  isDm: boolean;
  /** The message was posted inside a thread (Slack's thread_ts was set). */
  inThread: boolean;
  /** The chat this channel thread already is (channel threads only). */
  threadChat: { id: string; clientId: string } | null;
  /** The person's latest DM chat with Foundry, and when it was last used. */
  recentDmChat: { id: string; clientId: string; updatedAt: Date; messages: number } | null;
  /** The client named in this message, among the person's own clients. */
  namedClientId: string | null;
  /** The message is about a person or "everything" (no client): the status answer handles it. */
  aboutPersonOrAll: boolean;
  /** The client whose own internal channel this is (channels only). */
  channelClientId: string | null;
  /** The person's only client, when they have exactly one. */
  onlyClientId: string | null;
  /** Messages a chat may hold before a new one starts (MAX_CHAT_MESSAGES, less room for a turn). */
  maxMessages: number;
  now: Date;
}

export type SlackChatDecision =
  | { action: "continue"; conversationId: string; clientId: string }
  | { action: "new"; clientId: string }
  | { action: "legacy" }
  | { action: "ask_which" };

export function decideSlackChat(c: SlackChatContext): SlackChatDecision {
  const carryOn = (chat: { id: string; clientId: string }, messages: number) => {
    if (c.namedClientId && c.namedClientId !== chat.clientId) return { action: "new", clientId: c.namedClientId } as const;
    if (messages >= c.maxMessages) return { action: "new", clientId: chat.clientId } as const;
    return { action: "continue", conversationId: chat.id, clientId: chat.clientId } as const;
  };

  if (!c.isDm && c.inThread && c.threadChat) return carryOn(c.threadChat, 0);

  if (c.isDm && c.recentDmChat && c.now.getTime() - c.recentDmChat.updatedAt.getTime() < DM_CHAT_IDLE_MS) {
    return carryOn(c.recentDmChat, c.recentDmChat.messages);
  }

  const clientId = c.namedClientId ?? c.channelClientId;
  if (clientId) return { action: "new", clientId };
  if (c.aboutPersonOrAll) return { action: "legacy" };
  if (c.onlyClientId) return { action: "new", clientId: c.onlyClientId };
  return { action: "ask_which" };
}

const GREETING = /^\s*(hi|hiya|hey|hello|yo|morning|good (morning|afternoon|evening)|afternoon|evening|how are you|how's it going|alright)\b/i;

/**
 * The reply when there's no client to go on: friendly, names their clients, and says Foundry
 * will keep the client in mind. Not a refusal.
 */
export function askWhichClientText(input: { firstName: string | null; question: string; clients: readonly string[] }): string {
  const hello = GREETING.test(input.question) ? `Hi${input.firstName ? ` ${input.firstName}` : ""}, all good here. ` : "";
  if (!input.clients.length) {
    return `${hello}You're not on any clients in Foundry yet, so there's nothing I can look up for you. Once you're added to a client, ask me about it here.`;
  }
  const shown = input.clients.slice(0, 12);
  const more = input.clients.length > shown.length ? `, and ${input.clients.length - shown.length} more` : "";
  return `${hello}Which client is this about? You're on ${shown.join(", ")}${more}. Name one, for example "what's happening on ${shown[0]} this week?", and I'll keep it in mind for the rest of our chat until you mention another.`;
}
