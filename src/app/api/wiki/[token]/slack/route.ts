/**
 * The client's own view of their Slack Connect channel, via the wiki share token.
 *
 * ⚠️ It reads `slackExternalChannelId` and NOTHING ELSE. That is the Slack Connect
 * channel the client's own workspace is a member of, so everything returned here
 * is already readable by them in their own Slack — the wiki is showing it in
 * context, not disclosing it.
 *
 * There is deliberately **no scope/channel parameter**. The internal channel
 * (`slackInternalChannelId`) carries Gitwork talking among itself about this
 * client; a parameter is a thing a caller can set, and the only safe number of
 * ways to ask this endpoint for the internal channel is zero.
 *
 * Token-only, matching the Launchpad GET: a link recipient may read what they
 * can already read. It writes nothing, so there is no cookie requirement.
 */

import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { getSlackBotToken } from "@/server/slack/client";
import { readSlackChannel } from "@/server/slack-channel-updates";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    if (!token) return apiError("Not found", 404);

    // Resolve the token to its client WITHOUT building the whole wiki DTO — this
    // endpoint needs two columns, and buildDTO runs every section loader.
    const wiki = await prisma.clientWiki.findFirst({
      where: {
        OR: [
          { shareToken: token, shareEnabled: true },
          { pageShareTokens: { has: token } },
        ],
      },
      select: {
        client: {
          select: {
            name: true,
            workspaceId: true,
            slackExternalChannelId: true,
            slackExternalChannelName: true,
          },
        },
      },
    });
    if (!wiki) return apiError("Not found", 404);

    const channelId = wiki.client?.slackExternalChannelId ?? null;
    if (!channelId) {
      // Not an error the client can act on, and not a bad link either — the card
      // simply does not render. Saying "no shared channel" is honest and dull.
      return apiOk({
        configured: false,
        channelName: null,
        summary: null,
        generatedAt: null,
        reason: "no_channel",
        messages: [],
      });
    }

    const ws = await prisma.workspace.findUnique({
      where: { id: wiki.client.workspaceId },
      select: { slackBotToken: true, slackBotTokenEncrypted: true },
    });

    const read = await readSlackChannel({
      botToken: ws ? getSlackBotToken(ws) : null,
      channelId,
      fallbackName: wiki.client?.slackExternalChannelName ?? wiki.client?.name ?? null,
    });

    if (!read.ok) {
      return apiOk({
        configured: false,
        channelName: null,
        summary: null,
        generatedAt: null,
        reason: read.reason,
        messages: [],
      });
    }

    return apiOk({
      configured: true,
      channelName: read.channelName,
      // No AI digest on the client path: the summary prompt is written for an
      // internal reader, and the ask was "the updates from each dev", which the
      // messages themselves answer for free.
      summary: null,
      generatedAt: null,
      reason: read.messages.length === 0 ? "empty" : "ok",
      messages: read.messages,
    });
  } catch (err) {
    return fromError(err);
  }
}
