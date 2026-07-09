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
  /** Database id of the SlackMessageRef row, when the card carries per-task
   *  Slack actions. Optional — the standup/project cards now render clean lists
   *  (no per-task buttons), so callers may omit it. */
  messageRefId?: string;
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

const MAX_TASKS_PER_CARD = 12;

function taskDeepLink(t: Pick<StandupTaskCardInput, "clientSlug" | "taskId">): string {
  return `${APP_BASE_URL}/app/portal/${encodeURIComponent(t.clientSlug)}/tasks?task=${encodeURIComponent(t.taskId)}`;
}

/** Per-client task board URL — the single link that replaces the old per-task links. */
function boardUrl(clientSlug: string | null | undefined): string {
  return clientSlug
    ? `${APP_BASE_URL}/app/portal/${encodeURIComponent(clientSlug)}/tasks`
    : `${APP_BASE_URL}/app/portal`;
}

/** Flatten markdown to a one-line plain preview so a description never breaks
 *  the tidy list layout (drops headings/lists/code/links-to-labels, collapses
 *  whitespace). */
function stripToPlain(s: string): string {
  return s
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[\s]*[-*+]\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/([*_])(.*?)\1/g, "$2")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Render a set of tasks as a clean bulleted mrkdwn list — one `• Title` per line,
 * with optional light meta (block · due) italicised, and an optional one-line
 * description underneath. No per-task links or menus: the card carries a single
 * "View board" button instead. `+N more` folds into a trailing line when capped.
 */
function taskListText(
  tasks: StandupTaskCardInput[],
  opts: { today: string | null; withMeta: boolean; withDescriptions?: boolean },
): string {
  const visible = tasks.slice(0, MAX_TASKS_PER_CARD);
  const overflow = Math.max(0, tasks.length - MAX_TASKS_PER_CARD);
  const lines = visible.map((t) => {
    const status = t.status ?? "DOING";
    const parts: string[] = [];
    if (opts.withMeta && t.blockName) parts.push(escapeMrkdwn(t.blockName));
    if (opts.withMeta && t.dueDate) {
      const isOverdue = Boolean(t.dueDate && opts.today && t.dueDate < opts.today && status !== "DONE");
      const dueFriendly = formatFriendlyDue(t.dueDate, opts.today);
      parts.push(isOverdue ? `due ${dueFriendly} (overdue)` : `due ${dueFriendly}`);
    }
    const meta = parts.length ? `  _· ${parts.join(" · ")}_` : "";
    let line = `• ${escapeMrkdwn(t.title)}${meta}`;
    if (opts.withDescriptions && t.description?.trim()) {
      line += `\n   _${escapeMrkdwn(truncate(stripToPlain(t.description.trim()), 180))}_`;
    }
    return line;
  });
  if (overflow > 0) lines.push(`• _+${overflow} more_`);
  return lines.join("\n");
}

/**
 * Standup card — a clean, scannable update: a header line, a single bulleted
 * task list (no per-task links or action menus), an optional Monday "This week"
 * plan, an optional note, and ONE "View board" button linking to the client's
 * task board.
 *
 * Returns `{ text, blocks }` ready for chat.postMessage.
 */
export function buildStandupCard(input: BuildStandupCardInput): { text: string; blocks: SlackBlock[] } {
  const phaseLabel = input.phase === "AM" ? "In progress" : "Done today";
  const today = input.workdayLabel.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? null;
  const friendlyDate = formatFriendlyDate(input.workdayLabel);
  const text = `${input.phase === "AM" ? "Standup" : "Done today"} — ${input.who} (${friendlyDate})`;
  const clientSlug = input.tasks[0]?.clientSlug ?? null;

  // ─── Owner + date header — narrative style, mirrors how the team writes
  //     standups in chat ("Owner: @Dan / Date: Friday, 12 June / In progress").
  const blocks: SlackBlock[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text:
          `*Owner:* ${escapeMrkdwn(input.who)}\n` +
          `*Date:* ${escapeMrkdwn(friendlyDate)}`,
      },
    },
  ];

  // Optional "This week" plan — Monday-only weekly section.
  if (input.weekPlan?.trim()) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*This week*\n${escapeMrkdwn(input.weekPlan.trim())}`,
      },
    });
  }

  // ─── Tasks — one tidy bulleted list under a labelled heading. No per-task
  //     links or overflow menus (cleaner + easier to read); the single board
  //     button below covers "open in Foundry".
  if (input.tasks.length > 0) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text:
          `*${phaseLabel}*\n` +
          taskListText(input.tasks, { today, withMeta: input.phase === "AM" }),
      },
    });
  }

  // ─── Blockers / asks — Dan's example called this "One thing we need".
  //     Only render when the dev provided a note on push.
  if (input.note?.trim()) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*One thing I need*\n${escapeMrkdwn(input.note.trim())}`,
      },
    });
  }

  // ─── Footer: the single board link + a quiet attribution line.
  blocks.push({
    type: "actions",
    elements: [
      {
        type: "button",
        text: { type: "plain_text", text: "View board" },
        url: boardUrl(clientSlug),
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

export interface PmUpdateDev {
  name: string;
  /** This dev's tasks marked done today. */
  tasks: Array<{ title: string; clientName: string; clientSlug: string; taskId: string }>;
  /** The dev's end-of-day note ("One thing I need"), when they left one. */
  note?: string | null;
}

/**
 * End-of-day PM roll-up — one consolidated card compiling each developer's PM
 * update (their done-today tasks + note), grouped BY DEVELOPER. Posted to the
 * dedicated "Daily PM updates" channel (Settings → Integrations route
 * `tasks.updates`), distinct from the client-grouped `buildRollupCard`.
 */
export function buildPmUpdatesCard(input: {
  dateLabel: string;
  devs: PmUpdateDev[];
  /** When set, a "🗑 Delete update" button (with a confirm dialog) is appended,
   *  carrying this SlackMessageRef id so the interactivity handler can resolve
   *  the message and run chat.delete. Omit for previews / unsaved renders. */
  deleteRefId?: string | null;
}): { text: string; blocks: SlackBlock[] } {
  const friendlyDate = formatFriendlyDate(input.dateLabel);
  const text = `End-of-day updates · ${input.dateLabel}`;
  const blocks: SlackBlock[] = [
    { type: "header", text: { type: "plain_text", text: `:memo: End-of-day updates` } },
    { type: "context", elements: [{ type: "mrkdwn", text: escapeMrkdwn(friendlyDate) }] },
  ];
  if (input.devs.length === 0) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: "_No developers have posted a PM update yet today._" },
    });
    return { text, blocks };
  }
  for (const dev of input.devs) {
    const taskLines = dev.tasks.length
      ? dev.tasks
          .map((t) => `• ${escapeMrkdwn(t.title)}  _· ${escapeMrkdwn(t.clientName)}_`)
          .join("\n")
      : "_No tasks marked done today._";
    let body = `*${escapeMrkdwn(dev.name)}*\n${taskLines}`;
    if (dev.note?.trim()) {
      body += `\n> ${escapeMrkdwn(truncate(dev.note.trim(), 600))}`;
    }
    blocks.push({ type: "section", text: { type: "mrkdwn", text: body } });
  }
  blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: `Posted from Foundry` }] });
  if (input.deleteRefId) {
    blocks.push({
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "🗑 Delete update", emoji: true },
          style: "danger",
          action_id: SLACK_ACTIONS.PM_UPDATES_DELETE,
          value: input.deleteRefId,
          confirm: {
            title: { type: "plain_text", text: "Delete this update?" },
            text: {
              type: "mrkdwn",
              text: "This removes the end-of-day update from this channel for everyone. This can't be undone.",
            },
            confirm: { type: "plain_text", text: "Delete" },
            deny: { type: "plain_text", text: "Keep" },
            style: "danger",
          },
        },
      ],
    });
  }
  return { text, blocks };
}

export interface ProjectUpdateGroup {
  label: "In progress" | "Done" | "Up next";
  tasks: StandupTaskCardInput[];
}

export interface BuildProjectUpdateCardInput {
  clientName: string;
  clientSlug: string;
  who: string;
  /** YYYY-MM-DD; reused for friendly date + overdue computation. */
  dateLabel: string;
  detail: "TITLES" | "TITLES_AND_DESCRIPTIONS";
  note?: string | null;
  groups: ProjectUpdateGroup[];
}

/**
 * On-demand project update — posted from the per-client Tasks page to the
 * client's internal channel. Header + Owner/Date + one labelled group per
 * selected status group (each task a section block with the same overflow menu
 * as the standup card, so Slack task actions work identically). `detail`
 * controls whether the description preview is rendered.
 */
export function buildProjectUpdateCard(
  input: BuildProjectUpdateCardInput,
): { text: string; blocks: SlackBlock[] } {
  const today = input.dateLabel.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? null;
  const friendlyDate = formatFriendlyDate(input.dateLabel);
  const text = `Project update — ${input.clientName} (${friendlyDate})`;

  const blocks: SlackBlock[] = [
    { type: "header", text: { type: "plain_text", text: `:clipboard: Project update — ${input.clientName}` } },
    {
      type: "context",
      elements: [
        { type: "mrkdwn", text: `*${escapeMrkdwn(input.who)}*  ·  ${escapeMrkdwn(friendlyDate)}` },
      ],
    },
  ];

  for (const group of input.groups) {
    if (group.tasks.length === 0) continue;
    // Clean bulleted list per group — no per-task links or menus. "Done" is
    // treated as a completed list (no due meta); the others show light meta.
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text:
          `*${group.label}*\n` +
          taskListText(group.tasks, {
            today,
            withMeta: group.label !== "Done",
            withDescriptions: input.detail === "TITLES_AND_DESCRIPTIONS",
          }),
      },
    });
  }

  if (input.note?.trim()) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*Note*\n${escapeMrkdwn(input.note.trim())}` },
    });
  }

  blocks.push({
    type: "actions",
    elements: [
      {
        type: "button",
        text: { type: "plain_text", text: "View board" },
        url: `${APP_BASE_URL}/app/portal/${encodeURIComponent(input.clientSlug)}/tasks`,
        action_id: "projectUpdate.viewBoard",
      },
    ],
  });
  blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: `Posted from Foundry` }] });

  return { text, blocks };
}

/**
 * Free-form broadcast — the DevOps lead's cross-client update. No tasks, no
 * accessories; just the message and a quiet attribution line.
 */
export function buildBroadcastCard(input: {
  who: string;
  message: string;
}): { text: string; blocks: SlackBlock[] } {
  const text = `Update from ${input.who}`;
  return {
    text,
    blocks: [
      {
        type: "section",
        text: { type: "mrkdwn", text: `:loudspeaker: ${truncate(escapeMrkdwn(input.message.trim()), 2900)}` },
      },
      {
        type: "context",
        elements: [{ type: "mrkdwn", text: `*— ${escapeMrkdwn(input.who)}, via Foundry*` }],
      },
    ],
  };
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
  PM_UPDATES_DELETE: "pmUpdates.delete",
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
