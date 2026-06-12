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
  /** Task description (markdown). Rendered as a one-line preview under the
   *  title, truncated to keep the card scannable; full text lives in the
   *  "Show details" modal. */
  description?: string | null;
}

/** Pretty-print a YYYY-MM-DD or Weekday-prefixed label as "Friday, 12 June".
 *  Callers may pass either an ISO date or a partially-formatted string; we
 *  pluck the ISO chunk and reformat, falling back to the original on parse
 *  failure so the card never breaks. */
function formatFriendlyDate(raw: string): string {
  const iso = raw.match(/\d{4}-\d{2}-\d{2}/)?.[0];
  if (!iso) return raw;
  const d = new Date(iso + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return raw;
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(d);
}

/** Pretty-print a due-date as "today", "tomorrow", "Fri 12 Jun", etc. */
function formatFriendlyDue(rawDue: string, todayIso: string | null): string {
  if (!todayIso) return rawDue;
  const due = new Date(rawDue + "T00:00:00Z");
  const today = new Date(todayIso + "T00:00:00Z");
  if (Number.isNaN(due.getTime()) || Number.isNaN(today.getTime())) return rawDue;
  const diffDays = Math.round((due.getTime() - today.getTime()) / 86_400_000);
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "tomorrow";
  if (diffDays === -1) return "yesterday";
  if (diffDays > 1 && diffDays < 7) {
    return new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: "UTC" }).format(due);
  }
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(due);
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
  const phaseLabel = input.phase === "AM" ? "In Progress" : "Done today";
  const visible = input.tasks.slice(0, MAX_TASKS_PER_CARD);
  const overflowCount = Math.max(0, input.tasks.length - MAX_TASKS_PER_CARD);
  const today = input.workdayLabel.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? null;
  const overdueCount = visible.filter(
    (t) => t.dueDate && today && t.dueDate < today && t.status !== "DONE",
  ).length;

  const friendlyDate = formatFriendlyDate(input.workdayLabel);
  const text = `${input.phase === "AM" ? "Standup" : "Done today"} — ${input.who} (${friendlyDate})`;

  // ─── Owner + date header — narrative style, mirrors how the team writes
  //     standups in chat ("Owner: @Dan / Date: Friday, 12 June / In Progress").
  const blocks: SlackBlock[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text:
          `*Owner:* ${escapeMrkdwn(input.who)}\n` +
          `*Date:* ${escapeMrkdwn(friendlyDate)}\n` +
          `*${phaseLabel}*`,
      },
    },
  ];

  // Optional "This week" plan — Monday-only Weekly section.
  if (input.weekPlan?.trim()) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*This week*\n${escapeMrkdwn(input.weekPlan.trim())}`,
      },
    });
  }

  // ─── Tasks — single section block per task with a markdown-link title and
  //     a discreet overflow accessory carrying the actions. This keeps the
  //     row scannable (no per-task action toolbar) while still being
  //     fully actionable from Slack.
  if (visible.length > 0) {
    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `*Tasks* — ${visible.length}${overdueCount > 0 ? ` · *${overdueCount} overdue*` : ""}${overflowCount > 0 ? ` · +${overflowCount} in Foundry` : ""}`,
        },
      ],
    });
    for (const t of visible) {
      const status = t.status ?? "DOING";
      const isOverdue = Boolean(t.dueDate && today && t.dueDate < today && status !== "DONE");
      // Meta: drop the client name (we're posting in the client's channel
      // already, so it's redundant). Keep block + due. Overdue gets a text
      // "(overdue)" suffix instead of an emoji warning.
      const metaParts: string[] = [];
      if (t.blockName) metaParts.push(escapeMrkdwn(t.blockName));
      if (t.dueDate) {
        const dueFriendly = formatFriendlyDue(t.dueDate, today);
        metaParts.push(isOverdue ? `due ${dueFriendly} (overdue)` : `due ${dueFriendly}`);
      }
      const meta = metaParts.length ? `  ·  _${metaParts.join(" · ")}_` : "";
      const descPreview = t.description?.trim()
        ? truncate(stripToPlain(t.description.trim()), 180)
        : null;
      const value = encodeActionValue(t.messageRefId, t.taskId);

      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          // Title is a markdown link so the user can jump to the task with
          // a single click — no separate button needed. Description goes on
          // the next line, italicised, to give context without dominating.
          text:
            `<${taskDeepLink(t)}|*${escapeMrkdwn(t.title)}*>${meta}` +
            (descPreview ? `\n_${escapeMrkdwn(descPreview)}_` : ""),
        },
        accessory: {
          type: "overflow",
          action_id: `task.menu.${t.taskId}`,
          options: [
            {
              text: { type: "plain_text", text: "Mark done" },
              value: `${SLACK_ACTIONS.TASK_MARK_DONE}|${value}`,
            },
            {
              text: { type: "plain_text", text: "Mark in review" },
              value: `${SLACK_ACTIONS.TASK_MARK_IN_REVIEW}|${value}`,
            },
            {
              text: { type: "plain_text", text: "Add comment" },
              value: `${SLACK_ACTIONS.TASK_ADD_COMMENT}|${value}`,
            },
            {
              text: { type: "plain_text", text: "Show details" },
              value: `${SLACK_ACTIONS.TASK_VIEW_NOTES}|${value}`,
            },
            {
              text: { type: "plain_text", text: "Open in Foundry" },
              url: taskDeepLink(t),
              value: `${SLACK_ACTIONS.TASK_OPEN_IN_FOUNDRY}|${value}`,
            },
          ],
        },
      });
    }
  }

  if (overflowCount > 0 && visible.length > 0) {
    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `<${APP_BASE_URL}/app/portal|+${overflowCount} more in Foundry ↗>`,
        },
      ],
    });
  }

  // ─── Blockers / asks — Dan's example called this "One thing we need".
  //     Only render when the dev provided a note on push.
  if (input.note?.trim()) {
    blocks.push({ type: "divider" });
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*One thing I need*\n${escapeMrkdwn(input.note.trim())}`,
      },
    });
  }

  // ─── Footer: single bulk action + a quiet "posted from" timestamp line.
  blocks.push({ type: "divider" });
  blocks.push({
    type: "actions",
    elements: [
      {
        type: "button",
        text: { type: "plain_text", text: "View my board" },
        url: `${APP_BASE_URL}/app/portal`,
        action_id: "standup.viewBoard",
      },
    ],
  });
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
    callback_id: "task.details",
    title: { type: "plain_text", text: "Task details" },
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

/** Strip common markdown to a flat one-line preview — keeps the standup card
 *  scannable when descriptions are multi-paragraph or have headings, lists,
 *  bold, code etc. The full text still renders untouched in the details modal. */
function stripToPlain(s: string): string {
  return s
    .replace(/```[\s\S]*?```/g, " ") // fenced code blocks
    .replace(/`([^`]+)`/g, "$1")      // inline code
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "") // images
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // links → just the label
    .replace(/^#{1,6}\s+/gm, "")      // ATX headings
    .replace(/^[\s]*[-*+]\s+/gm, "")  // bullet list markers
    .replace(/^\s*>\s?/gm, "")        // blockquote markers
    .replace(/(\*\*|__)(.*?)\1/g, "$2") // bold
    .replace(/([*_])(.*?)\1/g, "$2")  // italic
    .replace(/\s+/g, " ")             // collapse all whitespace incl. newlines
    .trim();
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
