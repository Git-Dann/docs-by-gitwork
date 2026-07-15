// Daily standups + DevOps roll-up.
//
// Devs push an AM "Doing" (+ Monday "This week") and a PM "Done" update; each
// posts to the involved clients' internal Slack channels, and to each
// client's linked external (Slack Connect) channel at the same time. The DevOps lead
// (tasks.publish) publishes one consolidated roll-up to the master channel once
// everyone's pushed. Slack posting is best-effort/fire-and-forget — a missing
// token or channel never fails the request (mirrors onboarding-notify.ts).

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import {
  type EffectiveUser,
  assertCanPublishTaskRollup,
} from "@/server/auth/effective-user";
import { listTasks } from "@/server/tasks";
import { getSlackBotToken, postMessage, deleteMessage } from "@/server/slack/client";
import {
  buildRollupCard,
  buildStandupCard,
  buildDailyUpdatesCard,
  type DailyUpdateProject,
  type StandupTaskCardInput,
} from "@/server/slack/blocks";
import { assertDailyUpdateCooldown } from "@/server/slack-cooldown";
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
  const doing = tasks.filter(
    (t) => t.status === "DOING" || t.status === "IN_REVIEW" || t.status === "UI_DONE",
  );
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

// ─── Push a daily update ────────────────────────────────────────────────────

export async function pushDailyUpdate(
  user: EffectiveUser,
  input: { phase: "AM" | "PM"; weekPlan?: string; note?: string },
): Promise<DailyUpdateDTO> {
  await ensureBaseRecords();
  const workDate = parseWorkDate();
  const now = new Date();
  await assertDailyUpdateCooldown(user, { phase: input.phase, workDate });

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

  // Build + post the Slack messages from live task state. Awaited so we can
  // report back how many channels actually received a post (honest UI feedback:
  // a push with nothing to say shouldn't claim "Pushed to Slack"). Best-effort —
  // a Slack failure never fails the request.
  const { posted, failures: slackFailures } = await postStandupToSlack(user, workDate, input).catch(
    (err) => {
      console.error("[tasks] standup Slack post failed", err);
      return { posted: 0, failures: [] as string[] };
    },
  );

  // If this PM push is the one that completes the whole dev roster, nudge the lead once.
  if (input.phase === "PM" && !prior?.pmPushedAt) {
    void maybePingAllIn(user.workspaceId, workDate).catch((err) =>
      console.error("[tasks] all-in ping failed", err),
    );
  }

  return { ...updateToDTO(row, workDate), posted, slackFailures };
}

/** Retract today's standup for a phase: delete the posted Slack messages
 *  (chat.delete, best-effort) and clear the phase timestamp so the dev's pill
 *  resets to un-pushed. Only touches messages this user posted today. */
export async function deleteStandupUpdate(
  user: EffectiveUser,
  phase: "AM" | "PM",
): Promise<DailyUpdateDTO> {
  await ensureBaseRecords();
  const workDate = parseWorkDate();
  const kind = phase === "AM" ? "STANDUP_AM" : "STANDUP_PM";

  const refs = await prisma.slackMessageRef.findMany({
    where: {
      workspaceId: user.workspaceId,
      postedById: user.id,
      kind,
      createdAt: { gte: workDate },
    },
    select: { id: true, channelId: true, messageTs: true },
  });

  if (refs.length > 0) {
    const ws = await prisma.workspace.findUnique({
      where: { id: user.workspaceId },
      select: { slackBotToken: true, slackBotTokenEncrypted: true },
    });
    const botToken = getSlackBotToken(ws);
    if (botToken) {
      await Promise.all(
        refs.map((r) =>
          deleteMessage(botToken, { channel: r.channelId, ts: r.messageTs }).catch(() => undefined),
        ),
      );
    }
    await prisma.slackMessageRef.deleteMany({ where: { id: { in: refs.map((r) => r.id) } } });
  }

  // Clear the phase timestamp so the AM/PM pill flips back to un-pushed.
  const existing = await prisma.dailyUpdate.findUnique({
    where: { userId_workDate: { userId: user.id, workDate } },
  });
  const row = existing
    ? await prisma.dailyUpdate.update({
        where: { userId_workDate: { userId: user.id, workDate } },
        data: phase === "AM" ? { amPushedAt: null } : { pmPushedAt: null },
      })
    : null;

  return updateToDTO(row, workDate);
}

/** Post the standup to each involved client's internal channel, and its linked
 *  external (Slack Connect) channel if one is set. Returns the number of
 *  channels a message was posted to (0 = nothing to say / no channel). */
async function postStandupToSlack(
  user: EffectiveUser,
  workDate: Date,
  input: { phase: "AM" | "PM"; weekPlan?: string; note?: string },
): Promise<{ posted: number; failures: string[] }> {
  const ws = await prisma.workspace.findUnique({
    where: { id: user.workspaceId },
    select: { slackBotToken: true, slackBotTokenEncrypted: true },
  });
  const botToken = getSlackBotToken(ws);
  if (!botToken) return { posted: 0, failures: [] };

  const tasks = await listTasks(user, { assigneeId: "me", includeSubtasks: true });
  const { doing, done } = partition(tasks, workDate);
  const sectionTasks = input.phase === "AM" ? doing : done;

  // Resolve parent titles so an updated subtask reads "Parent → Subtask" in the card
  // (rather than a bare subtask title with no context).
  const parentIds = Array.from(
    new Set(sectionTasks.map((t) => t.parentId).filter((id): id is string => Boolean(id))),
  );
  const parentRows = parentIds.length
    ? await prisma.task.findMany({
        where: { id: { in: parentIds }, workspaceId: user.workspaceId },
        select: { id: true, title: true },
      })
    : [];
  const parentTitleById = new Map(parentRows.map((p) => [p.id, p.title]));
  if (sectionTasks.length === 0 && !(input.phase === "AM" && isMonday(workDate) && input.weekPlan)) {
    return { posted: 0, failures: [] }; // nothing to say
  }

  // Resolve each involved client's channels — prefer the new dual-channel field
  // (slackInternalChannelId), fall back to the legacy single channel. If a
  // Slack Connect external channel is linked, the standup goes out to both at
  // the same time.
  const clientIds = Array.from(new Set(sectionTasks.map((t) => t.client.id)));
  const clients = await prisma.workspaceClient.findMany({
    where: { workspaceId: user.workspaceId, id: { in: clientIds } },
    select: {
      id: true,
      slug: true,
      slackChannelId: true,
      slackInternalChannelId: true,
      slackExternalChannelId: true,
    },
  });
  const channelByClient = new Map(
    clients.map((c) => [c.id, c.slackInternalChannelId ?? c.slackChannelId] as const),
  );
  const externalChannelByClient = new Map(clients.map((c) => [c.id, c.slackExternalChannelId] as const));

  const who = user.name?.trim() || user.email;
  const weekday = WEEKDAYS[workDate.getUTCDay()];
  const workdayLabel = `${weekday} ${ymd(workDate)}`;
  const isMon = isMonday(workDate);

  let postedCount = 0;
  const failures: string[] = [];
  for (const clientId of clientIds) {
    const channel = channelByClient.get(clientId);
    if (!channel) continue;
    const mine = sectionTasks.filter((t) => t.client.id === clientId);
    if (mine.length === 0 && !(input.phase === "AM" && isMon && input.weekPlan?.trim())) {
      continue;
    }

    // Clean list card — no per-task Slack actions, so no SlackMessageRef rows
    // to pre-mint. The single "View board" button covers "open in Foundry".
    // Parents whose own subtasks are in this update — their subtasks render grouped
    // under the parent heading, so we drop the standalone parent line to avoid dupes.
    const parentIdsWithSubs = new Set(
      mine.filter((t) => t.parentId).map((t) => t.parentId as string),
    );
    const cardTasks: StandupTaskCardInput[] = mine
      .filter((t) => !(t.parentId === null && parentIdsWithSubs.has(t.id)))
      .map((t) => ({
        taskId: t.id,
        title: t.title,
        parentTitle: t.parentId ? parentTitleById.get(t.parentId) ?? "Task" : null,
        clientName: t.client.name,
        clientSlug: t.client.slug,
        blockName: t.featureBlock?.name ?? null,
        dueDate: t.dueDate ? t.dueDate.slice(0, 10) : null,
        status: t.status,
        description: t.description,
      }));

    const card = buildStandupCard({
      phase: input.phase,
      who,
      workdayLabel,
      weekPlan: isMon ? input.weekPlan ?? null : null,
      note: input.note ?? null,
      tasks: cardTasks,
    });

    // Post to the internal channel and, when linked, the client's external
    // (Slack Connect) channel at the same time.
    const externalChannel = externalChannelByClient.get(clientId);
    const targets = Array.from(new Set([channel, ...(externalChannel ? [externalChannel] : [])]));

    for (const target of targets) {
      const result = await postMessage(botToken, {
        channel: target,
        text: card.text,
        blocks: card.blocks,
      });
      if (result.ok && result.data.ts) {
        postedCount += 1;
        // Record the posted message so the dev can retract this update later
        // (chat.delete). taskId is null — this is a per-channel standup card, not a
        // per-task ref. Best-effort; a fresh post always has a unique ts.
        await prisma.slackMessageRef
          .create({
            data: {
              workspaceId: user.workspaceId,
              channelId: target,
              messageTs: result.data.ts,
              taskId: null,
              kind: input.phase === "AM" ? "STANDUP_AM" : "STANDUP_PM",
              postedById: user.id,
            },
          })
          .catch(() => undefined);
      } else {
        // Surface the failure instead of swallowing it — the usual culprit is the bot not
        // being a member of a Slack Connect (external) channel ("not_in_channel").
        const reason = result.ok ? "no message ts returned" : result.error || "unknown error";
        const isExternal = target === externalChannel && target !== channel;
        console.error("[standup] Slack post failed", { clientId, target, external: isExternal, reason });
        failures.push(`${isExternal ? "external" : "internal"} channel: ${reason}`);
      }
    }
  }

  // Bump the workspace's lastSlackPostAt diagnostic so the Settings page
  // shows the integration is alive.
  if (postedCount > 0) {
    await prisma.workspace.update({
      where: { id: user.workspaceId },
      data: { lastSlackPostAt: new Date() },
    }).catch(() => undefined);
  }

  return { posted: postedCount, failures: Array.from(new Set(failures)) };
}

/** Short random id for the placeholder messageTs — collision-resistant within the
 *  channel's row count. Replaced with the real Slack ts after chat.postMessage.
 *  Exported so the ad-hoc Slack-push module (slack-updates.ts) reuses the same
 *  placeholder scheme. */
export function cryptoRandomId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** The DevOps roll-up channel: the routed "tasks.rollup" channel, falling back to
 *  the legacy single summary channel. Shared by the standup nudge, publishRollup,
 *  and the ad-hoc broadcast/project-update cross-post. */
export function resolveRollupChannel(
  ws: { channelRoutes: unknown; slackSummaryChannelId: string | null } | null,
): string | null {
  const routes = (ws?.channelRoutes as Record<string, string> | null) ?? null;
  return routes?.["tasks.rollup"] ?? ws?.slackSummaryChannelId ?? null;
}

/** The daily PM-updates channel: the routed "tasks.updates" channel (Settings →
 *  Integrations "Daily PM updates" route). Distinct from the client-grouped
 *  roll-up channel — this is the dev-grouped end-of-day compilation (#updates).
 *  Returns null when unconfigured so the caller can prompt the admin to set it. */
export function resolveUpdatesChannel(
  ws: { channelRoutes: unknown } | null,
): string | null {
  const routes = (ws?.channelRoutes as Record<string, string> | null) ?? null;
  return routes?.["tasks.updates"] ?? null;
}

/** One-off nudge to the roll-up channel the moment every dev's PM update is in.
 *  Exported so an EOD push made via the Tasks-page composer (slack-updates.ts)
 *  also fires the nudge when it completes the roster. */
export async function maybePingAllIn(workspaceId: string, workDate: Date): Promise<void> {
  const devIds = await getDeveloperUserIds(workspaceId);
  if (devIds.length === 0) return;
  const pushed = await prisma.dailyUpdate.count({
    where: { workspaceId, workDate, userId: { in: devIds }, pmPushedAt: { not: null } },
  });
  if (pushed < devIds.length) return; // not everyone in yet

  const ws = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      slackBotToken: true,
      slackBotTokenEncrypted: true,
      channelRoutes: true,
      slackSummaryChannelId: true,
    },
  });
  const botToken = getSlackBotToken(ws);
  const channel = resolveRollupChannel(ws);
  if (!botToken || !channel) return;
  await postMessage(botToken, {
    channel,
    text: `:tada: All ${devIds.length} developers have posted their end-of-day update. The daily roll-up is ready to publish.`,
  });
}

// ─── DevOps roll-up ─────────────────────────────────────────────────────────

/** Roll-up denominator: workspace members on the dev roster (assignment-independent).
 *  Exported so the analytics aggregator can reuse the exact same roster definition. */
export async function getDeveloperUserIds(workspaceId: string): Promise<string[]> {
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
      where: { workspaceId: user.workspaceId, status: { in: ["DOING", "IN_REVIEW", "UI_DONE"] }, OR: assigneeFilter },
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
    select: {
      slackBotToken: true,
      slackBotTokenEncrypted: true,
      channelRoutes: true,
      slackSummaryChannelId: true,
    },
  });
  const botToken = getSlackBotToken(ws);
  const channel = resolveRollupChannel(ws);

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

  // Need slug for the per-client "View board" deep link — re-fetch with client.slug.
  const groups = new Map<string, { clientName: string; clientSlug: string; tasks: { title: string; assignee: string | null; taskId: string }[] }>();
  for (const t of doneTasks) {
    const names = t.assignees.map((a) => a.name?.trim() || a.email);
    if (names.length === 0 && t.assignee) names.push(t.assignee.name?.trim() || t.assignee.email);
    const who = names.length ? names.join(", ") : null;
    const existing = groups.get(t.clientId);
    if (existing) {
      existing.tasks.push({ title: t.title, assignee: who, taskId: t.id });
    } else {
      groups.set(t.clientId, {
        clientName: t.client.name,
        // Slug is needed but our `include` above doesn't pull it; we patch below.
        clientSlug: "",
        tasks: [{ title: t.title, assignee: who, taskId: t.id }],
      });
    }
  }
  if (groups.size > 0) {
    // Resolve slugs in one query.
    const clientRows = await prisma.workspaceClient.findMany({
      where: { id: { in: Array.from(groups.keys()) } },
      select: { id: true, slug: true },
    });
    for (const row of clientRows) {
      const group = groups.get(row.id);
      if (group) group.clientSlug = row.slug;
    }
  }

  if (botToken && channel) {
    const card = buildRollupCard({
      dateLabel: ymd(workDate),
      groups: Array.from(groups.values()),
    });
    await postMessage(botToken, { channel, text: card.text, blocks: card.blocks });
    await prisma.workspace.update({
      where: { id: user.workspaceId },
      data: { lastSlackPostAt: new Date() },
    }).catch(() => undefined);
  }

  return {
    ok: true,
    channel,
    clientCount: groups.size,
    taskCount: doneTasks.length,
  };
}

export type DailyUpdatePhase = "AM" | "PM";

export interface DailyUpdatesResult {
  ok: boolean;
  phase: DailyUpdatePhase;
  channel: string | null;
  configured: boolean;
  devCount: number;
  taskCount: number;
}

/** Preview payload = the summary counts plus the project → developer breakdown
 *  the review modal renders before the admin confirms the send. */
export interface DailyUpdatesPreview extends DailyUpdatesResult {
  dateLabel: string;
  projects: DailyUpdateProject[];
  otherDevs: Array<{ name: string; note: string | null }>;
}

/**
 * Compile every developer's daily update grouped BY PROJECT first and then BY
 * DEVELOPER, and resolve the destination channel + bot token. Only devs who
 * have pushed the given phase's update today are included:
 *   • PM → each dev's tasks marked done today + their end-of-day note.
 *   • AM → each dev's in-progress tasks (Doing / In review) + their note.
 * Posts NOTHING — shared by the review preview and the actual publish so both
 * see identical data.
 */
async function compileDailyUpdates(
  user: EffectiveUser,
  phase: DailyUpdatePhase,
): Promise<{
  projects: DailyUpdateProject[];
  otherDevs: Array<{ name: string; note: string | null }>;
  devCount: number;
  taskCount: number;
  channel: string | null;
  botToken: string | null;
  workDate: Date;
}> {
  await ensureBaseRecords();
  const workDate = parseWorkDate();
  const devIds = await getDeveloperUserIds(user.workspaceId);

  const ws = await prisma.workspace.findUnique({
    where: { id: user.workspaceId },
    select: { slackBotToken: true, slackBotTokenEncrypted: true, channelRoutes: true },
  });
  const botToken = getSlackBotToken(ws);
  const channel = resolveUpdatesChannel(ws);

  if (devIds.length === 0) {
    return { projects: [], otherDevs: [], devCount: 0, taskCount: 0, channel, botToken, workDate };
  }

  const assigneeFilter = [
    { assignees: { some: { id: { in: devIds } } } },
    { assigneeId: { in: devIds } },
  ];
  // PM = done today; AM = whatever's currently in progress.
  const taskWhere: Prisma.TaskWhereInput =
    phase === "PM"
      ? { status: "DONE", completedAt: { gte: workDate, lt: nextUtcDay(workDate) } }
      : { status: { in: ["DOING", "IN_REVIEW", "UI_DONE"] } };

  const [users, updates, tasks] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: devIds } },
      select: { id: true, name: true, email: true },
    }),
    // Only devs who've pushed this phase's update today.
    prisma.dailyUpdate.findMany({
      where: {
        workspaceId: user.workspaceId,
        workDate,
        userId: { in: devIds },
        ...(phase === "PM" ? { pmPushedAt: { not: null } } : { amPushedAt: { not: null } }),
      },
      select: { userId: true, note: true },
    }),
    prisma.task.findMany({
      where: { workspaceId: user.workspaceId, ...taskWhere, OR: assigneeFilter },
      select: {
        id: true,
        title: true,
        assigneeId: true,
        assignees: { select: { id: true } },
        client: { select: { id: true, name: true, slug: true } },
      },
      orderBy: phase === "PM" ? { completedAt: "asc" } : { createdAt: "asc" },
    }),
  ]);

  const userById = new Map(users.map((u) => [u.id, u]));
  const noteByUser = new Map(updates.map((u) => [u.userId, u.note]));
  const pushedUserIds = updates.map((u) => u.userId);
  const pushedSet = new Set(pushedUserIds);

  // project (client) → dev → tasks. A task is fanned out to every assigned dev
  // (m-n + legacy single assignee) who has actually pushed this phase.
  type ProjectAcc = {
    clientName: string;
    clientSlug: string;
    devs: Map<string, { name: string; tasks: Array<{ title: string; taskId: string }> }>;
  };
  const projectMap = new Map<string, ProjectAcc>();
  const devsWithTasks = new Set<string>();

  for (const t of tasks) {
    const ids = new Set<string>(t.assignees.map((a) => a.id));
    if (t.assigneeId) ids.add(t.assigneeId);
    for (const id of ids) {
      if (!pushedSet.has(id)) continue; // dev hasn't posted this phase → skip
      const row = userById.get(id);
      if (!row) continue;
      devsWithTasks.add(id);
      let proj = projectMap.get(t.client.id);
      if (!proj) {
        proj = { clientName: t.client.name, clientSlug: t.client.slug, devs: new Map() };
        projectMap.set(t.client.id, proj);
      }
      let dev = proj.devs.get(id);
      if (!dev) {
        dev = { name: row.name?.trim() || row.email, tasks: [] };
        proj.devs.set(id, dev);
      }
      dev.tasks.push({ title: t.title, taskId: t.id });
    }
  }

  // Sort projects by name; within each, devs by name, and attach each dev's note.
  const projects: DailyUpdateProject[] = Array.from(projectMap.values())
    .map((p) => ({
      clientName: p.clientName,
      clientSlug: p.clientSlug,
      devs: Array.from(p.devs.entries())
        .map(([userId, d]) => ({
          name: d.name,
          tasks: d.tasks,
          note: noteByUser.get(userId) ?? null,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.clientName.localeCompare(b.clientName));

  // Devs who pushed but landed in no project (no tasks this phase) — surface them
  // (with their note) so their participation isn't dropped from the report.
  const otherDevs = pushedUserIds
    .filter((id) => !devsWithTasks.has(id))
    .map((id) => {
      const row = userById.get(id);
      return row ? { name: row.name?.trim() || row.email, note: noteByUser.get(id) ?? null } : null;
    })
    .filter((d): d is { name: string; note: string | null } => d !== null)
    .sort((a, b) => a.name.localeCompare(b.name));

  const taskCount = projects.reduce(
    (n, p) => n + p.devs.reduce((m, d) => m + d.tasks.length, 0),
    0,
  );

  return {
    projects,
    otherDevs,
    devCount: pushedUserIds.length,
    taskCount,
    channel,
    botToken,
    workDate,
  };
}

/**
 * Review preview for the "Push to Slack" flow — compiles the same data
 * `publishDailyUpdates` would post, but sends nothing. Powers the confirmation
 * modal so the admin can eyeball each project's updates before they go out.
 */
export async function previewDailyUpdates(
  user: EffectiveUser,
  phase: DailyUpdatePhase,
): Promise<DailyUpdatesPreview> {
  assertCanPublishTaskRollup(user);
  const { projects, otherDevs, devCount, taskCount, channel, workDate } =
    await compileDailyUpdates(user, phase);
  return {
    ok: true,
    phase,
    channel,
    configured: Boolean(channel),
    devCount,
    taskCount,
    dateLabel: ymd(workDate),
    projects,
    otherDevs,
  };
}

/**
 * "Push to Slack" — compile every developer's daily update grouped BY PROJECT
 * then BY DEVELOPER and post ONE consolidated card to the dedicated updates
 * channel (Settings → Integrations `tasks.updates` route, i.e. #updates). PM
 * carries done-today tasks + notes; AM carries in-progress tasks + notes. Both
 * use the identical layout. Only devs who have pushed that phase today are
 * included. Best-effort Slack post; a missing token/channel never fails the
 * request — `configured: false` tells the UI to prompt setup.
 *
 * The posted card carries a "🗑 Delete update" button. We pre-mint a
 * `SlackMessageRef` (placeholder ts) so its id can be embedded in that button,
 * then patch in the real message ts once Slack returns it — the interactivity
 * handler resolves the ref on click and runs chat.delete.
 */
export async function publishDailyUpdates(
  user: EffectiveUser,
  phase: DailyUpdatePhase,
): Promise<DailyUpdatesResult> {
  assertCanPublishTaskRollup(user);
  const { projects, otherDevs, devCount, taskCount, channel, botToken, workDate } =
    await compileDailyUpdates(user, phase);

  if (botToken && channel) {
    // Pre-mint the ref (placeholder ts) so the delete button can carry its id.
    const ref = await prisma.slackMessageRef.create({
      data: {
        workspaceId: user.workspaceId,
        channelId: channel,
        messageTs: cryptoRandomId(),
        taskId: null,
        kind: phase === "PM" ? "PM_UPDATES" : "AM_UPDATES",
        postedById: user.id,
      },
    });

    const card = buildDailyUpdatesCard({
      phase,
      dateLabel: ymd(workDate),
      projects,
      otherDevs,
      deleteRefId: ref.id,
    });
    const result = await postMessage(botToken, { channel, text: card.text, blocks: card.blocks });

    if (result.ok && result.data.ts) {
      // Swap the placeholder for the real ts so chat.delete targets the message.
      await prisma.slackMessageRef
        .update({ where: { id: ref.id }, data: { messageTs: result.data.ts } })
        .catch(() => undefined);
    } else {
      // Post failed — drop the orphan ref so it can't back a dead delete button.
      await prisma.slackMessageRef.delete({ where: { id: ref.id } }).catch(() => undefined);
    }

    await prisma.workspace
      .update({ where: { id: user.workspaceId }, data: { lastSlackPostAt: new Date() } })
      .catch(() => undefined);
  }

  return {
    ok: true,
    phase,
    channel,
    configured: Boolean(channel),
    devCount,
    taskCount,
  };
}
