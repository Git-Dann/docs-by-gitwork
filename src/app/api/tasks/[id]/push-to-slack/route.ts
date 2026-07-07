/**
 * POST /api/tasks/[id]/push-to-slack
 *
 * Pushes a single task to its client's internal Slack channel as a Block Kit
 * standup card. Useful for testing the Slack integration without waiting for
 * the AM standup, or for one-off "look at this" pings.
 *
 * Goes through the same buildStandupCard helper + SlackMessageRef persistence
 * as the daily standup poster, so the overflow menu (Show notes / Add comment /
 * Mark done / Open in Foundry) on the resulting card "just works".
 */

import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { getSlackBotToken, postMessage } from "@/server/slack/client";
import { buildStandupCard, type StandupTaskCardInput } from "@/server/slack/blocks";
import { assertTaskSlackPushCooldown } from "@/server/slack-cooldown";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: taskId } = await params;
    const user = await requireAuthedUser(_request);
    await ensureBaseRecords();

    const task = await prisma.task.findFirst({
      where: { id: taskId, workspaceId: user.workspaceId },
      include: {
        client: {
          select: {
            id: true,
            name: true,
            slug: true,
            slackChannelId: true,
            slackInternalChannelId: true,
          },
        },
        featureBlock: { select: { name: true } },
      },
      // Need `status` for the card's leading emoji; Prisma returns scalar fields
      // by default but listing it here is harmless and self-documenting.
    });
    if (!task) return apiError("Task not found.", 404);

    const channel = task.client.slackInternalChannelId ?? task.client.slackChannelId;
    if (!channel) {
      return apiError(
        `${task.client.name} has no Slack channel linked. Set one in Edit client → Slack channels.`,
        422,
      );
    }

    const ws = await prisma.workspace.findUnique({
      where: { id: user.workspaceId },
      select: { slackBotToken: true, slackBotTokenEncrypted: true },
    });
    const botToken = getSlackBotToken(ws);
    if (!botToken) {
      return apiError("Slack isn't connected. Set it up in Settings → Integrations.", 422);
    }
    await assertTaskSlackPushCooldown(user, task.id);

    // Pre-mint the SlackMessageRef so the card's overflow buttons carry an id
    // we can authoritatively resolve back on interaction. The messageTs is a
    // placeholder until chat.postMessage returns the real ts.
    const placeholder = await prisma.slackMessageRef.create({
      data: {
        workspaceId: user.workspaceId,
        channelId: channel,
        messageTs: `pending:${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        taskId: task.id,
        kind: "TEST_PUSH",
        postedById: user.id,
      },
      select: { id: true },
    });

    const cardTask: StandupTaskCardInput = {
      taskId: task.id,
      messageRefId: placeholder.id,
      title: task.title,
      clientName: task.client.name,
      clientSlug: task.client.slug,
      blockName: task.featureBlock?.name ?? null,
      dueDate: task.dueDate ? task.dueDate.toISOString().slice(0, 10) : null,
      status: task.status,
      description: task.description,
    };

    const card = buildStandupCard({
      phase: "AM",
      who: user.name?.trim() || user.email || "Foundry user",
      workdayLabel: new Date().toISOString().slice(0, 10),
      tasks: [cardTask],
    });

    const result = await postMessage(botToken, {
      channel,
      text: card.text,
      blocks: card.blocks,
    });

    if (!result.ok || !result.data.ts) {
      // Drop the placeholder so we don't leak unresolved refs.
      await prisma.slackMessageRef.delete({ where: { id: placeholder.id } }).catch(() => undefined);
      return apiError(`Slack rejected the post: ${result.error ?? "unknown error"}`, 502);
    }

    await prisma.slackMessageRef.update({
      where: { id: placeholder.id },
      data: { messageTs: result.data.ts },
    });
    await prisma.workspace.update({
      where: { id: user.workspaceId },
      data: { lastSlackPostAt: new Date() },
    }).catch(() => undefined);

    return apiOk({
      posted: true,
      channelId: channel,
      messageTs: result.data.ts,
    });
  } catch (e) {
    return fromError(e);
  }
}
