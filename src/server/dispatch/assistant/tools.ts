/**
 * Dispatch's tools: what the model may look at, and what it may propose.
 *
 * The permission wall lives HERE, not in the prompt:
 *   - No tool takes a client. Every one works on `scope.client`, and access is re-checked
 *     before each run (`runTool`), so a chat can't drift to another client and access removed
 *     mid-chat takes effect at once.
 *   - Every result is built field by field (never a spread record) and then goes through
 *     `finaliseToolText`: credentials hidden, money hidden for people who can't see costs,
 *     length capped. Bank details, platform logins, HR and Care customer data are never read.
 *   - `propose_*` tools change nothing. They store a pending action the asker confirms with a
 *     click, and the rules are checked again then (actions.ts).
 *
 * Results are plain text wrapped in <source> tags: cheaper than JSON, and the model reads
 * project content as data.
 */

import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { google } from "googleapis";
import { prisma } from "@/lib/prisma";
import { asSource } from "@/lib/dispatch/prompt";
import { CODE_CHAR_CAP, MAX_PROPOSED_TASKS, RESULT_CHAR_CAP } from "@/lib/dispatch/limits";
import {
  assigneesForNewTask,
  mayAnnotateTask,
  mayChangeTask,
  type DispatchActionKind,
} from "@/lib/dispatch/actions";
import { isStuck } from "@/lib/tasks/stuck";
import { TASK_STATUSES, TASK_STATUS_LABELS, type TaskDTO } from "@/types/tasks";
import { taskRef } from "@/lib/format";
import { finaliseToolText } from "./redact";
import { assertStillAllowed, type DispatchScope } from "./scope";
import { CODE_TOOLS } from "./tools-code";
import { DESIGN_TOOLS } from "./tools-design";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ToolSource {
  kind: "task" | "meeting" | "wiki" | "document" | "drive" | "slack" | "release" | "overview" | "code" | "design" | "page";
  id: string;
  label: string;
  href?: string;
}

export interface ProposedActionCard {
  id: string;
  kind: DispatchActionKind;
  title: string;
  lines: string[];
}

export interface ToolImage {
  mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
  /** base64 */
  data: string;
}

export interface ToolOutcome {
  text: string;
  sources?: ToolSource[];
  action?: ProposedActionCard;
  /** Pictures for the model to look at (a Figma frame, a page screenshot). */
  images?: ToolImage[];
  isError?: boolean;
}

export interface ToolContext {
  conversationId: string;
  /** Pictures this question may still bring in; tools that return one take a slot first. */
  imagesLeft: number;
}

export interface DispatchTool<S extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  schema: S;
  /** Shown in the panel while it runs ("Reading meeting notes…"). */
  status: string;
  /** Read tools are capped as code (larger) or text. */
  codeSized?: boolean;
  run(scope: DispatchScope, input: z.infer<S>, ctx: ToolContext): Promise<ToolOutcome>;
}

function tool<S extends z.ZodTypeAny>(t: DispatchTool<S>): DispatchTool {
  return t as unknown as DispatchTool;
}

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});

// ─── Shared helpers ─────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;

function day(iso: string | Date | null | undefined): string {
  if (!iso) return "";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

function taskLine(t: TaskDTO): string {
  const bits = [
    // The ref is a handle for get_task / propose_*, in brackets so the model treats it as one;
    // the prompt says never to show it to the person (they know tasks by their titles).
    `${t.title} [ref ${taskRef(t.id).replace(/^#/, "")}]`,
    TASK_STATUS_LABELS[t.status] ?? t.status,
    t.assignees.length ? t.assignees.map((a) => a.name).join(", ") : "unassigned",
  ];
  if (t.dueDate) bits.push(`due ${day(t.dueDate)}`);
  if (t.release) bits.push(`release ${t.release.version}`);
  if (t.featureBlock) bits.push(`category ${t.featureBlock.name}`);
  if (t.blockedReason) bits.push("blocked");
  if (t.flag) bits.push(`flagged${t.flag.note ? `: ${t.flag.note}` : ""}`);
  if (isStuck(t)) bits.push("stuck in progress");
  return `- ${bits.join(" · ")}`;
}

/** Open tasks on a client counted per person ("Nasir Javed 5, Fahad 3; 4 with nobody"). For admins. */
export function openByPerson(open: readonly Pick<TaskDTO, "assignees">[], clientName: string): string {
  const counts = new Map<string, number>();
  let nobody = 0;
  for (const t of open) {
    if (!t.assignees.length) nobody += 1;
    for (const a of t.assignees) counts.set(a.name, (counts.get(a.name) ?? 0) + 1);
  }
  const people = [...counts.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]));
  const list = people.map(([name, n]) => `${name} ${n}`).join(", ");
  return `Open tasks on ${clientName} by person (a shared task counts for each person on it): ${list || "none assigned"}. ${nobody} with nobody assigned.`;
}

/** A source chip names a task by its title (what people know it by), shortened. */
function chipTitle(title: string): string {
  return title.length > 48 ? `${title.slice(0, 47)}…` : title;
}

function taskHref(scope: DispatchScope, id: string): string {
  return `/app/portal/${scope.client.slug}/tasks?task=${id}`;
}

/** A task on THIS client, by id or by the #REF people see on cards. */
async function findTask(scope: DispatchScope, ref: string): Promise<{ id: string } | string> {
  const raw = ref.trim().replace(/^#/, "");
  if (!raw) return "Give me a task id or its #REF.";
  const where: Prisma.TaskWhereInput = {
    workspaceId: scope.user.workspaceId,
    clientId: scope.client.id,
    ...(raw.length > 12 ? { id: raw } : { id: { endsWith: raw.toLowerCase() } }),
  };
  const rows = await prisma.task.findMany({ where, select: { id: true }, take: 2 });
  if (rows.length === 0) return `No task ${ref} on ${scope.client.name}.`;
  if (rows.length > 1) return `${ref} matches more than one task; use the full id.`;
  return rows[0];
}

async function taskFacts(scope: DispatchScope, id: string) {
  const row = await prisma.task.findFirst({
    where: { id, workspaceId: scope.user.workspaceId },
    select: {
      id: true,
      title: true,
      clientId: true,
      parentId: true,
      assigneeId: true,
      assignees: { select: { id: true } },
    },
  });
  if (!row) return null;
  const assigneeIds = row.assignees.length ? row.assignees.map((a) => a.id) : row.assigneeId ? [row.assigneeId] : [];
  return { ...row, assigneeIds };
}

/** Pull readable text out of structured JSON (document sections, structured wiki pages). */
export function textOf(value: unknown, depth = 0): string[] {
  if (depth > 8 || value == null) return [];
  if (typeof value === "string") return value.trim() ? [value.trim()] : [];
  if (typeof value === "number" || typeof value === "boolean") return [];
  if (Array.isArray(value)) return value.flatMap((v) => textOf(v, depth + 1));
  if (typeof value === "object") {
    const out: string[] = [];
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (/^(id|key|url|href|src|image|imageUrl|logo|icon|color|colour|style|variant|layout|type)$/i.test(k)) continue;
      out.push(...textOf(v, depth + 1));
    }
    return out;
  }
  return [];
}

/** Section keys or titles that carry prices. Left out for people who can't see costs. */
export const PRICE_SECTION = /cost|pric|invest|fee|budget|rate|payment|quote|margin/i;

async function proposeAction(
  scope: DispatchScope,
  ctx: ToolContext,
  kind: DispatchActionKind,
  payload: Record<string, unknown>,
  card: { title: string; lines: string[] },
): Promise<ToolOutcome> {
  const row = await prisma.dispatchAction.create({
    data: {
      workspaceId: scope.user.workspaceId,
      conversationId: ctx.conversationId,
      userId: scope.user.id,
      clientId: scope.client.id,
      kind,
      // The card travels with the payload so the chat can show it again later.
      payload: { ...payload, card } as Prisma.InputJsonValue,
    },
    select: { id: true },
  });
  return {
    text: `Proposed (not done yet). ${card.title}. It is waiting for ${scope.user.name ?? "the person"} to confirm with the button in the chat; do not say it is done.`,
    action: { id: row.id, kind, title: card.title, lines: card.lines },
  };
}

// ─── Read tools ─────────────────────────────────────────────────────────────

const projectOverview = tool({
  name: "project_overview",
  description:
    "Where the project stands: overdue, in progress, due soon, recently done and blocked tasks, categories and milestones, recent meetings and documents, plus what can't be measured. Start here for status questions.",
  input_schema: obj({}),
  schema: z.object({}).strict(),
  status: "Checking where the project stands",
  async run(scope) {
    const { gatherEvidence } = await import("@/server/dispatch/evidence");
    const { resolveDispatchConfig } = await import("@/server/dispatch/config");
    const ws = await prisma.workspace.findUnique({
      where: { id: scope.user.workspaceId },
      select: { dispatchConfig: true },
    });
    const e = await gatherEvidence({
      workspaceId: scope.user.workspaceId,
      subject: { kind: "client", id: scope.client.id, label: scope.client.name, slug: scope.client.slug },
      personFilter: null,
      config: resolveDispatchConfig(ws?.dispatchConfig),
      documentTypes: scope.documentTypes,
    });
    const list = (title: string, rows: { title: string; dueDate: string | null; assignees: string[]; status: string; blockedReason?: string | null }[]) =>
      rows.length
        ? `${title}:\n${rows
            .map((t) => `- ${t.title} · ${t.status}${t.dueDate ? ` · due ${day(t.dueDate)}` : ""} · ${t.assignees.join(", ") || "unassigned"}${t.blockedReason ? ` · blocked: ${t.blockedReason}` : ""}`)
            .join("\n")}`
        : `${title}: none`;
    const parts = [
      `Counts: ${e.counts.openTasks} open, ${e.counts.overdue} overdue, ${e.counts.doing} in progress, ${e.counts.dueSoon} due soon, ${e.counts.doneInWindow} done recently, ${e.counts.blocked} blocked.`,
      list("Overdue", e.overdue),
      list("In progress", e.doing),
      list("Due soon", e.dueSoon),
      list("Recently done", e.recentlyDone),
      list("Blocked", e.blocked),
      e.blocks.length
        ? `Categories:\n${e.blocks.map((b) => `- ${b.name}: ${b.doneTasks}/${b.totalTasks} done${b.endDate ? `, ends ${day(b.endDate)}` : ""}`).join("\n")}`
        : "",
      e.milestones.length ? `Milestones:\n${e.milestones.map((m) => `- ${m.name} on ${day(m.date)}`).join("\n")}` : "",
      e.meetings.length
        ? `Recent meetings:\n${e.meetings.map((m) => `- [${m.id}] ${m.title} ${day(m.startedAt)}${m.summary ? `: ${m.summary.slice(0, 240)}` : ""}`).join("\n")}`
        : "",
      e.documents.length
        ? `Documents:\n${e.documents.map((d) => `- [${d.id}] ${d.title} (${d.type}, ${d.status})`).join("\n")}`
        : "",
      scope.isAdmin && e.foremanFindings.length
        ? `Foreman's flags:\n${e.foremanFindings.map((f) => `- ${f.headline}`).join("\n")}`
        : "",
      e.blindSpots.length ? `Can't be measured:\n${e.blindSpots.map((b) => `- ${b.detail}`).join("\n")}` : "",
      e.truncated ? "Some lists were capped; there is more in Foundry." : "",
    ].filter(Boolean);
    return {
      text: asSource("overview", scope.client.slug, parts.join("\n\n")),
      sources: [{ kind: "overview", id: scope.client.id, label: `${scope.client.name} board`, href: `/app/portal/${scope.client.slug}/tasks` }],
    };
  },
});

const myWork = tool({
  name: "my_work",
  description:
    "The asker's own tasks on this client. range: this_week (in progress or due by Sunday), next_week (due next week), done (finished in the last 14 days), flagged (flagged for follow-up, anyone's), stuck (in progress 5+ days).",
  input_schema: obj({ range: { type: "string", enum: ["this_week", "next_week", "done", "flagged", "stuck"] } }, ["range"]),
  schema: z.object({ range: z.enum(["this_week", "next_week", "done", "flagged", "stuck"]) }).strict(),
  status: "Looking at your tasks",
  async run(scope, { range }) {
    const { listTasks } = await import("@/server/tasks");
    const mine = range !== "flagged";
    const tasks = await listTasks(scope.user, {
      clientId: scope.client.id,
      ...(mine ? { assigneeId: scope.user.id } : {}),
      ...(range === "done" ? { status: "DONE" as const, doneWithinDays: 14 } : {}),
      limit: 200,
    });
    const now = new Date();
    const dow = (now.getUTCDay() + 6) % 7; // Monday = 0
    const startWeek = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - dow * DAY_MS;
    const endWeek = startWeek + 7 * DAY_MS;
    const endNext = endWeek + 7 * DAY_MS;
    const due = (t: TaskDTO) => (t.dueDate ? new Date(t.dueDate).getTime() : null);
    const picked = tasks.filter((t) => {
      if (range === "done") return true;
      if (range === "flagged") return Boolean(t.flag);
      if (range === "stuck") return isStuck(t);
      if (t.status === "DONE") return false;
      const d = due(t);
      if (range === "this_week") return t.status === "DOING" || t.status === "IN_REVIEW" || (d !== null && d < endWeek);
      return d !== null && d >= endWeek && d < endNext;
    });
    const label = { this_week: "This week", next_week: "Next week", done: "Done in the last 14 days", flagged: "Flagged for follow-up", stuck: "Stuck in progress" }[range];
    // Nothing on this client is theirs at all (not just nothing in this range): say so, and how
    // much is waiting for an owner, rather than an empty list (Dan, 25 Nov).
    if (mine && tasks.length === 0) {
      const who = scope.user.name ?? "The person asking";
      const none = `${who} has no tasks assigned on ${scope.client.name}.`;
      // An admin runs the project, so they're told whose the open work is (counts per person).
      // A developer is told only how much has no owner: what their teammates hold isn't theirs
      // to be handed in an answer about their own work (Dan, 25 Nov).
      if (scope.isAdmin) {
        const open = await listTasks(scope.user, { clientId: scope.client.id, openOnly: true, limit: 500 });
        return { text: asSource("tasks", range, `${none}\n${openByPerson(open, scope.client.name)}`) };
      }
      const unassigned = await listTasks(scope.user, { clientId: scope.client.id, unassignedOnly: true, openOnly: true, limit: 500 });
      return {
        text: asSource(
          "tasks",
          range,
          `${none} There ${unassigned.length === 1 ? "is 1 open task" : `are ${unassigned.length} open tasks`} on ${scope.client.name} with nobody assigned.`,
        ),
      };
    }
    return {
      text: asSource("tasks", range, picked.length ? `${label}:\n${picked.slice(0, 40).map(taskLine).join("\n")}` : `${label}: nothing.`),
      sources: picked.slice(0, 8).map((t) => ({ kind: "task" as const, id: t.id, label: chipTitle(t.title), href: taskHref(scope, t.id) })),
    };
  },
});

const findTasks = tool({
  name: "find_tasks",
  description:
    "Search this client's tasks by words in the title or description. Optional status filter, and who: me, unassigned or anyone. Use to check for duplicates before proposing new tasks.",
  input_schema: obj({
    query: { type: "string", description: "Words to look for. Empty lists recent tasks." },
    status: { type: "string", enum: [...TASK_STATUSES] },
    who: { type: "string", enum: ["me", "unassigned", "anyone"] },
  }),
  schema: z
    .object({
      query: z.string().max(200).optional(),
      status: z.enum(TASK_STATUSES as [string, ...string[]]).optional(),
      who: z.enum(["me", "unassigned", "anyone"]).optional(),
    })
    .strict(),
  status: "Searching tasks",
  async run(scope, { query, status, who }) {
    const words = (query ?? "").trim().split(/\s+/).filter((w) => w.length > 1).slice(0, 6);
    const where: Prisma.TaskWhereInput = {
      workspaceId: scope.user.workspaceId,
      clientId: scope.client.id,
      archivedAt: null,
      ...(status ? { status: status as TaskDTO["status"] } : {}),
      ...(who === "me" ? { OR: [{ assignees: { some: { id: scope.user.id } } }, { assigneeId: scope.user.id }] } : {}),
      ...(who === "unassigned" ? { assignees: { none: {} }, assigneeId: null } : {}),
      ...(words.length
        ? {
            AND: words.map((w) => ({
              OR: [
                { title: { contains: w, mode: "insensitive" as const } },
                { description: { contains: w, mode: "insensitive" as const } },
              ],
            })),
          }
        : {}),
    };
    const rows = await prisma.task.findMany({ where, select: { id: true }, orderBy: { updatedAt: "desc" }, take: 25 });
    if (rows.length === 0) return { text: `No tasks match${query ? ` "${query}"` : ""}.` };
    const { getTask } = await import("@/server/tasks");
    const tasks = await Promise.all(rows.map((r) => getTask(scope.user, r.id)));
    return {
      text: asSource("tasks", "search", tasks.map(taskLine).join("\n")),
      sources: tasks.slice(0, 8).map((t) => ({ kind: "task" as const, id: t.id, label: chipTitle(t.title), href: taskHref(scope, t.id) })),
    };
  },
});

const getTaskTool = tool({
  name: "get_task",
  description: "One task in full: description, acceptance criteria, subtasks, latest comments, who's on it. Pass its id or #REF.",
  input_schema: obj({ task: { type: "string", description: "Task id or #REF." } }, ["task"]),
  schema: z.object({ task: z.string().min(1).max(60) }).strict(),
  status: "Reading the task",
  async run(scope, { task }) {
    const found = await findTask(scope, task);
    if (typeof found === "string") return { text: found, isError: true };
    const { getTask } = await import("@/server/tasks");
    const t = await getTask(scope.user, found.id);
    const lines = [
      taskLine(t),
      t.description ? `Description:\n${t.description}` : "",
      t.acceptanceCriteria ? `Acceptance criteria:\n${t.acceptanceCriteria}` : "",
      t.blockedReason ? `Blocked: ${t.blockedReason}${t.blockedResponse ? `\nClient replied: ${t.blockedResponse}` : ""}` : "",
      t.subtasks.length ? `Subtasks:\n${t.subtasks.map(taskLine).join("\n")}` : "",
      t.comments.length
        ? `Latest comments:\n${t.comments.slice(-8).map((c) => `- ${c.author?.name ?? "Someone"} (${day(c.createdAt)}): ${c.body}`).join("\n")}`
        : "",
    ].filter(Boolean);
    return {
      text: asSource("task", taskRef(t.id), lines.join("\n\n")),
      sources: [{ kind: "task", id: t.id, label: chipTitle(t.title), href: taskHref(scope, t.id) }],
    };
  },
});

const searchProject = tool({
  name: "search_project",
  description:
    "Search everything Foundry holds for this client at once: tasks, meeting notes, wiki pages and documents. Returns short snippets with ids; open one with get_task, get_meeting, get_wiki_page or get_document. For Drive files use search_drive; for Slack, read_slack.",
  input_schema: obj({ query: { type: "string" } }, ["query"]),
  schema: z.object({ query: z.string().min(1).max(200) }).strict(),
  status: "Searching the project",
  async run(scope, { query }) {
    const q = query.trim();
    const contains = { contains: q, mode: "insensitive" as const };
    const { listClientMeetings } = await import("@/server/meetings");
    const [tasks, meetings, wiki, docs] = await Promise.all([
      prisma.task.findMany({
        where: { workspaceId: scope.user.workspaceId, clientId: scope.client.id, archivedAt: null, OR: [{ title: contains }, { description: contains }] },
        select: { id: true, title: true, status: true },
        orderBy: { updatedAt: "desc" },
        take: 6,
      }),
      listClientMeetings(scope.user.workspaceId, scope.client.id, q),
      prisma.clientWikiPage.findMany({
        where: { wiki: { clientId: scope.client.id } },
        select: { id: true, title: true, content: true },
        take: 60,
      }),
      prisma.document.findMany({
        where: {
          workspaceId: scope.user.workspaceId,
          clientId: scope.client.id,
          documentType: { in: scope.documentTypes },
          title: contains,
        },
        select: { id: true, title: true, documentType: true },
        take: 5,
      }),
    ]);
    const lower = q.toLowerCase();
    const snippet = (text: string) => {
      const at = text.toLowerCase().indexOf(lower);
      const start = Math.max(0, at - 80);
      return (start > 0 ? "…" : "") + text.slice(start, start + 200).replace(/\s+/g, " ") + "…";
    };
    const wikiHits = wiki
      .map((p) => ({ p, text: textOf(p.content).join("\n") }))
      .filter(({ p, text }) => p.title.toLowerCase().includes(lower) || text.toLowerCase().includes(lower))
      .slice(0, 5);
    const sections = [
      tasks.length ? `Tasks:\n${tasks.map((t) => `- ${t.title} [ref ${taskRef(t.id).replace(/^#/, "")}] (${t.status})`).join("\n")}` : "",
      meetings.length
        ? `Meetings:\n${meetings.slice(0, 5).map((m) => `- [${m.id}] ${m.title} ${day(m.startedAt)}${m.summary ? `: ${snippet(m.summary)}` : ""}`).join("\n")}`
        : "",
      wikiHits.length ? `Wiki:\n${wikiHits.map(({ p, text }) => `- [${p.id}] ${p.title}${text ? `: ${snippet(text)}` : ""}`).join("\n")}` : "",
      docs.length ? `Documents:\n${docs.map((d) => `- [${d.id}] ${d.title} (${d.documentType})`).join("\n")}` : "",
    ].filter(Boolean);
    return { text: sections.length ? asSource("search", q, sections.join("\n\n")) : `Nothing in tasks, meetings, wiki or documents matches "${q}".` };
  },
});

const getMeetingTool = tool({
  name: "get_meeting",
  description: "One meeting's notes: summary, decisions, action items, and the notes text. Pass the meeting id from search_project or project_overview.",
  input_schema: obj({ meetingId: { type: "string" } }, ["meetingId"]),
  schema: z.object({ meetingId: z.string().min(1).max(60) }).strict(),
  status: "Reading meeting notes",
  async run(scope, { meetingId }) {
    const { getMeeting } = await import("@/server/meetings");
    const m = await getMeeting(scope.user.workspaceId, meetingId);
    if (!m || m.clientId !== scope.client.id) return { text: "No meeting with that id on this client.", isError: true };
    const decisions = Array.isArray(m.decisions) ? (m.decisions as unknown[]).filter((d): d is string => typeof d === "string") : [];
    const body = [
      `${m.title} · ${day(m.startedAt)}`,
      m.summary ? `Summary:\n${m.summary}` : "",
      decisions.length ? `Decisions:\n${decisions.map((d) => `- ${d}`).join("\n")}` : "",
      m.actionItems.length ? `Action items:\n${m.actionItems.map((a) => `- [${a.done ? "x" : " "}] ${a.text}`).join("\n")}` : "",
      m.transcriptText ? `Notes:\n${m.transcriptText.slice(0, 3500)}` : "",
    ].filter(Boolean);
    return {
      text: asSource("meeting", m.id, body.join("\n\n")),
      sources: [{ kind: "meeting", id: m.id, label: `${m.title} (${day(m.startedAt)})`, href: `/app/portal/${scope.client.slug}` }],
    };
  },
});

const getWikiPage = tool({
  name: "get_wiki_page",
  description: "One page of this client's wiki (runbook, architecture, API docs and so on). Pass its id from search_project.",
  input_schema: obj({ pageId: { type: "string" } }, ["pageId"]),
  schema: z.object({ pageId: z.string().min(1).max(60) }).strict(),
  status: "Reading the wiki",
  async run(scope, { pageId }) {
    const page = await prisma.clientWikiPage.findFirst({
      where: { id: pageId, wiki: { clientId: scope.client.id } },
      select: { id: true, title: true, content: true },
    });
    if (!page) return { text: "No wiki page with that id on this client.", isError: true };
    const text = typeof page.content === "string" ? page.content : textOf(page.content).join("\n");
    return {
      text: asSource("wiki", page.id, `${page.title}\n\n${text || "(empty)"}`),
      sources: [{ kind: "wiki", id: page.id, label: page.title, href: `/app/portal/${scope.client.slug}/wiki` }],
    };
  },
});

const getDocument = tool({
  name: "get_document",
  description: "The text of one of this client's documents (handover, brief, report, proposal if allowed). Pass its id.",
  input_schema: obj({ documentId: { type: "string" } }, ["documentId"]),
  schema: z.object({ documentId: z.string().min(1).max(60) }).strict(),
  status: "Reading the document",
  async run(scope, { documentId }) {
    const { documentScopeWhere } = await import("@/server/mcp/document-scope");
    const doc = await prisma.document.findFirst({
      where: {
        AND: [
          { id: documentId, workspaceId: scope.user.workspaceId, clientId: scope.client.id, documentType: { in: scope.documentTypes } },
          await documentScopeWhere(scope.user),
        ],
      },
      select: {
        id: true,
        title: true,
        documentType: true,
        sections: { where: { isVisible: true }, orderBy: { sortOrder: "asc" }, select: { key: true, title: true, data: true } },
      },
    });
    if (!doc) return { text: "No document with that id that you can open on this client.", isError: true };
    const { canViewCosts } = await import("@/server/auth/effective-user");
    const showPrices = canViewCosts(scope.user);
    let hidden = 0;
    const body = doc.sections
      .filter((s) => {
        const priced = PRICE_SECTION.test(s.key) || PRICE_SECTION.test(s.title);
        if (priced && !showPrices) hidden++;
        return showPrices || !priced;
      })
      .map((s) => `## ${s.title}\n${textOf(s.data).join("\n")}`)
      .join("\n\n");
    return {
      text: asSource("document", doc.id, `${doc.title} (${doc.documentType})\n\n${body}${hidden ? `\n\n(${hidden} pricing section${hidden === 1 ? "" : "s"} hidden)` : ""}`),
      sources: [{ kind: "document", id: doc.id, label: doc.title, href: `/app/docs/${doc.id}` }],
    };
  },
});

const listReleasesTool = tool({
  name: "list_releases",
  description: "This client's releases: version, dates, how many tasks and how many are done. Use for release notes and planning.",
  input_schema: obj({}),
  schema: z.object({}).strict(),
  status: "Looking at releases",
  async run(scope) {
    const { listReleases } = await import("@/server/releases");
    const rels = await listReleases(scope.user, scope.client.id);
    if (!rels.length) return { text: "This client has no releases set up." };
    return {
      text: asSource(
        "releases",
        scope.client.slug,
        rels
          .map((r) => `- [${r.id}] ${r.version}${r.name ? ` ${r.name}` : ""}: ${r.doneCount}/${r.taskCount} done${r.startDate ? `, ${day(r.startDate)}` : ""}${r.endDate ? ` to ${day(r.endDate)}` : ""}`)
          .join("\n"),
      ),
    };
  },
});

const releaseTasks = tool({
  name: "release_tasks",
  description: "Every task in one release, done and open. Pass the release version (e.g. v2.0.0) or id. Use for release notes and release prep.",
  input_schema: obj({ release: { type: "string" } }, ["release"]),
  schema: z.object({ release: z.string().min(1).max(80) }).strict(),
  status: "Reading the release",
  async run(scope, { release }) {
    const { listReleases } = await import("@/server/releases");
    const { findReleaseByVersion } = await import("@/lib/tasks/releases");
    const rels = await listReleases(scope.user, scope.client.id);
    const rel = rels.find((r) => r.id === release) ?? findReleaseByVersion(rels, release);
    if (!rel) return { text: `No release "${release}" on this client.`, isError: true };
    const { listTasks } = await import("@/server/tasks");
    const tasks = (await listTasks(scope.user, { clientId: scope.client.id, limit: 500 })).filter((t) => t.release?.id === rel.id);
    return {
      text: asSource("release", rel.version, `${rel.version}${rel.name ? ` ${rel.name}` : ""}\n${tasks.map(taskLine).join("\n") || "No tasks."}`),
      sources: [{ kind: "release", id: rel.id, label: rel.version }],
    };
  },
});

async function clientDrive(scope: DispatchScope) {
  const [client, user] = await Promise.all([
    prisma.workspaceClient.findFirst({ where: { id: scope.client.id }, select: { googleDriveFolderUrl: true } }),
    prisma.user.findUnique({ where: { id: scope.user.id }, select: { googleOAuthRefreshToken: true } }),
  ]);
  const { driveFolderIdFromUrl } = await import("@/lib/client-drive");
  const rootId = driveFolderIdFromUrl(client?.googleDriveFolderUrl?.trim() || null);
  if (!rootId) return { error: "This client has no Google Drive folder linked." } as const;
  if (!user?.googleOAuthRefreshToken) return { error: "Your Google account isn't connected to Foundry, so I can't read Drive for you." } as const;
  const { googleClientForRefreshToken } = await import("@/server/google-auth");
  const auth = googleClientForRefreshToken(user.googleOAuthRefreshToken);
  if (!auth) return { error: "Google isn't set up on this server." } as const;
  const drive = google.drive({ version: "v3", auth });
  const { readRoot } = await import("@/server/client-drive");
  // Read with the asker's OWN Google account, so Drive's sharing decides what they see.
  const root = await readRoot(drive, rootId).catch(() => null);
  if (!root) return { error: "Your Google account can't open this client's Drive folder." } as const;
  return { drive, root } as const;
}

const searchDrive = tool({
  name: "search_drive",
  description: "Search the client's Google Drive folder (and its subfolders) for files whose name or text matches. Read with the asker's own Google account.",
  input_schema: obj({ query: { type: "string" } }, ["query"]),
  schema: z.object({ query: z.string().min(1).max(120) }).strict(),
  status: "Searching Drive",
  async run(scope, { query }) {
    const d = await clientDrive(scope);
    if ("error" in d) return { text: d.error ?? "Drive isn't available.", isError: true };
    const { walkFolders } = await import("@/server/client-drive");
    const { isScreenshotName } = await import("@/lib/client-drive");
    const { folders } = await walkFolders(d.drive, d.root, isScreenshotName);
    const q = query.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    const ids = [...folders.keys()];
    const hits: { id: string; name: string; modifiedTime?: string | null }[] = [];
    for (let i = 0; i < ids.length && hits.length < 10; i += 40) {
      const parents = ids.slice(i, i + 40).map((id) => `'${id}' in parents`).join(" or ");
      const res = await d.drive.files.list({
        q: `(${parents}) and trashed = false and mimeType != 'application/vnd.google-apps.folder' and (name contains '${q}' or fullText contains '${q}')`,
        fields: "files(id,name,modifiedTime)",
        pageSize: 10,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });
      for (const f of res.data.files ?? []) if (f.id && f.name) hits.push({ id: f.id, name: f.name, modifiedTime: f.modifiedTime });
    }
    if (!hits.length) return { text: `No Drive files match "${query}".` };
    return {
      text: asSource("drive", "search", hits.slice(0, 10).map((f) => `- [${f.id}] ${f.name}${f.modifiedTime ? ` (edited ${day(f.modifiedTime)})` : ""}`).join("\n")),
      sources: hits.slice(0, 5).map((f) => ({ kind: "drive" as const, id: f.id, label: f.name, href: `https://drive.google.com/open?id=${f.id}` })),
    };
  },
});

const DRIVE_TEXT_EXPORTS: Record<string, string> = {
  "application/vnd.google-apps.document": "text/plain",
  "application/vnd.google-apps.spreadsheet": "text/csv",
  "application/vnd.google-apps.presentation": "text/plain",
};

const readDriveFile = tool({
  name: "read_drive_file",
  description: "Read the text of a Drive file in the client's folder: Google Docs, Sheets (as CSV), Slides, and plain text or Markdown files. Pass its id from search_drive.",
  input_schema: obj({ fileId: { type: "string" } }, ["fileId"]),
  schema: z.object({ fileId: z.string().min(5).max(100) }).strict(),
  status: "Reading the Drive file",
  codeSized: true,
  async run(scope, { fileId }) {
    const d = await clientDrive(scope);
    if ("error" in d) return { text: d.error ?? "Drive isn't available.", isError: true };
    const meta = await d.drive.files
      .get({ fileId, fields: "id,name,mimeType,parents,size", supportsAllDrives: true })
      .then((r) => r.data)
      .catch(() => null);
    const parent = meta?.parents?.[0];
    if (!meta || !parent) return { text: "Can't open that file.", isError: true };
    const { crumbsTo } = await import("@/server/client-drive");
    // Only files under the client's folder, never anything else the asker's account can see.
    if (!(await crumbsTo(d.drive, d.root, parent))) return { text: "That file isn't in this client's Drive folder.", isError: true };
    const mime = meta.mimeType ?? "";
    let text: string | null = null;
    if (DRIVE_TEXT_EXPORTS[mime]) {
      const res = await d.drive.files.export({ fileId, mimeType: DRIVE_TEXT_EXPORTS[mime] }, { responseType: "text" });
      text = String(res.data ?? "");
    } else if (/^text\/|json|markdown|csv|xml|yaml/.test(mime) && Number(meta.size ?? 0) < 2_000_000) {
      const res = await d.drive.files.get({ fileId, alt: "media", supportsAllDrives: true }, { responseType: "text" });
      text = String(res.data ?? "");
    }
    if (text === null) return { text: `I can't read the contents of ${meta.name} (${mime || "unknown type"}). Open it in Drive.` };
    return {
      text: asSource("drive", fileId, `${meta.name}\n\n${text}`),
      sources: [{ kind: "drive", id: fileId, label: meta.name ?? "Drive file", href: `https://drive.google.com/open?id=${fileId}` }],
    };
  },
});

const readSlack = tool({
  name: "read_slack",
  description: "Recent messages in this client's internal Gitwork Slack channel (never the shared channel with the client). Optional days back (default 7) and words to look for.",
  input_schema: obj({ days: { type: "number" }, query: { type: "string" } }),
  schema: z.object({ days: z.number().int().min(1).max(60).optional(), query: z.string().max(120).optional() }).strict(),
  status: "Reading the team's Slack channel",
  async run(scope, { days, query }) {
    const [ws, client] = await Promise.all([
      prisma.workspace.findUnique({ where: { id: scope.user.workspaceId }, select: { slackBotToken: true, slackBotTokenEncrypted: true } }),
      prisma.workspaceClient.findFirst({
        where: { id: scope.client.id },
        select: { slackInternalChannelId: true, slackChannelId: true, slackInternalChannelName: true },
      }),
    ]);
    const { getSlackBotToken } = await import("@/server/slack/client");
    const { readSlackChannel } = await import("@/server/slack-channel-updates");
    const read = await readSlackChannel({
      botToken: getSlackBotToken(ws),
      channelId: client?.slackInternalChannelId ?? client?.slackChannelId,
      fallbackName: client?.slackInternalChannelName,
      limit: 120,
    });
    if (!read.ok) {
      const why = {
        no_token: "Slack isn't connected to Foundry.",
        no_channel: "This client has no internal Slack channel linked.",
        not_in_channel: "The Foundry bot isn't in this client's Slack channel.",
        slack_error: "Slack didn't answer just now.",
      }[read.reason];
      return { text: `I couldn't read Slack: ${why}` };
    }
    const since = Date.now() - (days ?? 7) * DAY_MS;
    const q = query?.trim().toLowerCase();
    const msgs = read.messages.filter((m) => new Date(m.ts).getTime() >= since && (!q || m.text.toLowerCase().includes(q)));
    if (!msgs.length) return { text: `No messages in #${read.channelName ?? "the channel"} in the last ${days ?? 7} days${q ? ` mentioning "${query}"` : ""}.` };
    return {
      text: asSource("slack", read.channelName ?? "channel", msgs.slice(-60).map((m) => `${day(m.ts)} ${m.author}: ${m.text}`).join("\n")),
      sources: [{ kind: "slack", id: client?.slackInternalChannelId ?? "slack", label: `#${read.channelName ?? "slack"}` }],
    };
  },
});

// ─── Proposals (change nothing until confirmed) ──────────────────────────────

const statusEnum = z.enum(TASK_STATUSES as [string, ...string[]]);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.");

const newTaskSchema = z
  .object({
    title: z.string().min(1).max(200),
    description: z.string().max(5000).optional(),
    acceptanceCriteria: z.string().max(5000).optional(),
    assignToMe: z.boolean(),
    suggestedOwner: z.string().max(80).optional(),
    dueDate: isoDate.optional(),
    status: statusEnum.optional(),
    estimateHours: z.number().min(0).max(1000).optional(),
  })
  .strict();

const newTaskProps = {
  title: { type: "string" },
  description: { type: "string" },
  acceptanceCriteria: { type: "string" },
  assignToMe: { type: "boolean", description: "true: the asker. false: unassigned. Never anyone else." },
  suggestedOwner: { type: "string", description: "Who you'd suggest (a name), shown to the asker, not set." },
  dueDate: { type: "string", description: "YYYY-MM-DD" },
  status: { type: "string", enum: [...TASK_STATUSES] },
  estimateHours: { type: "number" },
};

const proposeTasks = tool({
  name: "propose_tasks",
  description: `Propose new tasks on this client (at most ${MAX_PROPOSED_TASKS}). Each is assigned to the asker or left unassigned; put who you'd suggest in suggestedOwner. Check for duplicates with find_tasks first. Nothing is created until the asker confirms.`,
  input_schema: obj({ tasks: { type: "array", items: obj(newTaskProps, ["title", "assignToMe"]) } }, ["tasks"]),
  schema: z.object({ tasks: z.array(newTaskSchema).min(1).max(MAX_PROPOSED_TASKS) }).strict(),
  status: "Preparing tasks for you to confirm",
  async run(scope, { tasks }, ctx) {
    const payload = {
      tasks: tasks.map((t) => ({ ...t, assigneeIds: assigneesForNewTask(t.assignToMe, scope.user.id) })),
    };
    return proposeAction(scope, ctx, "create_tasks", payload, {
      title: `Create ${tasks.length} task${tasks.length === 1 ? "" : "s"} on ${scope.client.name}`,
      lines: tasks.map(
        (t) =>
          `${t.title} · ${t.assignToMe ? "you" : "unassigned"}${t.suggestedOwner ? ` (suggested: ${t.suggestedOwner})` : ""}${t.dueDate ? ` · due ${t.dueDate}` : ""}`,
      ),
    });
  },
});

const proposeSubtasks = tool({
  name: "propose_subtasks",
  description: "Propose subtasks under a task the asker owns or nobody owns. Nothing is created until they confirm.",
  input_schema: obj({ parentTask: { type: "string", description: "Task id or #REF." }, subtasks: { type: "array", items: obj(newTaskProps, ["title", "assignToMe"]) } }, ["parentTask", "subtasks"]),
  schema: z.object({ parentTask: z.string().min(1).max(60), subtasks: z.array(newTaskSchema).min(1).max(MAX_PROPOSED_TASKS) }).strict(),
  status: "Preparing subtasks for you to confirm",
  async run(scope, { parentTask, subtasks }, ctx) {
    const found = await findTask(scope, parentTask);
    if (typeof found === "string") return { text: found, isError: true };
    const facts = await taskFacts(scope, found.id);
    const refusal = facts ? mayChangeTask(facts, scope.user.id, scope.client.id) : "Task not found.";
    if (refusal) return { text: refusal, isError: true };
    return proposeAction(
      scope,
      ctx,
      "create_subtasks",
      { parentId: found.id, tasks: subtasks.map((t) => ({ ...t, assigneeIds: assigneesForNewTask(t.assignToMe, scope.user.id) })) },
      { title: `Add ${subtasks.length} subtask${subtasks.length === 1 ? "" : "s"} to \u201c${facts!.title}\u201d`, lines: subtasks.map((t) => t.title) },
    );
  },
});

const proposeTaskUpdate = tool({
  name: "propose_task_update",
  description:
    "Propose changes to a task the asker owns or nobody owns: status, due date, title, description, acceptance criteria. takeIt: true assigns an unassigned task to the asker. Can't reassign or change other people's tasks.",
  input_schema: obj(
    {
      task: { type: "string" },
      status: { type: "string", enum: [...TASK_STATUSES] },
      dueDate: { type: "string", description: "YYYY-MM-DD" },
      title: { type: "string" },
      description: { type: "string" },
      acceptanceCriteria: { type: "string" },
      takeIt: { type: "boolean" },
    },
    ["task"],
  ),
  schema: z
    .object({
      task: z.string().min(1).max(60),
      status: statusEnum.optional(),
      dueDate: isoDate.optional(),
      title: z.string().min(1).max(200).optional(),
      description: z.string().max(5000).optional(),
      acceptanceCriteria: z.string().max(5000).optional(),
      takeIt: z.boolean().optional(),
    })
    .strict(),
  status: "Preparing a change for you to confirm",
  async run(scope, input, ctx) {
    const found = await findTask(scope, input.task);
    if (typeof found === "string") return { text: found, isError: true };
    const facts = await taskFacts(scope, found.id);
    if (!facts) return { text: "Task not found.", isError: true };
    const refusal = mayChangeTask(facts, scope.user.id, scope.client.id);
    if (refusal) return { text: refusal, isError: true };
    const { task: _t, ...patch } = input;
    void _t;
    const lines = Object.entries(patch)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => (k === "takeIt" ? "Assign it to you" : `${k}: ${String(v).slice(0, 120)}`));
    if (!lines.length) return { text: "Nothing to change.", isError: true };
    return proposeAction(scope, ctx, "update_task", { taskId: found.id, ...patch }, { title: `Update \u201c${facts.title}\u201d`, lines });
  },
});

const proposeComment = tool({
  name: "propose_comment",
  description: "Propose an internal comment on any task on this client (the team sees it, the client doesn't). Use to note a duplicate client report on an existing task.",
  input_schema: obj({ task: { type: "string" }, body: { type: "string" } }, ["task", "body"]),
  schema: z.object({ task: z.string().min(1).max(60), body: z.string().min(1).max(4000) }).strict(),
  status: "Preparing a comment for you to confirm",
  async run(scope, { task, body }, ctx) {
    const found = await findTask(scope, task);
    if (typeof found === "string") return { text: found, isError: true };
    const facts = await taskFacts(scope, found.id);
    const refusal = facts ? mayAnnotateTask(facts, scope.client.id) : "Task not found.";
    if (refusal) return { text: refusal, isError: true };
    return proposeAction(scope, ctx, "comment", { taskId: found.id, body }, { title: `Comment on \u201c${facts!.title}\u201d`, lines: [body.slice(0, 280)] });
  },
});

const proposeFlag = tool({
  name: "propose_flag",
  description: "Propose flagging a task on this client for follow-up (with a short note), or clearing its flag. The team sees flags.",
  input_schema: obj({ task: { type: "string" }, flagged: { type: "boolean" }, note: { type: "string" } }, ["task", "flagged"]),
  schema: z.object({ task: z.string().min(1).max(60), flagged: z.boolean(), note: z.string().max(500).optional() }).strict(),
  status: "Preparing a flag for you to confirm",
  async run(scope, { task, flagged, note }, ctx) {
    const found = await findTask(scope, task);
    if (typeof found === "string") return { text: found, isError: true };
    const facts = await taskFacts(scope, found.id);
    const refusal = facts ? mayAnnotateTask(facts, scope.client.id) : "Task not found.";
    if (refusal) return { text: refusal, isError: true };
    return proposeAction(scope, ctx, "flag", { taskId: found.id, flagged, note: note ?? null }, {
      title: `${flagged ? "Flag" : "Clear the flag on"} \u201c${facts!.title}\u201d`,
      lines: note ? [note] : [],
    });
  },
});

const proposeSlackPost = tool({
  name: "propose_slack_post",
  description: "Propose a message to this client's INTERNAL Gitwork Slack channel, posted as Dispatch on the asker's behalf. Never the channel shared with the client.",
  input_schema: obj({ text: { type: "string" } }, ["text"]),
  schema: z.object({ text: z.string().min(1).max(3000) }).strict(),
  status: "Preparing a Slack post for you to confirm",
  async run(scope, { text }, ctx) {
    const client = await prisma.workspaceClient.findFirst({
      where: { id: scope.client.id },
      select: { slackInternalChannelId: true, slackChannelId: true, slackInternalChannelName: true },
    });
    const channel = client?.slackInternalChannelId ?? client?.slackChannelId;
    if (!channel) return { text: "This client has no internal Slack channel linked.", isError: true };
    return proposeAction(scope, ctx, "slack_post", { channelId: channel, text }, {
      title: `Post in #${client?.slackInternalChannelName ?? "the team channel"}`,
      lines: [text.slice(0, 400)],
    });
  },
});

// ─── Registry ───────────────────────────────────────────────────────────────

/** Fixed order: the tool list is part of the cached prefix, so it must never reorder. */
export const DISPATCH_TOOLS: readonly DispatchTool[] = [
  projectOverview,
  myWork,
  findTasks,
  getTaskTool,
  searchProject,
  getMeetingTool,
  getWikiPage,
  getDocument,
  listReleasesTool,
  releaseTasks,
  searchDrive,
  readDriveFile,
  readSlack,
  proposeTasks,
  proposeSubtasks,
  proposeTaskUpdate,
  proposeComment,
  proposeFlag,
  proposeSlackPost,
  // Appended after the first release: the list is part of the cached prefix, so new tools go
  // at the end and nothing above moves.
  ...CODE_TOOLS,
  ...DESIGN_TOOLS,
];

const BY_NAME = new Map(DISPATCH_TOOLS.map((t) => [t.name, t]));

/** The tool definitions sent to the model. Identical for every person and client. */
export function toolDefinitions() {
  return DISPATCH_TOOLS.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema }));
}

export function toolStatus(name: string): string {
  return BY_NAME.get(name)?.status ?? "Working";
}

/**
 * Run one tool call as the asker. Re-checks access first, validates the input, and always
 * returns text (errors included) so the model can recover; never throws to the loop.
 */
export async function runTool(
  scope: DispatchScope,
  name: string,
  input: unknown,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const t = BY_NAME.get(name);
  if (!t) return { text: `There is no tool called ${name}.`, isError: true };
  try {
    await assertStillAllowed(scope.user, scope.client.id);
    const parsed = t.schema.safeParse(input ?? {});
    if (!parsed.success) {
      return { text: `That input wasn't right: ${parsed.error.issues.map((i) => `${i.path.join(".") || "input"} ${i.message}`).join("; ")}`, isError: true };
    }
    const out = await t.run(scope, parsed.data, ctx);
    return { ...out, text: finaliseToolText(out.text, { canSeeMoney: scope.canSeeMoney, cap: t.codeSized ? CODE_CHAR_CAP : RESULT_CHAR_CAP }) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Something went wrong.";
    return { text: `That didn't work: ${msg}`, isError: true };
  }
}
