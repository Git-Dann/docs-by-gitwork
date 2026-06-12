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
  /** YYYY-MM-DD; overdue formatting is computed against the workdayLabel. */
  dueDate?: string | null;
  clientSlug: string;
  /** Surfaced explicitly in the card subtitle (was previously implicit in the link). */
  clientName?: string | null;
  /** Drives the leading status emoji. Defaults to DOING when omitted. */
  status?: "BACKLOG" | "TODO" | "DOING" | "IN_REVIEW" | "DONE";
}

const STATUS_EMOJI: Record<NonNullable<StandupTaskCardInput["status"]>, string> = {
  BACKLOG: ":white_circle:",
  TODO: ":large_blue_circle:",
  DOING: ":large_yellow_circle:",
  IN_REVIEW: ":eyes:",
  DONE: ":white_check_mark:",
};

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

  // Summary line under the header — "3 in progress · 1 overdue · +N more".
  const today = input.workdayLabel.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? null;
  const overdueCount = visible.filter(
    (t) => t.dueDate && today && t.dueDate < today && t.status !== "DONE",
  ).length;
  const summaryParts: string[] = [];
  summaryParts.push(`${visible.length} ${sectionLabel.toLowerCase()}`);
  if (overdueCount > 0) summaryParts.push(`*${overdueCount} overdue*`);
  if (overflowCount > 0) summaryParts.push(`+${overflowCount} more in Foundry`);
  blocks.push({
    type: "context",
    elements: [{ type: "mrkdwn", text: summaryParts.join(" · ") }],
  });

  // Optional "This week" plan — Monday standups only, callers gate this upstream.
  if (input.weekPlan?.trim()) {
    blocks.push({ type: "divider" });
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `:calendar: *This week*\n${escapeMrkdwn(input.weekPlan.trim())}`,
      },
    });
  }

  // One "mini card" per task: divider → section (title + meta + Open button) →
  // actions row (Notes · Comment · Done). Each task gets explicit primary
  // actions instead of hiding them inside an overflow.
  for (const t of visible) {
    const status = t.status ?? "DOING";
    const statusE = STATUS_EMOJI[status];
    const isOverdue = Boolean(t.dueDate && today && t.dueDate < today && status !== "DONE");
    const metaParts: string[] = [];
    if (t.clientName) metaParts.push(escapeMrkdwn(t.clientName));
    if (t.blockName) metaParts.push(escapeMrkdwn(t.blockName));
    if (t.dueDate) {
      metaParts.push(isOverdue ? `:warning: due ${t.dueDate}` : `due ${t.dueDate}`);
    }
    const meta = metaParts.length ? `\n_${metaParts.join(" · ")}_` : "";
    const value = encodeActionValue(t.messageRefId, t.taskId);

    blocks.push({ type: "divider" });
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${statusE} *${escapeMrkdwn(t.title)}*${meta}`,
      },
      accessory: {
        type: "button",
        text: { type: "plain_text", text: "Open ↗" },
        url: taskDeepLink(t),
        action_id: `${SLACK_ACTIONS.TASK_OPEN_IN_FOUNDRY}.${t.taskId}`,
      },
    });
    blocks.push({
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", emoji: true, text: ":eyes: Notes" },
          value: `${SLACK_ACTIONS.TASK_VIEW_NOTES}|${value}`,
          action_id: `${SLACK_ACTIONS.TASK_VIEW_NOTES}.${t.taskId}`,
        },
        {
          type: "button",
          text: { type: "plain_text", emoji: true, text: ":speech_balloon: Comment" },
          value: `${SLACK_ACTIONS.TASK_ADD_COMMENT}|${value}`,
          action_id: `${SLACK_ACTIONS.TASK_ADD_COMMENT}.${t.taskId}`,
        },
        {
          type: "button",
          text: { type: "plain_text", emoji: true, text: ":mag: In review" },
          value: `${SLACK_ACTIONS.TASK_MARK_IN_REVIEW}|${value}`,
          action_id: `${SLACK_ACTIONS.TASK_MARK_IN_REVIEW}.${t.taskId}`,
        },
        {
          type: "button",
          style: "primary",
          text: { type: "plain_text", emoji: true, text: ":white_check_mark: Done" },
          value: `${SLACK_ACTIONS.TASK_MARK_DONE}|${value}`,
          action_id: `${SLACK_ACTIONS.TASK_MARK_DONE}.${t.taskId}`,
        },
      ],
    });
  }

  if (overflowCount > 0 && visible.length > 0) {
    blocks.push({ type: "divider" });
    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `:arrow_upper_right: ${overflowCount} more — <${APP_BASE_URL}/app/portal|open my board>`,
        },
      ],
    });
  }

  if (input.note?.trim()) {
    blocks.push({ type: "divider" });
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
  // Footer — markdown link instead of a button. URL buttons in modals
  // trigger a hover-tooltip with the full URL splatted on screen; the
  // hyperlink in a context block doesn't, and the smaller treatment is
  // appropriate for a read-only modal anyway.
  blocks.push({ type: "divider" });
  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `<${taskDeepLink({ clientSlug: input.clientSlug, taskId: input.taskId })}|Open in Foundry ↗>`,
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
