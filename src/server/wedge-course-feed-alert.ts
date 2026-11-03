/**
 * Tells the CLIENT, in their own Slack channel, when the Big Wedge course-request feed
 * stops — and again when it starts. Their channel because they are the ones who notice
 * missing requests first (they did, twice), and because the feed reads THEIR API: a
 * changed password or a moved endpoint is often something only they can fix.
 *
 * Posts to the client's Slack Connect channel (`slackExternalChannelId`), never the
 * internal one: this message is written for Big Wedge to read. Admins also get the
 * in-app notification from wedge-course-feed.ts.
 *
 * The rules — when to speak, once per outage — live in feedAlert() (pure, tested). This
 * file only resolves the channel, words the message and records that it was sent.
 */
import { prisma } from "@/lib/prisma";
import { feedAlert, type CourseFeedStatus, type FeedAlert } from "@/lib/wedge-course-feed-status";
import { getSlackBotToken, postMessage } from "@/server/slack/client";

async function externalChannel(workspaceClientId: string): Promise<{ token: string; channel: string } | null> {
  const client = await prisma.workspaceClient.findUnique({
    where: { id: workspaceClientId },
    select: {
      slackExternalChannelId: true,
      workspace: { select: { slackBotToken: true, slackBotTokenEncrypted: true } },
    },
  });
  const channel = client?.slackExternalChannelId?.trim();
  const token = getSlackBotToken(client?.workspace);
  return channel && token ? { token, channel } : null;
}

function ukTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    timeZone: "Europe/London",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function feedAlertText(alert: FeedAlert, status: CourseFeedStatus): string {
  if (alert.kind === "recovered") {
    const n = alert.caughtUp;
    return (
      ":white_check_mark: *Course requests are reaching Foundry again.* " +
      (n > 0
        ? `${n} request${n === 1 ? "" : "s"} submitted while it was down ${n === 1 ? "has" : "have"} been pulled in.`
        : "No requests were submitted while it was down.")
    );
  }
  const since = status.lastSuccessAt
    ? `The last successful pull from the Big Wedge app was ${ukTime(status.lastSuccessAt)}`
    : `Foundry hasn't managed a successful pull from the Big Wedge app since ${ukTime(status.failingSince ?? status.lastRunAt!)}`;
  return (
    ":warning: *Course requests aren't reaching Foundry.* " +
    `${since} — ${alert.reason} ` +
    "Nothing is lost: new requests stay in the Big Wedge app and Foundry will pull them in automatically once this is fixed. Gitwork has been alerted."
  );
}

/**
 * Post if the rules say so, and return the status with the latch updated. The latch only
 * moves when the post SUCCEEDED — a Slack outage must not swallow the one message that
 * says the feed is down; the next run tries again.
 */
export async function applyFeedAlert(
  workspaceClientId: string,
  status: CourseFeedStatus,
  now: Date,
): Promise<CourseFeedStatus> {
  const alert = feedAlert(status, now);
  if (!alert) return status;
  const target = await externalChannel(workspaceClientId);
  if (!target) {
    console.error("[wedge-course-feed] no external Slack channel or bot token — feed alert not posted");
    return status;
  }
  try {
    const res = await postMessage(target.token, { channel: target.channel, text: feedAlertText(alert, status) });
    if (!res.ok) {
      console.error(`[wedge-course-feed] Slack refused the feed alert: ${res.error}`);
      return status;
    }
  } catch (err) {
    console.error("[wedge-course-feed] Slack post threw", err);
    return status;
  }
  return { ...status, alertedDownAt: alert.kind === "down" ? now.toISOString() : null };
}
