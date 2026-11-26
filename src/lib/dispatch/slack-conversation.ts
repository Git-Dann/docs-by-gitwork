/**
 * Which Dispatch conversation a Slack message belongs to (Dan, 25 Nov 2026: "I need to be able
 * to converse with Foundry, and not be locked to stale replies"). Pure, so every case is tested.
 *
 * - A direct message to Foundry is one running chat, threaded or not: a message carries on the
 *   person's latest DM chat (if it was active in the last few hours), so "and next week?"
 *   follows on from the question before. Naming another of their clients carries on in the
 *   same chat, now about that client (§164: "Can the Slack conversation not talk to me
 *   directly?"). A long chat carries on in a fresh one, silently.
 * - In a channel, a thread is the chat, and naming another client starts a new one (its answer
 *   goes by DM: a channel only ever hears about its own client).
 * - In a client's own channel, that client.
 * - With no client to go on, the chat starts on the person's usual client (the one they last
 *   asked about) and Dispatch can list or move between their clients itself. In a channel that
 *   isn't a client's, or for someone with no clients, Dispatch still chats, just with nothing to
 *   look up (§167).
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
  /** The message is about a teammate or "everything" rather than one client. */
  aboutPersonOrAll: boolean;
  /** The client whose own internal channel this is (channels only). */
  channelClientId: string | null;
  /** The person's only client, when they have exactly one. */
  onlyClientId: string | null;
  /** Where a DM starts with nothing else to go on: the client they last asked about, or their
   *  first. Null when they have no clients. */
  fallbackClientId?: string | null;
  /** Messages a chat may hold before a new one starts (MAX_CHAT_MESSAGES, less room for a turn). */
  maxMessages: number;
  now: Date;
}

export type SlackChatDecision =
  | { action: "continue"; conversationId: string; clientId: string }
  | { action: "new"; clientId: string }
  /** No client to go on: Dispatch chats without looking anything up (small-talk.ts, §167). */
  | { action: "no_client" };

export function decideSlackChat(c: SlackChatContext): SlackChatDecision {
  const carryOn = (chat: { id: string; clientId: string }, messages: number) => {
    const clientId = c.namedClientId ?? chat.clientId;
    if (messages >= c.maxMessages) return { action: "new", clientId } as const;
    // In a DM the chat follows the person to another of their clients; a channel thread stays
    // on its client.
    if (clientId !== chat.clientId && !c.isDm) return { action: "new", clientId } as const;
    return { action: "continue", conversationId: chat.id, clientId } as const;
  };

  if (!c.isDm && c.inThread && c.threadChat) return carryOn(c.threadChat, 0);

  if (c.isDm && c.recentDmChat && c.now.getTime() - c.recentDmChat.updatedAt.getTime() < DM_CHAT_IDLE_MS) {
    return carryOn(c.recentDmChat, c.recentDmChat.messages);
  }

  const clientId = c.namedClientId ?? c.channelClientId;
  if (clientId) return { action: "new", clientId };
  if (c.onlyClientId) return { action: "new", clientId: c.onlyClientId };
  // No client named: start on their usual client and let Dispatch look across them (my_clients,
  // person_work, all_clients_overview). A DM talks; in a channel that isn't a client's own, the
  // answer goes to the person by DM (slack.ts), so it's only a question about a teammate or
  // everything that gets that far; anything else there is asked which client (§166).
  if (c.fallbackClientId && (c.isDm || c.aboutPersonOrAll)) return { action: "new", clientId: c.fallbackClientId };
  return { action: "no_client" };
}
