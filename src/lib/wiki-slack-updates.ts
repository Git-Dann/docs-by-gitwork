/**
 * The wiki overview's Slack panel — grouping a channel's recent messages into
 * "what each dev said", and saying honestly when there is nothing to say.
 *
 * Pure: no fetch, no React, so the rules can be proved without a Slack token.
 * The data comes from the existing `/api/clients/[slug]/slack-activity` route,
 * which is the same source the Portal client page uses — one reader, not two.
 *
 * ## ⚠️ This reads an INTERNAL channel
 *
 * The route prefers `WorkspaceClient.slackInternalChannelId` and only falls back
 * to `slackChannelId`, so what it returns is Gitwork talking among itself about
 * a client — standup pushes, "this is broken", rate and scheduling chatter. It
 * is NOT client-facing correspondence, and the panel that renders it is gated to
 * the team audience for that reason. See `wiki-dashboard.tsx`.
 */

/** One message as the slack-activity route returns it. */
export interface SlackUpdateMessage {
  id: string;
  author: string;
  text: string;
  /** ISO8601. */
  ts: string;
}

export interface DevUpdate {
  author: string;
  /** Their most recent message. */
  latest: SlackUpdateMessage;
  /** How many they posted in the window, including the latest. */
  count: number;
  /** Whole hours since `latest`, or null when the stamp cannot be read. */
  hoursAgo: number | null;
}

/**
 * Authors the Slack route uses when it could not resolve a real display name.
 *
 * ⚠️ These are NOT dropped. "We could not resolve who wrote this" is not "nobody
 * wrote anything" — dropping them would quietly shrink the update count and the
 * panel would under-report activity. They are grouped under their placeholder
 * and the UI labels them as unattributed.
 */
export const UNRESOLVED_AUTHORS = ["Teammate", "Bot"] as const;

export function isUnresolvedAuthor(author: string): boolean {
  return (UNRESOLVED_AUTHORS as readonly string[]).includes(author);
}

const HOUR = 3_600_000;

function hoursSince(iso: string, now: Date): number | null {
  const t = Date.parse(iso);
  // ⚠️ An unparseable stamp is "unknown", never 0 — 0 renders as "just now".
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((now.getTime() - t) / HOUR));
}

/**
 * Latest message per author, most recent first.
 *
 * ⚠️ Grouped by author rather than shown chronologically because the question
 * the overview answers is "what is each dev saying", not "what was said". A raw
 * chronological dump of a busy channel shows one person five times and hides
 * the three who posted yesterday — which is the opposite of the ask.
 */
export function groupUpdatesByDev(
  messages: readonly SlackUpdateMessage[] | undefined,
  now: Date,
): DevUpdate[] {
  if (!Array.isArray(messages)) return [];
  const byAuthor = new Map<string, { latest: SlackUpdateMessage; count: number }>();
  for (const m of messages) {
    const entry = byAuthor.get(m.author);
    if (!entry) {
      byAuthor.set(m.author, { latest: m, count: 1 });
      continue;
    }
    entry.count += 1;
    // Compare by timestamp, NOT by array order: the route reverses to
    // oldest-first and a caller could hand us either direction.
    const a = Date.parse(m.ts);
    const b = Date.parse(entry.latest.ts);
    if (!Number.isNaN(a) && (Number.isNaN(b) || a > b)) entry.latest = m;
  }

  return [...byAuthor.entries()]
    .map(([author, { latest, count }]) => ({
      author,
      latest,
      count,
      hoursAgo: hoursSince(latest.ts, now),
    }))
    .sort((x, y) => {
      // Named devs first — an unattributed line is context, not an update.
      const named = Number(isUnresolvedAuthor(x.author)) - Number(isUnresolvedAuthor(y.author));
      if (named !== 0) return named;
      const tx = Date.parse(x.latest.ts);
      const ty = Date.parse(y.latest.ts);
      // An unreadable stamp sorts last rather than winning by NaN comparison.
      if (Number.isNaN(tx) && Number.isNaN(ty)) return x.author.localeCompare(y.author);
      if (Number.isNaN(tx)) return 1;
      if (Number.isNaN(ty)) return -1;
      return ty - tx;
    });
}

/** "2h ago" / "3d ago" / "Just now" / "Unknown" — short enough for a card row. */
export function formatUpdateAge(hoursAgo: number | null): string {
  if (hoursAgo === null) return "Unknown";
  if (hoursAgo < 1) return "Just now";
  if (hoursAgo < 24) return `${hoursAgo}h ago`;
  return `${Math.floor(hoursAgo / 24)}d ago`;
}

export type SlackPanelState =
  | { kind: "loading" }
  | { kind: "needs-setup"; message: string }
  | { kind: "empty"; message: string }
  | { kind: "ready" };

export interface SlackActivityPayload {
  configured: boolean;
  channelName: string | null;
  summary: string | null;
  generatedAt: string | null;
  reason: string;
  /**
   * ⚠️ Optional in the TYPE even though the route always sends it. A payload
   * that arrives without it — a shape change, a proxy, the demo interceptor's
   * catch-all `{}` — would otherwise crash the card on `.length`, turning a
   * missing field into a blank page instead of a quiet empty state.
   */
  messages?: SlackUpdateMessage[];
}

/**
 * What the panel should say, from the route's own `reason`.
 *
 * ⚠️ Every not-ready state names a CAUSE and, where there is one, the fix. A
 * blank card reads as "this client has no activity", which is a different and
 * wrong fact when the real answer is that nobody invited the bot.
 */
export function describeSlackState(
  data: SlackActivityPayload | undefined,
  isLoading: boolean,
): SlackPanelState {
  if (isLoading && !data) return { kind: "loading" };
  if (!data) return { kind: "needs-setup", message: "Slack updates could not be loaded." };

  if (!data.configured) {
    if (data.reason === "no_token") {
      return { kind: "needs-setup", message: "No Slack bot token is configured for the workspace." };
    }
    if (data.reason === "no_channel") {
      return { kind: "needs-setup", message: "No Slack channel is linked to this client." };
    }
    return { kind: "needs-setup", message: "Slack is not reachable for this client right now." };
  }

  if (data.reason === "not_in_channel") {
    return {
      kind: "needs-setup",
      message: `The Foundry bot has not been invited to ${data.channelName ?? "the channel"}.`,
    };
  }

  if ((data.messages ?? []).length === 0) {
    return {
      kind: "empty",
      message: `No messages in ${data.channelName ?? "the channel"} in the recent window.`,
    };
  }

  return { kind: "ready" };
}
