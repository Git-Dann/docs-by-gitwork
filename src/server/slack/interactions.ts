/**
 * Slack interactivity dispatcher.
 *
 * The route hands us the parsed payload via `after()`, so we have unlimited time.
 * Handlers:
 *   - task.viewNotes  → open a read-only modal with description / acceptance / comments
 *   - task.addComment → open a modal with a text-area; on submit, persist via createTaskComment
 *   - task.markDone / task.markInReview → updateTask status + re-render the original card
 *   - task.openInFoundry → URL-only, no server work
 *
 * Resolves every action through SlackMessageRef so the channel + ts we received from
 * Slack are authoritative — we never trust a raw taskId from the client.
 */

import { prisma } from "@/lib/prisma";
import { getSlackBotToken, openView, updateMessage } from "./client";
import {
  SLACK_ACTIONS,
  buildAddCommentModal,
  buildNotesModal,
  buildStandupCard,
  decodeActionValue,
  type SlackActionId,
  type StandupTaskCardInput,
} from "./blocks";

export interface SlackInteractionPayload {
  type: "block_actions" | "view_submission" | "view_closed" | string;
  team?: { id?: string; domain?: string };
  user?: { id?: string; name?: string };
  trigger_id?: string;
  view?: {
    id?: string;
    callback_id?: string;
    private_metadata?: string;
    state?: { values?: Record<string, Record<string, { value?: string }>> };
  };
  actions?: Array<{
    action_id?: string;
    value?: string;
    type?: string;
    selected_option?: { value?: string };
  }>;
  container?: Record<string, unknown>;
  channel?: { id?: string };
  message?: { ts?: string; blocks?: unknown[] };
}

/**
 * Parse the form-urlencoded body Slack sends to interactive endpoints. The actual
 * JSON payload arrives inside a `payload=` field.
 */
export function parseInteractionBody(rawBody: string): SlackInteractionPayload | null {
  const params = new URLSearchParams(rawBody);
  const raw = params.get("payload");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SlackInteractionPayload;
  } catch {
    return null;
  }
}

/**
 * Overflow options pack `actionId|messageRefId:taskId` into a single value so one
 * action_id (`task.menu`) handles every option. Split on the first `|`.
 */
function parseOverflowValue(raw: string | undefined | null): {
  action: SlackActionId;
  messageRefId: string;
  taskId: string;
} | null {
  if (!raw) return null;
  const pipe = raw.indexOf("|");
  if (pipe <= 0) return null;
  const action = raw.slice(0, pipe);
  const decoded = decodeActionValue(raw.slice(pipe + 1));
  if (!decoded) return null;
  const known = (Object.values(SLACK_ACTIONS) as string[]).includes(action);
  if (!known) return null;
  return { action: action as SlackActionId, ...decoded };
}

/**
 * Look up the workspace whose Slack team id matches the payload (single-tenant
 * deploys fall back to the first workspace with a token). Returns null if no
 * workspace is connected.
 */
async function resolveWorkspaceForPayload(payload: SlackInteractionPayload) {
  const teamId = payload.team?.id;
  const ws = teamId
    ? await prisma.workspace.findFirst({
        where: { slackTeamId: teamId },
        select: { id: true, slackBotToken: true, slackBotTokenEncrypted: true },
      })
    : await prisma.workspace.findFirst({
        where: { slackBotTokenEncrypted: { not: null } },
        select: { id: true, slackBotToken: true, slackBotTokenEncrypted: true },
      });
  if (!ws) return null;
  const token = getSlackBotToken(ws);
  if (!token) return null;
  return { workspaceId: ws.id, token };
}

/** Re-render the original standup card so a status change is reflected visually. */
async function refreshStandupCard(opts: {
  token: string;
  channelId: string;
  messageTs: string;
  workspaceId: string;
}): Promise<void> {
  // Find every task this card carries (one SlackMessageRef per task per message).
  const refs = await prisma.slackMessageRef.findMany({
    where: {
      workspaceId: opts.workspaceId,
      channelId: opts.channelId,
      messageTs: opts.messageTs,
    },
    include: {
      task: {
        select: {
          id: true,
          title: true,
          status: true,
          dueDate: true,
          featureBlock: { select: { name: true } },
          client: { select: { slug: true } },
        },
      },
    },
  });
  if (refs.length === 0) return;
  const tasks: StandupTaskCardInput[] = refs
    .map((r) => {
      if (!r.task) return null;
      // Annotate done/in-review tasks in the title so the card visibly reflects state.
      let title = r.task.title;
      if (r.task.status === "DONE") title = `~${title}~ ✓`;
      else if (r.task.status === "IN_REVIEW") title = `${title} (in review)`;
      return {
        taskId: r.task.id,
        messageRefId: r.id,
        title,
        blockName: r.task.featureBlock?.name ?? null,
        dueDate: r.task.dueDate ? r.task.dueDate.toISOString().slice(0, 10) : null,
        clientSlug: r.task.client.slug,
      };
    })
    .filter((t): t is StandupTaskCardInput => t !== null);

  const kind = refs[0].kind;
  const phase: "AM" | "PM" = kind === "STANDUP_PM" ? "PM" : "AM";
  // We don't know the original "who" / workdayLabel / weekPlan from the refs alone;
  // fall back to a minimal header. Phase 4 can persist those on the ref row.
  const card = buildStandupCard({
    phase,
    who: "Foundry",
    workdayLabel: refs[0].createdAt.toISOString().slice(0, 10),
    tasks,
  });
  await updateMessage(opts.token, {
    channel: opts.channelId,
    ts: opts.messageTs,
    text: card.text,
    blocks: card.blocks,
  });
}

async function handleBlockAction(
  payload: SlackInteractionPayload,
  action: NonNullable<SlackInteractionPayload["actions"]>[number],
): Promise<void> {
  // The overflow menu packs the action into selected_option.value as
  // "<actionId>|<messageRefId>:<taskId>". A bare button uses action.value.
  const parsed =
    parseOverflowValue(action.selected_option?.value) ?? parseOverflowValue(action.value);
  if (!parsed) {
    console.info("[slack] unparseable action", { action_id: action.action_id });
    return;
  }

  const ws = await resolveWorkspaceForPayload(payload);
  if (!ws) {
    console.info("[slack] no workspace token for interaction");
    return;
  }

  // Verify the message ref is real and belongs to this workspace.
  const ref = await prisma.slackMessageRef.findUnique({
    where: { id: parsed.messageRefId },
    include: {
      task: {
        select: {
          id: true,
          title: true,
          description: true,
          acceptanceCriteria: true,
          client: { select: { slug: true } },
          comments: {
            orderBy: { createdAt: "desc" },
            take: 3,
            include: { author: { select: { name: true, email: true } } },
          },
        },
      },
    },
  });
  if (!ref || ref.workspaceId !== ws.workspaceId || ref.taskId !== parsed.taskId || !ref.task) {
    console.info("[slack] message ref mismatch", { messageRefId: parsed.messageRefId });
    return;
  }

  const channelId = payload.channel?.id ?? ref.channelId;
  const messageTs = payload.message?.ts ?? ref.messageTs;

  switch (parsed.action) {
    case SLACK_ACTIONS.TASK_VIEW_NOTES: {
      if (!payload.trigger_id) return;
      await openView(ws.token, {
        trigger_id: payload.trigger_id,
        view: buildNotesModal({
          taskId: ref.task.id,
          clientSlug: ref.task.client.slug,
          title: ref.task.title,
          description: ref.task.description,
          acceptanceCriteria: ref.task.acceptanceCriteria,
          recentComments: ref.task.comments.map((c) => ({
            author: c.author?.name ?? c.author?.email ?? null,
            body: c.body,
          })),
        }),
      });
      return;
    }

    case SLACK_ACTIONS.TASK_ADD_COMMENT: {
      if (!payload.trigger_id) return;
      await openView(ws.token, {
        trigger_id: payload.trigger_id,
        view: buildAddCommentModal({
          taskId: ref.task.id,
          clientSlug: ref.task.client.slug,
          title: ref.task.title,
        }),
      });
      return;
    }

    case SLACK_ACTIONS.TASK_MARK_DONE:
    case SLACK_ACTIONS.TASK_MARK_IN_REVIEW: {
      const targetStatus =
        parsed.action === SLACK_ACTIONS.TASK_MARK_DONE ? "DONE" : "IN_REVIEW";
      await prisma.task.update({
        where: { id: ref.task.id },
        data: {
          status: targetStatus,
          completedAt: targetStatus === "DONE" ? new Date() : null,
        },
      });
      await refreshStandupCard({
        token: ws.token,
        channelId,
        messageTs,
        workspaceId: ws.workspaceId,
      });
      // Best-effort ack as an ephemeral message would need response_url; skipped
      // for v1 — the card update is the visible signal.
      return;
    }

    case SLACK_ACTIONS.TASK_OPEN_IN_FOUNDRY:
      // URL action — Slack handles the navigation client-side. Server-side no-op.
      return;

    default:
      return;
  }
}

async function handleViewSubmission(payload: SlackInteractionPayload): Promise<void> {
  if (payload.view?.callback_id !== "task.addComment") return;
  const ws = await resolveWorkspaceForPayload(payload);
  if (!ws) return;

  // private_metadata carries { taskId, clientSlug } we stamped when opening the modal.
  let meta: { taskId?: string; clientSlug?: string } = {};
  try {
    meta = JSON.parse(payload.view.private_metadata ?? "{}") as typeof meta;
  } catch {
    return;
  }
  if (!meta.taskId) return;

  const body = payload.view.state?.values?.comment?.body?.value?.trim();
  if (!body) return;

  // Slack → Foundry user mapping is a Phase 4 follow-up — for now comments land
  // anonymously (the schema's authorId is nullable). The Slack user is still
  // identifiable from the comment body's metadata if needed for audit.
  await prisma.taskComment.create({
    data: {
      taskId: meta.taskId,
      authorId: null,
      body: payload.user?.name ? `${body}\n\n_via Slack as @${payload.user.name}_` : body,
    },
  });
}

/**
 * Top-level dispatcher. Returns nothing — interactions are async, fire-and-forget
 * by design (the HTTP route has already responded 200 by the time we run).
 */
export async function handleInteraction(payload: SlackInteractionPayload): Promise<void> {
  try {
    if (payload.type === "block_actions") {
      for (const action of payload.actions ?? []) {
        await handleBlockAction(payload, action);
      }
      return;
    }
    if (payload.type === "view_submission") {
      await handleViewSubmission(payload);
      return;
    }
    if (payload.type === "view_closed") return;
    console.info("[slack] unknown_interaction_type", { type: payload.type });
  } catch (err) {
    // Never surface to Slack — the route already returned 200. Just log.
    console.warn("[slack] interaction handler failed", err);
  }
}
