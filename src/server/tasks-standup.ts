// Daily standups + DevOps roll-up.
//
// Devs push an AM "Doing" (+ Monday "This week") and a PM "Done" update; each
// posts to the involved clients' internal Slack channels. The DevOps lead
// (tasks.publish) publishes one consolidated roll-up to the master channel once
// everyone's pushed. Slack posting is best-effort/fire-and-forget — a missing
// token or channel never fails the request (mirrors onboarding-notify.ts).

import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import {
  type EffectiveUser,
  assertCanPublishTaskRollup,
} from "@/server/auth/effective-user";
import { listTasks } from "@/server/tasks";
import { TEAM_ROSTER } from "@/server/team-roster";
import type {
  TaskDTO,
  MyDayDTO,
  DailyUpdateDTO,
  RollupRosterDTO,
  RollupDevStatus,
} from "@/types/tasks";

// Roll-up denominator = workspace members on the canonical dev roster — a stable
// count, independent of who currently holds assigned tasks.
const DEV_EMAILS = new Set(
  TEAM_ROSTER.filter((e) => e.kind === "dev").map((e) => e.email.toLowerCase()),
);

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

// ─── Date helpers (all UTC) ─────────────────────────────────────────────────

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function parseWorkDate(dateStr?: string): Date {
  const base = dateStr ? new Date(dateStr) : new Date();
  return startOfUtcDay(base);
}

function nextUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1));
}

/** Monday (inclusive) → next Monday (exclusive) for the week containing `d`. */
function isoWeekRange(d: Date): { start: Date; end: Date } {
  const day = d.getUTCDay(); // 0 Sun … 6 Sat
  const sinceMonday = (day + 6) % 7;
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - sinceMonday));
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + 7));
  return { start, end };
}

function isMonday(d: Date): boolean {
  return d.getUTCDay() === 1;
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ─── Task partitioning ──────────────────────────────────────────────────────

function isDoneOn(task: TaskDTO, workDate: Date): boolean {
  if (task.status !== "DONE" || !task.completedAt) return false;
  const c = new Date(task.completedAt);
  return c >= workDate && c < nextUtcDay(workDate);
}

function partition(tasks: TaskDTO[], workDate: Date) {
  const doing = tasks.filter((t) => t.status === "DOING" || t.status === "IN_REVIEW");
  const done = tasks.filter((t) => isDoneOn(t, workDate));
  const upcoming = tasks.filter((t) => t.status === "TODO" || t.status === "BACKLOG");
  return { doing, done, upcoming };
}

function dueThisWeek(tasks: TaskDTO[], workDate: Date): TaskDTO[] {
  const { start, end } = isoWeekRange(workDate);
  return tasks.filter((t) => {
    if (t.status === "DONE" || !t.dueDate) return false;
    const due = new Date(t.dueDate);
    return due >= start && due < end;
  });
}

function suggestWeekPlan(tasks: TaskDTO[], workDate: Date): string {
  const due = dueThisWeek(tasks, workDate);
  if (due.length === 0) return "";
  return due.map((t) => `• ${t.title} (${t.client.name})`).join("\n");
}

// ─── DTO mapping ────────────────────────────────────────────────────────────

type DailyUpdateRow = {
  id: string;
  workDate: Date;
  amPushedAt: Date | null;
  pmPushedAt: Date | null;
  weekPlan: string | null;
  note: string | null;
};

function updateToDTO(row: DailyUpdateRow | null, workDate: Date): DailyUpdateDTO {
  return {
    id: row?.id ?? null,
    workDate: workDate.toISOString(),
    amPushedAt: row?.amPushedAt ? row.amPushedAt.toISOString() : null,
    pmPushedAt: row?.pmPushedAt ? row.pmPushedAt.toISOString() : null,
    weekPlan: row?.weekPlan ?? null,
    note: row?.note ?? null,
  };
}

// ─── My Day ─────────────────────────────────────────────────────────────────

export async function getMyDay(user: EffectiveUser, dateStr?: string): Promise<MyDayDTO> {
  await ensureBaseRecords();
  const workDate = parseWorkDate(dateStr);

  const tasks = await listTasks(user, { assigneeId: "me" });
  const { doing, done, upcoming } = partition(tasks, workDate);

  const row = await prisma.dailyUpdate.findUnique({
    where: { userId_workDate: { userId: user.id, workDate } },
  });

  return {
    date: workDate.toISOString(),
    isMonday: isMonday(workDate),
    update: updateToDTO(row, workDate),
    suggestedWeekPlan: suggestWeekPlan(tasks, workDate),
    doing,
    done,
    upcoming,
  };
}

// ─── Slack plumbing ─────────────────────────────────────────────────────────

async function postSlack(botToken: string, channel: string, text: string): Promise<void> {
  try {
    await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Authorization: `Bearer ${botToken}`,
      },
      body: JSON.stringify({ channel, text, unfurl_links: false, unfurl_media: false }),
    });
  } catch {
    // Best-effort — never throw out of a standup push.
  }
}

function bullet(tasks: TaskDTO[]): string {
  return tasks.map((t) => `• ${t.title}`).join("\n");
}

// ─── Push a daily update ────────────────────────────────────────────────────

export async function pushDailyUpdate(
  user: EffectiveUser,
  input: { phase: "AM" | "PM"; weekPlan?: string; note?: string },
): Promise<DailyUpdateDTO> {
  await ensureBaseRecords();
  const workDate = parseWorkDate();
  const now = new Date();

  // For the EOD "all-in" nudge: was this dev's PM already in before this push?
  const prior =
    input.phase === "PM"
      ? await prisma.dailyUpdate.findUnique({
          where: { userId_workDate: { userId: user.id, workDate } },
          select: { pmPushedAt: true },
        })
      : null;

  // Persist the push log + editable fields.
  const phaseField = input.phase === "AM" ? { amPushedAt: now } : { pmPushedAt: now };
  const row = await prisma.dailyUpdate.upsert({
    where: { userId_workDate: { userId: user.id, workDate } },
    create: {
      workspaceId: user.workspaceId,
      userId: user.id,
      workDate,
      ...phaseField,
      weekPlan: input.weekPlan ?? null,
      note: input.note ?? null,
    },
    update: {
      ...phaseField,
      ...(input.weekPlan !== undefined ? { weekPlan: input.weekPlan } : {}),
      ...(input.note !== undefined ? { note: input.note } : {}),
    },
  });

  // Build + post the Slack messages from live task state. Best-effort.
  void postStandupToSlack(user, workDate, input).catch((err) =>
    console.error("[tasks] standup Slack post failed", err),
  );

  // If this PM push is the one that completes the whole dev roster, nudge the lead once.
  if (input.phase === "PM" && !prior?.pmPushedAt) {
    void maybePingAllIn(user.workspaceId, workDate).catch((err) =>
      console.error("[tasks] all-in ping failed", err),
    );
  }

  return updateToDTO(row, workDate);
}

async function postStandupToSlack(
  user: EffectiveUser,
  workDate: Date,
  input: { phase: "AM" | "PM"; weekPlan?: string; note?: string },
): Promise<void> {
  const ws = await prisma.workspace.findUnique({
    where: { id: user.workspaceId },
    select: { slackBotToken: true },
  });
  const botToken = ws?.slackBotToken?.trim();
  if (!botToken) return;

  const tasks = await listTasks(user, { assigneeId: "me" });
  const { doing, done } = partition(tasks, workDate);
  const sectionTasks = input.phase === "AM" ? doing : done;
  if (sectionTasks.length === 0 && !(input.phase === "AM" && isMonday(workDate) && input.weekPlan)) {
    return; // nothing to say
  }

  // Resolve each involved client's internal channel.
  const clientIds = Array.from(new Set(sectionTasks.map((t) => t.client.id)));
  const clients = await prisma.workspaceClient.findMany({
    where: { workspaceId: user.workspaceId, id: { in: clientIds } },
    select: { id: true, slackChannelId: true },
  });
  const channelByClient = new Map(clients.map((c) => [c.id, c.slackChannelId]));

  const who = user.name?.trim() || user.email;
  const note = input.note?.trim() ? `\n:memo: ${input.note.trim()}` : "";

  for (const clientId of clientIds) {
    const channel = channelByClient.get(clientId);
    if (!channel) continue;
    const mine = sectionTasks.filter((t) => t.client.id === clientId);

    let text: string;
    if (input.phase === "AM") {
      const weekday = WEEKDAYS[workDate.getUTCDay()];
      const doingBlock = mine.length ? `\n*Doing*\n${bullet(mine)}` : "";
      const weekBlock =
        isMonday(workDate) && input.weekPlan?.trim()
          ? `\n*This week*\n${input.weekPlan.trim()}`
          : "";
      text = `:large_yellow_circle: *${who}* — standup (${weekday} ${ymd(workDate)})${doingBlock}${weekBlock}${note}`;
      if (!doingBlock && !weekBlock) continue;
    } else {
      text = `:white_check_mark: *${who}* — done today (${ymd(workDate)})\n*Done*\n${bullet(mine)}${note}`;
    }
    await postSlack(botToken, channel, text);
  }
}

/** One-off nudge to the roll-up channel the moment every dev's PM update is in. */
async function maybePingAllIn(workspaceId: string, workDate: Date): Promise<void> {
  const devIds = await getDeveloperUserIds(workspaceId);
  if (devIds.length === 0) return;
  const pushed = await prisma.dailyUpdate.count({
    where: { workspaceId, workDate, userId: { in: devIds }, pmPushedAt: { not: null } },
  });
  if (pushed < devIds.length) return; // not everyone in yet

  const ws = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { slackBotToken: true, channelRoutes: true, slackSummaryChannelId: true },
  });
  const botToken = ws?.slackBotToken?.trim();
  const routes = (ws?.channelRoutes as Record<string, string> | null) ?? null;
  const channel = routes?.["tasks.rollup"] ?? ws?.slackSummaryChannelId ?? null;
  if (!botToken || !channel) return;
  await postSlack(
    botToken,
    channel,
    `:tada: *All ${devIds.length} developers have posted their end-of-day update.* The daily roll-up is ready to publish.`,
  );
}

// ─── DevOps roll-up ─────────────────────────────────────────────────────────

/** Roll-up denominator: workspace members on the dev roster (assignment-independent). */
async function getDeveloperUserIds(workspaceId: string): Promise<string[]> {
  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId },
    select: { userId: true, user: { select: { email: true } } },
  });
  return members.filter((m) => DEV_EMAILS.has(m.user.email.toLowerCase())).map((m) => m.userId);
}

/** Tally how many of `tasks` each dev (in devIds) is assigned to (m-n + legacy). */
function tallyByAssignee(
  tasks: { assigneeId: string | null; assignees: { id: string }[] }[],
  devIds: string[],
): Map<string, number> {
  const devSet = new Set(devIds);
  const counts = new Map<string, number>();
  for (const t of tasks) {
    const ids = new Set<string>(t.assignees.map((a) => a.id));
    if (t.assigneeId) ids.add(t.assigneeId);
    for (const id of ids) if (devSet.has(id)) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

export async function getRollupRoster(user: EffectiveUser): Promise<RollupRosterDTO> {
  assertCanPublishTaskRollup(user);
  await ensureBaseRecords();
  const workDate = parseWorkDate();
  const devIds = await getDeveloperUserIds(user.workspaceId);

  if (devIds.length === 0) {
    return { date: workDate.toISOString(), allPushed: false, devs: [] };
  }

  const assigneeFilter = [
    { assignees: { some: { id: { in: devIds } } } },
    { assigneeId: { in: devIds } },
  ];
  const [users, updates, doingTasks, doneTasks] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: devIds } },
      select: { id: true, name: true, email: true, avatarUrl: true },
    }),
    prisma.dailyUpdate.findMany({
      where: { workspaceId: user.workspaceId, workDate, userId: { in: devIds } },
      select: { userId: true, amPushedAt: true, pmPushedAt: true },
    }),
    prisma.task.findMany({
      where: { workspaceId: user.workspaceId, status: { in: ["DOING", "IN_REVIEW"] }, OR: assigneeFilter },
      select: { assigneeId: true, assignees: { select: { id: true } } },
    }),
    prisma.task.findMany({
      where: {
        workspaceId: user.workspaceId,
        status: "DONE",
        completedAt: { gte: workDate, lt: nextUtcDay(workDate) },
        OR: assigneeFilter,
      },
      select: { assigneeId: true, assignees: { select: { id: true } } },
    }),
  ]);

  const updateByUser = new Map(updates.map((u) => [u.userId, u]));
  const doingByUser = tallyByAssignee(doingTasks, devIds);
  const doneByUser = tallyByAssignee(doneTasks, devIds);

  const devs: RollupDevStatus[] = users
    .map((u) => {
      const up = updateByUser.get(u.id);
      return {
        user: { id: u.id, name: u.name?.trim() || u.email, avatarUrl: u.avatarUrl },
        amPushedAt: up?.amPushedAt ? up.amPushedAt.toISOString() : null,
        pmPushedAt: up?.pmPushedAt ? up.pmPushedAt.toISOString() : null,
        doingCount: doingByUser.get(u.id) ?? 0,
        doneCount: doneByUser.get(u.id) ?? 0,
      };
    })
    .sort((a, b) => a.user.name.localeCompare(b.user.name));

  const allPushed = devs.length > 0 && devs.every((d) => d.pmPushedAt !== null);
  return { date: workDate.toISOString(), allPushed, devs };
}

export async function publishRollup(
  user: EffectiveUser,
  opts: { override?: boolean } = {},
): Promise<{ ok: boolean; channel: string | null; clientCount: number; taskCount: number }> {
  assertCanPublishTaskRollup(user);
  const workDate = parseWorkDate();

  const roster = await getRollupRoster(user);
  if (!roster.allPushed && !opts.override) {
    const err = new Error("Not all developers have pushed their end-of-day update yet.");
    (err as unknown as { status: number }).status = 409;
    throw err;
  }

  const ws = await prisma.workspace.findUnique({
    where: { id: user.workspaceId },
    select: { slackBotToken: true, channelRoutes: true, slackSummaryChannelId: true },
  });
  const botToken = ws?.slackBotToken?.trim() ?? null;
  const routes = (ws?.channelRoutes as Record<string, string> | null) ?? null;
  const channel = routes?.["tasks.rollup"] ?? ws?.slackSummaryChannelId ?? null;

  // Everything completed today, grouped by client.
  const doneTasks = await prisma.task.findMany({
    where: {
      workspaceId: user.workspaceId,
      status: "DONE",
      completedAt: { gte: workDate, lt: nextUtcDay(workDate) },
    },
    include: {
      client: { select: { name: true } },
      assignee: { select: { name: true, email: true } },
      assignees: { select: { name: true, email: true } },
    },
    orderBy: [{ clientId: "asc" }, { completedAt: "asc" }],
  });

  const byClient = new Map<string, string[]>();
  for (const t of doneTasks) {
    const names = t.assignees.map((a) => a.name?.trim() || a.email);
    if (names.length === 0 && t.assignee) names.push(t.assignee.name?.trim() || t.assignee.email);
    const who = names.length ? names.join(", ") : "Unassigned";
    const line = `• ${t.title} — _${who}_`;
    const arr = byClient.get(t.client.name) ?? [];
    arr.push(line);
    byClient.set(t.client.name, arr);
  }

  if (botToken && channel) {
    const header = `:newspaper: *Daily roll-up — ${ymd(workDate)}*`;
    const body =
      byClient.size === 0
        ? "\n_No tasks were completed today._"
        : "\n" +
          Array.from(byClient.entries())
            .map(([clientName, lines]) => `\n*${clientName}*\n${lines.join("\n")}`)
            .join("\n");
    await postSlack(botToken, channel, `${header}${body}`);
  }

  return {
    ok: true,
    channel,
    clientCount: byClient.size,
    taskCount: doneTasks.length,
  };
}
