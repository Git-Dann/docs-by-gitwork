/**
 * What Dispatch reads of the Slack conversation around a question, and when it answers a thread
 * reply that didn't @mention it (§172). Dan, 26 Nov 2026: "make sure the chat has context of
 * everything it needs to". Pure, so both rules are tested.
 *
 * The messages come from the channel the question was asked in, so everyone the answer could
 * reach can already read them. They're given to the model as data (wrapped in <source>), never as
 * instructions.
 */

export interface SlackMessage {
  ts: string;
  /** The author's Slack user id; absent on some bot posts. */
  user?: string;
  /** Set on anything posted by an app. */
  botId?: string;
  text: string;
}

/** How much of the surrounding conversation goes in. */
export const SLACK_CONTEXT_MESSAGES = 30;
const PER_MESSAGE_CHARS = 500;
const TOTAL_CHARS = 6000;

export function isFoundry(m: SlackMessage, botUserId: string | null): boolean {
  return Boolean(m.botId) || (botUserId !== null && m.user === botUserId);
}

/**
 * The lines Dispatch gets, oldest first: "Name: text". The question itself is left out (it's
 * sent as the question). With `sinceFoundry`, only what was said after Foundry last spoke, so a
 * chat that already holds the earlier turns isn't given them twice. Long messages are trimmed and
 * the oldest lines dropped first to stay under the cap.
 */
export function slackContextLines(
  messages: readonly SlackMessage[],
  opts: { currentTs: string; botUserId: string | null; sinceFoundry: boolean; nameOf: (userId: string) => string },
): string[] {
  let list = messages.filter((m) => m.ts !== opts.currentTs && m.text.trim());
  list = [...list].sort((a, b) => Number(a.ts) - Number(b.ts));
  if (opts.sinceFoundry) {
    const last = list.map((m) => isFoundry(m, opts.botUserId)).lastIndexOf(true);
    if (last >= 0) list = list.slice(last + 1);
  }
  list = list.filter((m) => Number(m.ts) < Number(opts.currentTs)).slice(-SLACK_CONTEXT_MESSAGES);
  const lines = list.map((m) => {
    const who = isFoundry(m, opts.botUserId) ? "Foundry (you)" : m.user ? opts.nameOf(m.user) : "Someone";
    const text = m.text.replace(/\s+/g, " ").trim();
    return `${who}: ${text.length > PER_MESSAGE_CHARS ? `${text.slice(0, PER_MESSAGE_CHARS - 1)}…` : text}`;
  });
  while (lines.length && lines.join("\n").length > TOTAL_CHARS) lines.shift();
  return lines;
}

/**
 * A thread reply that didn't @mention Foundry is for Foundry when Foundry has already answered in
 * this thread and the message right before it is Foundry's: the person is replying to it, the way
 * people take turns in a chat. Anything else (people talking to each other, a new top-level
 * message, edits, bots) is left alone. A message that does @mention Foundry also arrives as an
 * `app_mention`, which handles it, so it's skipped here.
 */
export function isReplyToFoundry(input: {
  /** The message: a thread reply in a channel, not an edit, not from a bot. */
  inThread: boolean;
  mentionsFoundry: boolean;
  foundryAnsweredHere: boolean;
  previous: SlackMessage | null;
  botUserId: string | null;
}): boolean {
  if (!input.inThread || input.mentionsFoundry || !input.foundryAnsweredHere || !input.previous) return false;
  return isFoundry(input.previous, input.botUserId);
}
