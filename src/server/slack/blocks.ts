/**
 * Block Kit payload builders.
 *
 * Pure functions — no DB, no fetch. Phase 2 fills these in; tasks-standup.ts
 * calls buildStandupCard / buildRollupCard, and the interactions dispatcher
 * calls buildNotesModal / buildAddCommentModal in response to button clicks.
 *
 * Slack caps a message at 50 top-level blocks; we cap "Doing" tasks at 8 and
 * fold the rest into a "+N more" context block.
 */

export type SlackBlock = Record<string, unknown>;
export type SlackView = Record<string, unknown>;

const APP_BASE_URL =
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "https://foundry.gitwork.co.uk";

export interface StandupTaskCardInput {
  taskId: string;
  /** Database id of the SlackMessageRef row created when this card is posted. */
  messageRefId: string;
  title: string;
  blockName?: string | null;
  dueDate?: string | null;
  clientSlug: string;
}

export interface BuildStandupCardInput {
  phase: "AM" | "PM";
  who: string;
  workdayLabel: string;
  weekPlan?: string | null;
  note?: string | null;
  /** Tasks to show as expandable rows. Phase 2 caps at 8 per card. */
  tasks: StandupTaskCardInput[];
}

const MAX_TASKS_PER_CARD = 8;

function taskDeepLink(t: Pick<StandupTaskCardInput, "clientSlug" | "taskId">): string {
  return `${APP_BASE_URL}/app/portal/${encodeURIComponent(t.clientSlug)}/tasks?task=${encodeURIComponent(t.taskId)}`;
}

/**
 * Standup card — header + one section block per task (with an overflow accessory
 * carrying the action menu) + optional Monday "This week" block + optional note.
 *
 * Returns `{ text, blocks }` ready for chat.postMessage.
 */
export function buildStandupCard(input: BuildStandupCardInput): { text: string; blocks: SlackBlock[] } {
  const emoji = input.phase === "AM" ? ":large_yellow_circle:" : ":white_check_mark:";
  const sectionLabel = input.phase === "AM" ? "Doing" : "Done";
  const visible = input.tasks.slice(0, MAX_TASKS_PER_CARD);
  const overflowCount = Math.max(0, input.tasks.length - MAX_TASKS_PER_CARD);

  const text = `${input.phase === "AM" ? "Standup" : "Done today"} — ${input.who} (${input.workdayLabel})`;

  const blocks: SlackBlock[] = [
    {
      type: "header",
      text: { type: "plain_text", text: `${emoji} ${input.who} — ${input.workdayLabel}`.slice(0, 150) },
    },
  ];

  if (visible.length > 0) {
    blocks.push({
      type: "context",
      elements: [{ type: "mrkdwn", text: `*${sectionLabel}*` }],
    });
    for (const t of visible) {
      const subtitleParts: string[] = [];
      if (t.blockName) subtitleParts.push(t.blockName);
      if (t.dueDate) subtitleParts.push(`due ${t.dueDate}`);
      const subtitle = subtitleParts.length ? `\n_${subtitleParts.join(" · ")}_` : "";
      const value = encodeActionValue(t.messageRefId, t.taskId);
      blocks.push({
        type: "section",
        text: { type: "mrkdwn", text: `*${escapeMrkdwn(t.title)}*${subtitle}` },
        accessory: {
          type: "overflow",
          action_id: "task.menu",
          options: [
            {
              text: { type: "plain_text", text: ":eyes: Show notes" },
              value: `${SLACK_ACTIONS.TASK_VIEW_NOTES}|${value}`,
            },
            {
              text: { type: "plain_text", text: ":speech_balloon: Add comment" },
              value: `${SLACK_ACTIONS.TASK_ADD_COMMENT}|${value}`,
            },
            {
              text: { type: "plain_text", text: ":eyes: Mark in review" },
              value: `${SLACK_ACTIONS.TASK_MARK_IN_REVIEW}|${value}`,
            },
            {
              text: { type: "plain_text", text: ":white_check_mark: Mark done" },
              value: `${SLACK_ACTIONS.TASK_MARK_DONE}|${value}`,
            },
            {
              text: { type: "plain_text", text: ":arrow_upper_right: Open in Foundry" },
              url: taskDeepLink(t),
              value: `${SLACK_ACTIONS.TASK_OPEN_IN_FOUNDRY}|${value}`,
            },
          ],
        },
      });
    }
    if (overflowCount > 0) {
      blocks.push({
        type: "context",
        elements: [{ type: "mrkdwn", text: `+${overflowCount} more — view in Foundry` }],
      });
    }
  }

  if (input.weekPlan?.trim()) {
    blocks.push({ type: "divider" });
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*This week*\n${escapeMrkdwn(input.weekPlan.trim())}` },
    });
  }

  if (input.note?.trim()) {
    blocks.push({
      type: "context",
      elements: [{ type: "mrkdwn", text: `:memo: ${escapeMrkdwn(input.note.trim())}` }],
    });
  }

  blocks.push({
    type: "context",
    elements: [{ type: "mrkdwn", text: `Posted from Foundry` }],
  });

  return { text, blocks };
}

export interface RollupClientGroup {
  clientName: string;
  clientSlug: string;
  tasks: Array<{ title: string; assignee?: string | null; taskId: string }>;
}

/**
 * DevOps roll-up — one consolidated card listing everyone's "done today" grouped
 * by client, with per-client "View board" deep-link buttons.
 */
export function buildRollupCard(input: {
  dateLabel: string;
  groups: RollupClientGroup[];
}): { text: string; blocks: SlackBlock[] } {
  const text = `Daily roll-up · ${input.dateLabel}`;
  const blocks: SlackBlock[] = [
    { type: "header", text: { type: "plain_text", text: `:newspaper: ${text}` } },
  ];
  if (input.groups.length === 0) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: "_No tasks were completed today._" },
    });
    return { text, blocks };
  }
  for (const group of input.groups) {
    const lines = group.tasks
      .map((t) => `• ${escapeMrkdwn(t.title)}${t.assignee ? ` — _${escapeMrkdwn(t.assignee)}_` : ""}`)
      .join("\n");
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*${escapeMrkdwn(group.clientName)}*\n${lines}` },
      accessory: {
        type: "button",
        text: { type: "plain_text", text: "View board ↗" },
        url: `${APP_BASE_URL}/app/portal/${encodeURIComponent(group.clientSlug)}/tasks`,
        action_id: `rollup.openBoard.${group.clientSlug}`,
      },
    });
  }
  return { text, blocks };
}

/**
 * "Show notes" modal — the accordion drill-down. Read-only.
 */
export function buildNotesModal(input: {
  taskId: string;
  clientSlug: string;
  title: string;
  description?: string | null;
  acceptanceCriteria?: string | null;
  recentComments?: Array<{ author?: string | null; body: string }>;
}): SlackView {
  const blocks: SlackBlock[] = [
    {
      type: "section",
      text: { type: "mrkdwn", text: `*${escapeMrkdwn(input.title)}*` },
    },
  ];
  if (input.description?.trim()) {
    blocks.push({ type: "divider" });
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: truncate(escapeMrkdwn(input.description), 2900) },
    });
  }
  if (input.acceptanceCriteria?.trim()) {
    blocks.push({ type: "divider" });
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*Acceptance criteria*\n${truncate(escapeMrkdwn(input.acceptanceCriteria), 2900)}` },
    });
  }
  if (input.recentComments && input.recentComments.length > 0) {
    blocks.push({ type: "divider" });
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text:
          `*Recent comments*\n` +
          input.recentComments
            .slice(0, 3)
            .map((c) => `• ${c.author ? `*${escapeMrkdwn(c.author)}*: ` : ""}${escapeMrkdwn(truncate(c.body, 400))}`)
            .join("\n"),
      },
    });
  }
  blocks.push({
    type: "actions",
    elements: [
      {
        type: "button",
        text: { type: "plain_text", text: "Open in Foundry ↗" },
        url: taskDeepLink({ clientSlug: input.clientSlug, taskId: input.taskId }),
        action_id: SLACK_ACTIONS.TASK_OPEN_IN_FOUNDRY,
      },
    ],
  });
  return {
    type: "modal",
    callback_id: "task.notes",
    title: { type: "plain_text", text: "Task notes" },
    close: { type: "plain_text", text: "Close" },
    blocks,
  };
}

/**
 * "Add comment" modal — single text-area that submits to /api/webhooks/slack/interactions.
 * `private_metadata` carries the task id so the handler can resolve it on submit.
 */
export function buildAddCommentModal(input: {
  taskId: string;
  clientSlug: string;
  title: string;
}): SlackView {
  return {
    type: "modal",
    callback_id: "task.addComment",
    private_metadata: JSON.stringify({ taskId: input.taskId, clientSlug: input.clientSlug }),
    title: { type: "plain_text", text: "Add a comment" },
    submit: { type: "plain_text", text: "Post" },
    close: { type: "plain_text", text: "Cancel" },
    blocks: [
      {
        type: "section",
        text: { type: "mrkdwn", text: `Commenting on *${escapeMrkdwn(input.title)}*` },
      },
      {
        type: "input",
        block_id: "comment",
        label: { type: "plain_text", text: "Comment" },
        element: {
          type: "plain_text_input",
          action_id: "body",
          multiline: true,
          max_length: 4000,
        },
      },
    ],
  };
}

function escapeMrkdwn(s: string): string {
  // Slack mrkdwn doesn't need full escaping, but `&`, `<`, `>` are reserved.
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

/**
 * Action identifiers carried on `action_id` of every interactive element.
 * Centralised so the route handler can `switch` exhaustively.
 */
export const SLACK_ACTIONS = {
  TASK_VIEW_NOTES: "task.viewNotes",
  TASK_ADD_COMMENT: "task.addComment",
  TASK_MARK_DONE: "task.markDone",
  TASK_MARK_IN_REVIEW: "task.markInReview",
  TASK_OPEN_IN_FOUNDRY: "task.openInFoundry",
} as const;

export type SlackActionId = (typeof SLACK_ACTIONS)[keyof typeof SLACK_ACTIONS];

/**
 * Encode the message-ref id + a stable action label into a single `value`
 * string for button/overflow payloads. Slack returns this verbatim in
 * `block_actions.actions[].value` so the route can decode and authoritatively
 * resolve the task without trusting client-supplied IDs.
 *
 * Format: `<messageRefId>:<taskId>` — both are server-issued cuids, safe to
 * embed and trivial to split.
 */
export function encodeActionValue(messageRefId: string, taskId: string): string {
  return `${messageRefId}:${taskId}`;
}

export function decodeActionValue(value: string | undefined | null): {
  messageRefId: string;
  taskId: string;
} | null {
  if (!value) return null;
  const idx = value.indexOf(":");
  if (idx <= 0 || idx === value.length - 1) return null;
  return {
    messageRefId: value.slice(0, idx),
    taskId: value.slice(idx + 1),
  };
}
