/**
 * Telling people about a reply on a client's request, beyond the Slack post in
 * wiki-intake-mentions.ts:
 *
 *   • a Gitwork person @mentioned in a reply gets an in-app + push notification
 *     (`wiki.request_mention`), linking to the request in the internal wiki;
 *   • when Gitwork replies, the person who raised the request gets an email, if we
 *     can establish who they are (see pickRaiserEmail).
 *
 * Both are fire-and-forget from the comment routes: they never throw, and a failure is
 * logged rather than surfaced as a failed reply. The rules themselves are pure and live
 * in src/lib/wiki-intake-reply-notify.ts.
 */
import { prisma } from "@/lib/prisma";
import { dispatchNotification } from "@/server/notifications";
import { sendWorkspaceEmail } from "@/server/email";
import type { StoredMention } from "@/lib/wiki-mentions";
import {
  buildTeamReplyEmail,
  pickRaiserEmail,
  teamMentionRecipients,
} from "@/lib/wiki-intake-reply-notify";

function appBase(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "https://foundry.gitwork.co.uk").replace(/\/+$/, "");
}

/** The longest reply excerpt in a notification body. */
const NOTIFICATION_EXCERPT = 280;

export async function notifyTeamMentionsOnRequest(input: {
  wikiId: string;
  itemId: string;
  /** The Foundry user who wrote the reply, when it was a Gitwork user — never notified. */
  authorUserId: string | null;
  authorName: string;
  body: string;
  mentions: readonly StoredMention[];
}): Promise<{ notified: number }> {
  try {
    const userIds = teamMentionRecipients(input.mentions, input.authorUserId);
    if (userIds.length === 0) return { notified: 0 };
    const wiki = await prisma.clientWiki.findUnique({
      where: { id: input.wikiId },
      select: {
        client: { select: { id: true, slug: true, name: true, workspaceId: true } },
        intakeItems: { where: { id: input.itemId }, select: { title: true } },
      },
    });
    if (!wiki) return { notified: 0 };
    const title = wiki.intakeItems[0]?.title ?? "a request";
    const excerpt =
      input.body.length > NOTIFICATION_EXCERPT ? `${input.body.slice(0, NOTIFICATION_EXCERPT)}…` : input.body;
    dispatchNotification({
      event: "wiki.request_mention",
      workspaceId: wiki.client.workspaceId,
      actorId: input.authorUserId,
      title: `${input.authorName} mentioned you on ${wiki.client.name}: ${title}`,
      body: excerpt,
      actionUrl: `/app/portal/${wiki.client.slug}/wiki#intake`,
      // Not clientId: these are explicit `users` recipients, named by the author, so they
      // are told whether or not they are assigned to the client.
      metadata: { wikiId: input.wikiId, intakeItemId: input.itemId },
      target: { kind: "users", userIds },
      groupKey: `wiki.request_mention:${input.itemId}`,
      count: 1,
    });
    return { notified: userIds.length };
  } catch (err) {
    console.error("[wiki-intake-reply-notify] mention notification failed", err);
    return { notified: 0 };
  }
}

/**
 * Email the person who raised a request that Gitwork has replied. Only for TEAM replies
 * — the caller decides that — and only to an address we can tie to this wiki's own
 * users. A client replying to their own request emails nobody.
 */
export async function emailRaiserOnTeamReply(input: {
  wikiId: string;
  itemId: string;
  authorName: string;
  body: string;
}): Promise<{ sent: boolean; reason?: string }> {
  try {
    const wiki = await prisma.clientWiki.findUnique({
      where: { id: input.wikiId },
      select: {
        shareEnabled: true,
        shareToken: true,
        client: { select: { slug: true, name: true, workspaceId: true } },
        wikiUsers: { select: { email: true, name: true } },
        intakeItems: { where: { id: input.itemId }, select: { title: true, requestedBy: true } },
      },
    });
    const item = wiki?.intakeItems[0];
    if (!wiki || !item) return { sent: false, reason: "not found" };
    const to = pickRaiserEmail(item.requestedBy, wiki.wikiUsers);
    if (!to) return { sent: false, reason: "no identifiable raiser" };

    // The client's own page — never an /app URL they would bounce off.
    const link =
      wiki.shareEnabled && wiki.shareToken
        ? `${appBase()}/wiki/${wiki.client.slug}/${wiki.shareToken}#intake`
        : null;
    const email = buildTeamReplyEmail({
      clientName: wiki.client.name,
      itemTitle: item.title,
      authorName: input.authorName,
      body: input.body,
      link,
    });
    const res = await sendWorkspaceEmail({ workspaceId: wiki.client.workspaceId, to, ...email });
    if (!res.ok) {
      console.warn(`[wiki-intake-reply-notify] reply email not sent: ${res.error}`);
      return { sent: false, reason: res.error };
    }
    return { sent: true };
  } catch (err) {
    console.error("[wiki-intake-reply-notify] reply email failed", err);
    return { sent: false, reason: "error" };
  }
}
