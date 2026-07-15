// Ad-hoc Slack pushes from the Tasks page.
//
// Two surfaces, separate from the daily AM/PM standup cadence in tasks-standup.ts:
//   • pushProjectUpdate — any assigned dev posts THIS client's current board state
//     to its internal channel (and its linked external/Slack-Connect channel, at
//     the same time, if one is set), on demand, with per-dev customisation (which
//     categories, titles vs descriptions, which status groups, a note). Can also
//     stamp the dev's shared AM/PM standup dot (markPhases) and cross-post to the
//     roll-up channel.
//   • broadcastUpdate — the DevOps lead (tasks.publish) posts a free-form message
//     to one or many client channels (internal + linked external), no tasks required.
//
// Slack posting is best-effort/fire-and-forget — a missing token or channel never
// fails the request (mirrors tasks-standup.ts). Every post is logged to
// SlackUpdateLog for history + light "who posted today" presence.

import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import {
  type EffectiveUser,
  assertCanPublishTaskRollup,
} from "@/server/auth/effective-user";
import { listTasks, assertClientInScope } from "@/server/tasks";
import {
  cryptoRandomId,
  maybePingAllIn,
  resolveRollupChannel,
} from "@/server/tasks-standup";
import { getSlackBotToken, postMessage } from "@/server/slack/client";
import {
  buildBroadcastCard,
  buildProjectUpdateCard,
  type ProjectUpdateGroup,
  type StandupTaskCardInput,
} from "@/server/slack/blocks";
import {
  DEFAULT_PUSH_PREFS,
  NO_CATEGORY_ID,
  PROJECT_UPDATE_GROUP_LABELS,
  type BroadcastInput,
  isTaskDoneToday,
  type BroadcastResult,
  type ProjectUpdateInput,
  type ProjectUpdateResult,
  type ProjectUpdateStatusGroup,
  type SlackPushPrefs,
  type SlackUpdateLogDTO,
  type TaskCardDetail,
  type TaskDTO,
} from "@/types/tasks";
import { assertSlackUpdateLogCooldown } from "@/server/slack-cooldown";

// ─── Per-dev push prefs ──────────────────────────────────────────────────────

/** Coerce a stored JSON blob into a complete SlackPushPrefs, filling gaps from
 *  DEFAULT_PUSH_PREFS so an old/partial blob never breaks the composer. */
function normalizePrefs(raw: unknown): SlackPushPrefs {
  const p = (raw && typeof raw === "object" ? raw : {}) as Partial<SlackPushPrefs>;
  const detail: TaskCardDetail =
    p.detail === "TITLES_AND_DESCRIPTIONS" ? "TITLES_AND_DESCRIPTIONS" : "TITLES";
  const statusGroups = Array.isArray(p.statusGroups)
    ? p.statusGroups.filter((g): g is ProjectUpdateStatusGroup =>
        g === "DOING" || g === "DONE" || g === "UPCOMING",
      )
    : [];
  return {
    detail,
    statusGroups: statusGroups.length ? statusGroups : DEFAULT_PUSH_PREFS.statusGroups,
    excludedCategoryIds: Array.isArray(p.excludedCategoryIds)
      ? p.excludedCategoryIds.filter((s): s is string => typeof s === "string")
      : [],
    defaultNote: typeof p.defaultNote === "string" ? p.defaultNote : null,
  };
}

export async function getSlackPushPrefs(user: EffectiveUser): Promise<SlackPushPrefs> {
  const member = await prisma.workspaceMember.findUnique({
    where: { id: user.membershipId },
    select: { slackPushPrefs: true },
  });
  return normalizePrefs(member?.slackPushPrefs);
}

export async function saveSlackPushPrefs(
  user: EffectiveUser,
  prefs: SlackPushPrefs,
): Promise<SlackPushPrefs> {
  const clean = normalizePrefs(prefs);
  await prisma.workspaceMember.update({
    where: { id: user.membershipId },
    data: { slackPushPrefs: clean },
  });
  return clean;
}

// ─── Project update (per-client, on demand) ──────────────────────────────────

/** A task's category key for include/exclude matching: its feature-block id, or
 *  the NO_CATEGORY_ID sentinel for tasks with no block. */
function categoryKey(t: TaskDTO): string {
  return t.featureBlock?.id ?? NO_CATEGORY_ID;
}

const STATUS_GROUP_ORDER: ProjectUpdateStatusGroup[] = ["DOING", "DONE", "UPCOMING"];

function inStatusGroup(t: TaskDTO, group: ProjectUpdateStatusGroup): boolean {
  if (group === "DOING") return t.status === "DOING" || t.status === "IN_REVIEW" || t.status === "UI_DONE";
  if (group === "DONE") return isTaskDoneToday(t); // only today's completions, not all-time
  return t.status === "TODO" || t.status === "BACKLOG";
}

export async function pushProjectUpdate(
  user: EffectiveUser,
  input: ProjectUpdateInput,
): Promise<ProjectUpdateResult> {
  await ensureBaseRecords();
  await assertClientInScope(user, input.clientId);

  const saved = await getSlackPushPrefs(user);
  const detail: TaskCardDetail = input.detail ?? saved.detail;
  const statusGroups = (input.statusGroups ?? saved.statusGroups).filter((g) =>
    STATUS_GROUP_ORDER.includes(g),
  );
  const note = (input.note ?? saved.defaultNote ?? "").trim();

  // Category inclusion. An explicit include-list (from the composer) wins; else
  // fall back to the saved exclude-list (so newly-created blocks are included).
  const includeSet = input.categoryIds ? new Set(input.categoryIds) : null;
  const excludeSet = new Set(saved.excludedCategoryIds);
  const isIncluded = (t: TaskDTO): boolean =>
    includeSet ? includeSet.has(categoryKey(t)) : !excludeSet.has(categoryKey(t));

  const [client, allTasks] = await Promise.all([
    prisma.workspaceClient.findFirst({
      where: { id: input.clientId, workspaceId: user.workspaceId },
      select: {
        id: true,
        name: true,
        slug: true,
        slackChannelId: true,
        slackInternalChannelId: true,
        slackExternalChannelId: true,
      },
    }),
    listTasks(user, { clientId: input.clientId }),
  ]);
  if (!client) return { ok: false, channel: null, taskCount: 0 };

  const selected = allTasks.filter(isIncluded);

  // Stamp the shared AM/PM standup dot if requested — independent of whether a
  // card actually posts (mirrors pushDailyUpdate, which stamps even when there's
  // "nothing to say").
  if (input.markPhases?.length) {
    await stampPhases(user, input.markPhases);
  }
  // Persist the chosen selection as this dev's defaults.
  if (input.saveAsDefaults) {
    await persistDefaults(user, input, { detail, statusGroups, note, includeSet });
  }

  const channel = client.slackInternalChannelId ?? client.slackChannelId ?? null;
  const ws = await prisma.workspace.findUnique({
    where: { id: user.workspaceId },
    select: { slackBotToken: true, slackBotTokenEncrypted: true, channelRoutes: true, slackSummaryChannelId: true },
  });
  const botToken = getSlackBotToken(ws);

  // Nothing to say (no matching tasks and no note) → skip posting, but the phase
  // stamp / defaults above still applied.
  const totalSelected = statusGroups.reduce(
    (n, g) => n + selected.filter((t) => inStatusGroup(t, g)).length,
    0,
  );
  if ((totalSelected === 0 && !note) || !botToken || !channel) {
    return { ok: Boolean(botToken && channel), channel, taskCount: totalSelected };
  }
  await assertSlackUpdateLogCooldown(user, {
    kind: "PROJECT_UPDATE",
    clientId: client.id,
    label: "Project update",
  });

  // Pre-mint a SlackMessageRef per posted task so the card's overflow actions
  // resolve back to them (identical scheme to the standup card).
  const posting = statusGroups
    .map((g) => ({ group: g, tasks: selected.filter((t) => inStatusGroup(t, g)) }))
    .filter((g) => g.tasks.length > 0);
  const flat = posting.flatMap((g) => g.tasks);

  const placeholders = await Promise.all(
    flat.map((t) =>
      prisma.slackMessageRef.create({
        data: {
          workspaceId: user.workspaceId,
          channelId: channel,
          messageTs: `pending:${cryptoRandomId()}`,
          taskId: t.id,
          kind: "PROJECT_UPDATE",
          postedById: user.id,
        },
        select: { id: true },
      }),
    ),
  );
  const refByTask = new Map(flat.map((t, i) => [t.id, placeholders[i].id]));
  const updateLog = await prisma.slackUpdateLog.create({
    data: {
      workspaceId: user.workspaceId,
      userId: user.id,
      kind: "PROJECT_UPDATE",
      clientId: client.id,
      channelId: channel,
      taskCount: null,
    },
    select: { id: true },
  });

  const groups: ProjectUpdateGroup[] = posting.map((g) => ({
    label: PROJECT_UPDATE_GROUP_LABELS[g.group] as ProjectUpdateGroup["label"],
    tasks: g.tasks.map(
      (t): StandupTaskCardInput => ({
        taskId: t.id,
        messageRefId: refByTask.get(t.id)!,
        title: t.title,
        clientName: client.name,
        clientSlug: client.slug,
        blockName: t.featureBlock?.name ?? null,
        dueDate: t.dueDate ? t.dueDate.slice(0, 10) : null,
        status: t.status,
        description: t.description,
      }),
    ),
  }));

  const card = buildProjectUpdateCard({
    clientName: client.name,
    clientSlug: client.slug,
    who: user.name?.trim() || user.email,
    dateLabel: new Date().toISOString().slice(0, 10),
    detail,
    note: note || null,
    groups,
  });

  const result = await postMessage(botToken, { channel, text: card.text, blocks: card.blocks });
  if (result.ok && result.data.ts) {
    await prisma.slackMessageRef.updateMany({
      where: { id: { in: placeholders.map((p) => p.id) } },
      data: { messageTs: result.data.ts },
    });
  } else {
    await prisma.slackMessageRef.deleteMany({ where: { id: { in: placeholders.map((p) => p.id) } } });
    await prisma.slackUpdateLog.delete({ where: { id: updateLog.id } }).catch(() => undefined);
    return { ok: false, channel, taskCount: flat.length };
  }

  // Cross-post to the client's external (Slack Connect) channel at the same
  // time, when one is linked (snapshot copy; actions still resolve via the
  // embedded messageRefIds).
  if (client.slackExternalChannelId && client.slackExternalChannelId !== channel) {
    await postMessage(botToken, { channel: client.slackExternalChannelId, text: card.text, blocks: card.blocks });
  }

  // Optional cross-post to the roll-up channel (snapshot copy; actions still
  // resolve via the embedded messageRefIds).
  if (input.toRollup) {
    const rollup = resolveRollupChannel(ws);
    if (rollup && rollup !== channel) {
      await postMessage(botToken, { channel: rollup, text: card.text, blocks: card.blocks });
    }
  }

  await prisma.slackUpdateLog.update({
    where: { id: updateLog.id },
    data: { taskCount: flat.length },
  });
  await bumpLastPost(user.workspaceId);

  return { ok: true, channel, taskCount: flat.length };
}

/** Stamp amPushedAt/pmPushedAt on today's DailyUpdate (the same row the dashboard
 *  standup reads). Idempotent; never clears a phase. Fires the all-in nudge when
 *  a PM push freshly completes the roster. */
async function stampPhases(user: EffectiveUser, phases: ("AM" | "PM")[]): Promise<void> {
  const workDate = new Date(
    Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()),
  );
  const now = new Date();
  const wantsPm = phases.includes("PM");
  const prior = wantsPm
    ? await prisma.dailyUpdate.findUnique({
        where: { userId_workDate: { userId: user.id, workDate } },
        select: { pmPushedAt: true },
      })
    : null;
  const data: { amPushedAt?: Date; pmPushedAt?: Date } = {};
  if (phases.includes("AM")) data.amPushedAt = now;
  if (wantsPm) data.pmPushedAt = now;
  await prisma.dailyUpdate.upsert({
    where: { userId_workDate: { userId: user.id, workDate } },
    create: { workspaceId: user.workspaceId, userId: user.id, workDate, ...data },
    update: data,
  });
  if (wantsPm && !prior?.pmPushedAt) {
    void maybePingAllIn(user.workspaceId, workDate).catch((err) =>
      console.error("[slack-updates] all-in ping failed", err),
    );
  }
}

/** Save the composer selection as this dev's defaults. The include-list is
 *  converted to an exclude-list (all this client's category ids minus the
 *  included ones) so newly-created blocks stay included by default later. */
async function persistDefaults(
  user: EffectiveUser,
  input: ProjectUpdateInput,
  resolved: {
    detail: TaskCardDetail;
    statusGroups: ProjectUpdateStatusGroup[];
    note: string;
    includeSet: Set<string> | null;
  },
): Promise<void> {
  let excludedCategoryIds: string[] = [];
  if (resolved.includeSet) {
    const blocks = await prisma.featureBlock.findMany({
      where: { clientId: input.clientId },
      select: { id: true },
    });
    const allKeys = [...blocks.map((b) => b.id), NO_CATEGORY_ID];
    excludedCategoryIds = allKeys.filter((k) => !resolved.includeSet!.has(k));
  }
  await saveSlackPushPrefs(user, {
    detail: resolved.detail,
    statusGroups: resolved.statusGroups,
    excludedCategoryIds,
    defaultNote: resolved.note || null,
  });
}

// ─── Broadcast (DevOps lead, cross-client) ────────────────────────────────────

export async function broadcastUpdate(
  user: EffectiveUser,
  input: BroadcastInput,
): Promise<BroadcastResult> {
  assertCanPublishTaskRollup(user);
  await ensureBaseRecords();

  // Validate every target is in scope (the lead has seeAllClients, so this just
  // confirms the clients exist in the workspace).
  for (const id of input.clientIds) await assertClientInScope(user, id);
  await assertSlackUpdateLogCooldown(user, {
    kind: "BROADCAST",
    clientId: null,
    label: "Broadcast",
  });

  const [clients, ws] = await Promise.all([
    prisma.workspaceClient.findMany({
      where: { workspaceId: user.workspaceId, id: { in: input.clientIds } },
      select: {
        id: true,
        name: true,
        slackChannelId: true,
        slackInternalChannelId: true,
        slackExternalChannelId: true,
      },
    }),
    prisma.workspace.findUnique({
      where: { id: user.workspaceId },
      select: { slackBotToken: true, slackBotTokenEncrypted: true, channelRoutes: true, slackSummaryChannelId: true },
    }),
  ]);
  const botToken = getSlackBotToken(ws);
  const who = user.name?.trim() || user.email;
  const postedChannels: string[] = [];
  const summaryLog = await prisma.slackUpdateLog.create({
    data: {
      workspaceId: user.workspaceId,
      userId: user.id,
      kind: "BROADCAST",
      clientId: null,
      taskCount: 0,
      message: input.message.trim(),
    },
    select: { id: true },
  });

  if (botToken) {
    for (const client of clients) {
      const channel = client.slackInternalChannelId ?? client.slackChannelId ?? null;
      if (!channel) continue;
      const message = input.perClientMessages?.[client.id]?.trim() || input.message.trim();
      const card = buildBroadcastCard({ who, message });
      const result = await postMessage(botToken, { channel, text: card.text, blocks: card.blocks });
      if (result.ok) {
        postedChannels.push(channel);
        await prisma.slackUpdateLog.create({
          data: {
            workspaceId: user.workspaceId,
            userId: user.id,
            kind: "BROADCAST",
            clientId: client.id,
            channelId: channel,
            message,
          },
        });
      }

      // Cross-post to the client's linked external (Slack Connect) channel at
      // the same time.
      if (client.slackExternalChannelId && client.slackExternalChannelId !== channel) {
        const externalResult = await postMessage(botToken, {
          channel: client.slackExternalChannelId,
          text: card.text,
          blocks: card.blocks,
        });
        if (externalResult.ok) {
          postedChannels.push(client.slackExternalChannelId);
          await prisma.slackUpdateLog.create({
            data: {
              workspaceId: user.workspaceId,
              userId: user.id,
              kind: "BROADCAST",
              clientId: client.id,
              channelId: client.slackExternalChannelId,
              message,
            },
          });
        }
      }
    }

    if (input.toRollup) {
      const rollup = resolveRollupChannel(ws);
      if (rollup && !postedChannels.includes(rollup)) {
        const card = buildBroadcastCard({ who, message: input.message.trim() });
        const result = await postMessage(botToken, { channel: rollup, text: card.text, blocks: card.blocks });
        if (result.ok) postedChannels.push(rollup);
      }
    }
  }

  // Summary log row (clientId null) so the broadcast shows in history even when
  // no channel resolved.
  await prisma.slackUpdateLog.update({
    where: { id: summaryLog.id },
    data: {
      taskCount: postedChannels.length,
      message: input.message.trim(),
    },
  });
  if (postedChannels.length) await bumpLastPost(user.workspaceId);

  return { ok: true, postedCount: postedChannels.length, channels: postedChannels };
}

// ─── History ─────────────────────────────────────────────────────────────────

/** Recent ad-hoc pushes by this user (for the broadcast card's history line). */
export async function listRecentSlackUpdates(
  user: EffectiveUser,
  limit = 5,
): Promise<SlackUpdateLogDTO[]> {
  const rows = await prisma.slackUpdateLog.findMany({
    where: { workspaceId: user.workspaceId, userId: user.id },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, kind: true, clientId: true, taskCount: true, createdAt: true },
  });
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind === "BROADCAST" ? "BROADCAST" : "PROJECT_UPDATE",
    clientId: r.clientId,
    taskCount: r.taskCount,
    createdAt: r.createdAt.toISOString(),
  }));
}

async function bumpLastPost(workspaceId: string): Promise<void> {
  await prisma.workspace
    .update({ where: { id: workspaceId }, data: { lastSlackPostAt: new Date() } })
    .catch(() => undefined);
}
