/**
 * @mentions on a client's requests — who can be mentioned, and telling them.
 *
 * A mention in a reply posts to the client's **Slack Connect** channel
 * (`WorkspaceClient.slackExternalChannelId`) — the one channel both sides are in,
 * so a dev can @ the client and the client can @ the dev. A person we can find in
 * Slack by email is a real `<@U…>` ping; anyone we can't is named in bold, so the
 * message still reads correctly. No channel or no bot token → nothing is posted,
 * the reply is still saved. Never throws into the caller.
 */
import { prisma } from "@/lib/prisma";
import { ACTIVE_MEMBER } from "@/server/auth/member-status";
import { getSlackBotToken, postMessage } from "@/server/slack/client";
import {
  MAX_MENTIONS_PER_COMMENT,
  mentionSlackText,
  type MentionPerson,
  type StoredMention,
} from "@/lib/wiki-mentions";

const SLACK_API = "https://slack.com/api";
const ADMIN_ROLES = ["SUPER_ADMIN", "ADMIN"];

/** A mentionable person plus the email we resolve them in Slack with. The email
 *  never leaves the server — `publicMentionables` strips it. */
interface DirectoryEntry extends MentionPerson {
  email: string | null;
}

/**
 * "internal" = a Gitwork user in the app: the whole active team, because a dev may
 * need to pull in someone not yet on the client.
 *
 * "public" = the client's view of their wiki. They see only the Gitwork people
 * actually involved — admins, developers assigned to this client, and anyone who
 * has already replied on its requests — never the whole staff list.
 */
export type MentionAudience = "internal" | "public";

async function directory(wikiId: string, audience: MentionAudience): Promise<DirectoryEntry[]> {
  const wiki = await prisma.clientWiki.findUnique({
    where: { id: wikiId },
    select: {
      clientId: true,
      client: { select: { workspaceId: true, primaryContactName: true, primaryContactEmail: true } },
      wikiUsers: { select: { id: true, name: true, email: true } },
    },
  });
  if (!wiki) return [];
  const workspaceId = wiki.client.workspaceId;

  let teamFilter = {};
  if (audience === "public") {
    const [assigned, commenters] = await Promise.all([
      prisma.clientAssignment.findMany({ where: { clientId: wiki.clientId }, select: { userId: true } }),
      prisma.clientWikiIntakeComment.findMany({
        where: { intakeItem: { wikiId }, authorUserId: { not: null } },
        select: { authorUserId: true },
        distinct: ["authorUserId"],
      }),
    ]);
    const ids = [
      ...assigned.map((a) => a.userId),
      ...commenters.map((c) => c.authorUserId).filter((x): x is string => Boolean(x)),
    ];
    teamFilter = { OR: [{ role: { in: ADMIN_ROLES } }, { userId: { in: ids.length ? ids : ["__none__"] } }] };
  }

  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId, ...ACTIVE_MEMBER, ...teamFilter },
    select: { user: { select: { id: true, name: true, email: true } } },
  });

  const out: DirectoryEntry[] = [];
  const seenEmails = new Set<string>();
  for (const m of members) {
    const name = m.user.name?.trim() || m.user.email;
    if (!name) continue;
    out.push({ id: `team:${m.user.id}`, name, kind: "TEAM", email: m.user.email ?? null });
    if (m.user.email) seenEmails.add(m.user.email.toLowerCase());
  }
  for (const u of wiki.wikiUsers) {
    const email = u.email?.trim().toLowerCase() ?? "";
    if (email && seenEmails.has(email)) continue;
    out.push({ id: `client:${u.id}`, name: u.name?.trim() || u.email, kind: "CLIENT", email: u.email });
    if (email) seenEmails.add(email);
  }
  // The client's day-to-day contact, when they have no wiki login of their own.
  const contactEmail = wiki.client.primaryContactEmail?.trim().toLowerCase() ?? "";
  const contactName = wiki.client.primaryContactName?.trim() ?? "";
  if (contactName && !(contactEmail && seenEmails.has(contactEmail))) {
    out.push({ id: "contact:primary", name: contactName, kind: "CLIENT", email: contactEmail || null });
  }
  out.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "CLIENT" ? -1 : 1));
  return out;
}

/** The mention picker's list. Never includes an email. */
export async function listMentionables(wikiId: string, audience: MentionAudience): Promise<MentionPerson[]> {
  return (await directory(wikiId, audience)).map(({ id, name, kind }) => ({ id, name, kind }));
}

/**
 * Turn the ids a caller sent into mentions we trust. Anything not in this wiki's
 * directory for this audience is dropped silently — a client cannot page an
 * arbitrary staff member by guessing an id, and a stale id from an old tab is
 * simply ignored.
 */
export async function resolveMentions(
  wikiId: string,
  audience: MentionAudience,
  ids: readonly string[],
): Promise<(StoredMention & { email: string | null })[]> {
  if (ids.length === 0) return [];
  const byId = new Map((await directory(wikiId, audience)).map((d) => [d.id, d]));
  const out: (StoredMention & { email: string | null })[] = [];
  for (const id of new Set(ids)) {
    const d = byId.get(id);
    if (d) out.push({ id: d.id, name: d.name, kind: d.kind, email: d.email });
    if (out.length >= MAX_MENTIONS_PER_COMMENT) break;
  }
  return out;
}

/**
 * Whether a mention here will actually reach Slack, so the composer can say so
 * rather than leave people guessing. Needs both a bot token and the client's
 * shared (Slack Connect) channel. The name is the client's own channel, so it is
 * safe to show on their side too.
 */
export async function mentionSlackStatus(
  wikiId: string,
): Promise<{ connected: boolean; channelName: string | null }> {
  const wiki = await prisma.clientWiki.findUnique({
    where: { id: wikiId },
    select: {
      client: {
        select: {
          slackExternalChannelId: true,
          slackExternalChannelName: true,
          workspace: { select: { slackBotToken: true, slackBotTokenEncrypted: true } },
        },
      },
    },
  });
  const connected = Boolean(wiki?.client.slackExternalChannelId?.trim() && getSlackBotToken(wiki?.client.workspace));
  return { connected, channelName: connected ? (wiki?.client.slackExternalChannelName?.trim() || null) : null };
}

async function slackUserIdForEmail(token: string, email: string | null): Promise<string | null> {
  if (!email) return null;
  try {
    const res = await fetch(`${SLACK_API}/users.lookupByEmail?email=${encodeURIComponent(email)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = (await res.json()) as { ok?: boolean; user?: { id?: string } };
    return data.ok && data.user?.id ? data.user.id : null;
  } catch {
    return null;
  }
}

function appBase(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "https://foundry.gitwork.co.uk").replace(/\/+$/, "");
}

/**
 * Post a reply that mentions people to the client's Slack Connect channel.
 * Fire-and-forget from the comment routes: a Slack failure is logged, never
 * surfaced as a failed reply.
 */
export async function notifyIntakeMentions(input: {
  wikiId: string;
  itemId: string;
  author: string;
  body: string;
  mentions: (StoredMention & { email: string | null })[];
}): Promise<{ posted: boolean; reason?: string }> {
  if (input.mentions.length === 0) return { posted: false, reason: "no mentions" };
  try {
    const wiki = await prisma.clientWiki.findUnique({
      where: { id: input.wikiId },
      select: {
        shareEnabled: true,
        shareToken: true,
        client: {
          select: {
            slug: true,
            slackExternalChannelId: true,
            workspace: { select: { slackBotToken: true, slackBotTokenEncrypted: true } },
          },
        },
        intakeItems: { where: { id: input.itemId }, select: { title: true } },
      },
    });
    const channel = wiki?.client.slackExternalChannelId?.trim();
    const token = getSlackBotToken(wiki?.client.workspace);
    if (!wiki || !channel || !token) return { posted: false, reason: "no external channel or bot token" };
    const title = wiki.intakeItems[0]?.title ?? "a request";

    // The channel is shared with the client, so link to the page THEY can open —
    // the shared wiki — never an /app URL they'd bounce off.
    const link =
      wiki.shareEnabled && wiki.shareToken
        ? `${appBase()}/wiki/${wiki.client.slug}/${wiki.shareToken}#intake`
        : null;

    const mentioned = await Promise.all(
      input.mentions.map(async (m) => ({ name: m.name, slackUserId: await slackUserIdForEmail(token, m.email) })),
    );
    const res = await postMessage(token, {
      channel,
      text: mentionSlackText({ author: input.author, mentioned, requestTitle: title, body: input.body, link }),
    });
    if (!res.ok) {
      console.error(`[wiki-mentions] Slack post failed: ${res.error ?? "unknown error"}`);
      return { posted: false, reason: res.error ?? "slack error" };
    }
    return { posted: true };
  } catch (err) {
    console.error("[wiki-mentions] notify failed", err);
    return { posted: false, reason: "error" };
  }
}
