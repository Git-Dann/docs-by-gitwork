/**
 * Commitments — one person's list of promises, typed by hand or suggested from what they wrote.
 *
 *   sources (their sent Gmail · their own Slack messages · Scribe action items · calendar)
 *     → one light-tier AI read of Gmail + Slack text (validated: the quote must be in the message)
 *     → suggestions (state "suggested")          ← never acted on, never sent anywhere
 *     → the person accepts, edits, snoozes, completes or dismisses them
 *
 * Privacy, and why it is shaped like this:
 *   - Per-user and private. Only the owner can read or change their commitments; "view as" is
 *     refused at the route (see `assertNotViewingAs`).
 *   - Gmail and Slack are opt-in per person (`CommitmentSettings`). Gmail reads only SENT mail,
 *     only the part the person wrote (quoted replies stripped). Message bodies are held in memory
 *     for the read and never stored: what is kept is the promise, a quote of at most 280
 *     characters, the subject and a link.
 *   - Slack reads only the person's OWN messages, in client channels they can see.
 *
 * Failure model: every source is read independently and reports in words. A failed source does
 * NOT advance `lastSyncedAt`, so the next run re-reads its window (CLAUDE.md §35).
 */

import { google, type gmail_v1 } from "googleapis";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { EffectiveUser } from "@/server/auth/effective-user";
import { canGenerateAi, canSeeAllClients } from "@/server/auth/effective-user";
import { ACTIVE_MEMBER } from "@/server/auth/member-status";
import { googleClientForRefreshToken } from "@/server/google-auth";
import { getSlackBotToken } from "@/server/slack/client";
import { assignedClientIds } from "@/server/tasks";
import { resolveAiConfig, completeText, parseJsonObject } from "@/server/ai-provider";
import { cachedOrCompute, hashInputs } from "@/server/ai-cache";
import { cleanSlackText } from "@/lib/crm/signals";
import { randomUUID } from "node:crypto";
import {
  actionItemIsMine,
  applyWhen,
  clipText,
  isPriority,
  isValidRecurrence,
  nextOccurrenceFields,
  normaliseChecklist,
  normaliseTags,
  readChecklist,
  RECURRENCE_ERROR,
  MAX_REORDER_IDS,
  followUpFromEvent,
  normaliseExtraction,
  stripQuotedEmail,
  suggestionKey,
  transition,
  MAX_SUGGESTIONS_PER_DAY,
  QUOTE_MAX,
  SUGGESTION_TTL_DAYS,
  TITLE_MAX,
  type CalendarEventLike,
  type CommitmentPriority,
  type CommitmentSource,
  type CommitmentState,
  type ExtractionMessage,
} from "@/lib/commitments";
import type {
  CommitmentDTO,
  CommitmentSettingsDTO,
  CommitmentSourceStatus,
  CommitmentSyncResult,
} from "@/types/commitments";

const DAY_MS = 86_400_000;
const CLAIM_TTL_MS = 5 * 60_000;
/** First read looks back this far; later reads from the last good read, minus an overlap. */
const FIRST_LOOKBACK_DAYS = 14;
const OVERLAP_MS = 2 * DAY_MS;
const MAX_SENT_EMAILS = 40;
const MAX_SLACK_CHANNELS = 12;
const MAX_SLACK_PER_CHANNEL = 100;
/** Messages put to the model in one read. */
const MAX_READ_MESSAGES = 40;
const MESSAGE_TEXT_MAX = 1_200;
/** A scheduled read happens at most this often per person. */
export const AUTO_SYNC_EVERY_MS = 30 * 60_000;
/** People read per job-worker tick. */
const AUTO_SYNC_PER_TICK = 4;
const SLACK_API = "https://slack.com/api";
/** Gitwork's own domains: meetings with only these attendees are internal. */
const INTERNAL_DOMAINS = ["gitwork.co.uk", "gitwork.io"];

export class CommitmentError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

// ── Reading and writing the list ─────────────────────────────────────────────

type CommitmentRow = Prisma.CommitmentGetPayload<object>;

function toDTO(row: CommitmentRow): CommitmentDTO {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    dueAt: row.dueAt?.toISOString() ?? null,
    state: row.state as CommitmentState,
    source: row.source as CommitmentSource,
    counterpart: row.counterpart,
    quote: row.quote,
    evidenceLabel: row.evidenceLabel,
    evidenceUrl: row.evidenceUrl,
    evidenceAt: row.evidenceAt?.toISOString() ?? null,
    reason: row.reason,
    snoozedUntil: row.snoozedUntil?.toISOString() ?? null,
    doneAt: row.doneAt?.toISOString() ?? null,
    listId: row.listId,
    tags: row.tags,
    priority: (isPriority(row.priority) ? row.priority : 0) as CommitmentPriority,
    startAt: row.startAt?.toISOString() ?? null,
    evening: row.evening,
    someday: row.someday,
    remindAt: row.remindAt?.toISOString() ?? null,
    recurrence: row.recurrence,
    checklist: readChecklist(row.checklist),
    orderKey: row.orderKey,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mine(user: EffectiveUser) {
  return { userId: user.id, workspaceId: user.workspaceId };
}

/**
 * Open and suggested commitments, plus anything done or dismissed in the last 14 days (so a
 * slip of the finger can be undone). Older finished rows stay stored but aren't sent.
 */
export async function listCommitments(user: EffectiveUser): Promise<CommitmentDTO[]> {
  const since = new Date(Date.now() - 14 * DAY_MS);
  const rows = await prisma.commitment.findMany({
    where: {
      ...mine(user),
      OR: [
        { state: "open" },
        { state: "suggested", createdAt: { gte: new Date(Date.now() - SUGGESTION_TTL_DAYS * DAY_MS) } },
        { state: { in: ["done", "dismissed"] }, updatedAt: { gte: since } },
      ],
    },
    orderBy: [{ orderKey: "asc" }, { createdAt: "desc" }],
    take: 500,
  });
  return rows.map(toDTO);
}

async function findMine(user: EffectiveUser, id: string): Promise<CommitmentRow> {
  const row = await prisma.commitment.findFirst({ where: { id, ...mine(user) } });
  if (!row) throw new CommitmentError("Commitment not found.", 404);
  return row;
}

/** To-do fields shared by create and PATCH. `null` clears (PATCH); absent leaves. */
export interface CommitmentTodoInput {
  listId?: string | null;
  tags?: string[] | null;
  priority?: number;
  startAt?: string | null;
  evening?: boolean;
  someday?: boolean;
  remindAt?: string | null;
  recurrence?: string | null;
  checklist?: Array<{ id?: string | null; text: string; done?: boolean }> | null;
  orderKey?: number;
}

export interface CommitmentCreateInput extends CommitmentTodoInput {
  title: string;
  notes?: string | null;
  dueAt?: string | null;
  counterpart?: string | null;
}

function parseOptionalDate(input: string | null | undefined): Date | null {
  if (input == null || input === "") return null;
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) throw new CommitmentError("That date isn't valid.");
  return d;
}

function unwrap<T>(result: { value: T } | { error: string }): T {
  if ("error" in result) throw new CommitmentError(result.error);
  return result.value;
}

/** A list id must be one of the caller's own lists that isn't archived. */
async function assertOwnList(user: EffectiveUser, listId: string): Promise<void> {
  const list = await prisma.commitmentList.findFirst({
    where: { id: listId, ...mine(user), archivedAt: null },
    select: { id: true },
  });
  if (!list) throw new CommitmentError("That list isn't one of yours.");
}

type TodoData = {
  listId?: string | null;
  tags?: string[];
  priority?: number;
  startAt?: Date | null;
  evening?: boolean;
  someday?: boolean;
  remindAt?: Date | null;
  recurrence?: string | null;
  checklist?: Prisma.InputJsonValue | typeof Prisma.DbNull;
  orderKey?: number;
};

/**
 * Validates and cleans the to-do fields of a create or PATCH. `current` is the row being edited
 * (or the defaults, for a create), so the someday/start-date rule sees the result, not the patch.
 */
async function todoData(
  user: EffectiveUser,
  input: CommitmentTodoInput,
  current: { startAt: Date | null; evening: boolean; someday: boolean },
): Promise<TodoData> {
  const data: TodoData = {};
  if (input.listId !== undefined) {
    if (input.listId) await assertOwnList(user, input.listId);
    data.listId = input.listId || null;
  }
  if (input.tags !== undefined) data.tags = unwrap(normaliseTags(input.tags ?? []));
  if (input.priority !== undefined) {
    if (!isPriority(input.priority)) throw new CommitmentError("Priority is 0 (none) to 3 (high).");
    data.priority = input.priority;
  }
  if (input.recurrence !== undefined) {
    const rule = input.recurrence?.trim() || null;
    if (rule && !isValidRecurrence(rule)) throw new CommitmentError(RECURRENCE_ERROR);
    data.recurrence = rule;
  }
  if (input.checklist !== undefined) {
    data.checklist = input.checklist
      ? (unwrap(normaliseChecklist(input.checklist, randomUUID)) as unknown as Prisma.InputJsonValue)
      : Prisma.DbNull;
  }
  if (input.remindAt !== undefined) data.remindAt = parseOptionalDate(input.remindAt);
  if (input.orderKey !== undefined) {
    if (!Number.isFinite(input.orderKey)) throw new CommitmentError("That order isn't a valid number.");
    data.orderKey = input.orderKey;
  }
  if (input.startAt !== undefined || input.evening !== undefined || input.someday !== undefined) {
    const when = unwrap(
      applyWhen(current, {
        startAt: input.startAt === undefined ? undefined : parseOptionalDate(input.startAt),
        evening: input.evening,
        someday: input.someday,
      }),
    );
    data.startAt = when.startAt;
    data.evening = when.evening;
    data.someday = when.someday;
  }
  return data;
}

export async function createCommitment(user: EffectiveUser, input: CommitmentCreateInput): Promise<CommitmentDTO> {
  const title = clipText(input.title, TITLE_MAX);
  if (!title) throw new CommitmentError("A commitment needs a title.");
  const todo = await todoData(user, input, { startAt: null, evening: false, someday: false });
  const row = await prisma.commitment.create({
    data: {
      ...mine(user),
      title,
      notes: input.notes?.trim() || null,
      dueAt: parseOptionalDate(input.dueAt),
      counterpart: input.counterpart?.trim() ? clipText(input.counterpart, 80) : null,
      state: "open",
      source: "manual",
      ...todo,
    },
  });
  return toDTO(row);
}

export interface CommitmentPatchInput extends CommitmentTodoInput {
  title?: string;
  notes?: string | null;
  dueAt?: string | null;
  counterpart?: string | null;
  state?: CommitmentState;
  snoozedUntil?: string | null;
}

export interface CommitmentUpdateResult {
  commitment: CommitmentDTO;
  /** The next occurrence, when completing a repeating to-do created one. */
  next: CommitmentDTO | null;
}

export async function updateCommitment(
  user: EffectiveUser,
  id: string,
  patch: CommitmentPatchInput,
): Promise<CommitmentUpdateResult> {
  const row = await findMine(user, id);
  const data: Prisma.CommitmentUpdateInput = { ...(await todoData(user, patch, row)) };
  if (patch.title !== undefined) {
    const title = clipText(patch.title, TITLE_MAX);
    if (!title) throw new CommitmentError("A commitment needs a title.");
    data.title = title;
  }
  if (patch.notes !== undefined) data.notes = patch.notes?.trim() || null;
  if (patch.dueAt !== undefined) data.dueAt = parseOptionalDate(patch.dueAt);
  if (patch.counterpart !== undefined) {
    data.counterpart = patch.counterpart?.trim() ? clipText(patch.counterpart, 80) : null;
  }
  let snoozed = row.snoozedUntil;
  if (patch.snoozedUntil !== undefined) {
    snoozed = parseOptionalDate(patch.snoozedUntil);
    data.snoozedUntil = snoozed;
  }
  if (patch.state !== undefined) {
    const next = transition(
      { state: row.state as CommitmentState, doneAt: row.doneAt, snoozedUntil: snoozed },
      patch.state,
      new Date(),
    );
    if ("error" in next) throw new CommitmentError(next.error);
    data.state = next.state;
    data.doneAt = next.doneAt;
    data.snoozedUntil = next.snoozedUntil;
  }
  const plan = repeatPlan(row, data);
  if (!plan) {
    const updated = await prisma.commitment.update({ where: { id: row.id }, data });
    return { commitment: toDTO(updated), next: null };
  }
  // Completing a repeating to-do: this one stops repeating (so reopening it can't make a
  // second copy) and the next one is created in the same transaction.
  const [updated, created] = await prisma.$transaction([
    prisma.commitment.update({ where: { id: row.id }, data: { ...data, recurrence: null } }),
    prisma.commitment.create({ data: plan }),
  ]);
  return { commitment: toDTO(updated), next: toDTO(created) };
}

/**
 * When this PATCH moves a repeating to-do to done, the next occurrence to create. Reads the row
 * as it will be after the patch, so a title or repeat changed in the same request carries over.
 * Exported for tests.
 */
export function repeatPlan(
  row: CommitmentRow,
  data: Prisma.CommitmentUpdateInput,
  now = new Date(),
): Prisma.CommitmentUncheckedCreateInput | null {
  if (data.state !== "done" || row.state === "done") return null;
  const patch = data as Record<string, unknown>;
  const after = <K extends keyof CommitmentRow>(key: K): CommitmentRow[K] =>
    (key in patch ? patch[key as string] : row[key]) as CommitmentRow[K];
  const rule = after("recurrence");
  if (!rule || !isValidRecurrence(rule)) return null;
  const checklistValue = "checklist" in patch ? (patch.checklist === Prisma.DbNull ? null : patch.checklist) : row.checklist;
  const next = nextOccurrenceFields(
    rule,
    {
      dueAt: after("dueAt"),
      startAt: after("startAt"),
      remindAt: after("remindAt"),
      checklist: readChecklist(checklistValue),
    },
    now,
  );
  return {
    workspaceId: row.workspaceId,
    userId: row.userId,
    title: after("title"),
    notes: after("notes"),
    counterpart: after("counterpart"),
    listId: after("listId"),
    tags: after("tags"),
    priority: after("priority"),
    evening: after("evening"),
    recurrence: rule,
    checklist: next.checklist as unknown as Prisma.InputJsonValue,
    orderKey: after("orderKey"),
    dueAt: next.dueAt,
    startAt: next.startAt,
    remindAt: next.remindAt,
    state: "open",
    source: "manual",
  };
}

/** Sets orderKey = position for each id, in one transaction. Every id must be the caller's own. */
export async function reorderCommitments(user: EffectiveUser, ids: string[]): Promise<void> {
  if (ids.length > MAX_REORDER_IDS) {
    throw new CommitmentError(`At most ${MAX_REORDER_IDS} to-dos can be reordered at once.`);
  }
  if (new Set(ids).size !== ids.length) throw new CommitmentError("Each to-do can appear in the order once.");
  if (ids.length === 0) return;
  const owned = await prisma.commitment.count({ where: { id: { in: ids }, ...mine(user) } });
  if (owned !== ids.length) throw new CommitmentError("Some of those to-dos aren't yours.", 404);
  await prisma.$transaction(
    ids.map((id, index) => prisma.commitment.updateMany({ where: { id, ...mine(user) }, data: { orderKey: index } })),
  );
}

/** Only things the person typed can be deleted. A suggestion is dismissed instead, so the
 *  next read recognises it and doesn't suggest it again. */
export async function deleteCommitment(user: EffectiveUser, id: string): Promise<void> {
  const row = await findMine(user, id);
  if (row.source !== "manual") {
    throw new CommitmentError("Suggested commitments are dismissed, not deleted, so they aren't suggested again.");
  }
  await prisma.commitment.delete({ where: { id: row.id } });
}

// ── Settings ─────────────────────────────────────────────────────────────────

async function settingsRow(user: EffectiveUser) {
  const existing = await prisma.commitmentSettings.findFirst({ where: mine(user), orderBy: { createdAt: "asc" } });
  if (existing) return existing;
  return prisma.commitmentSettings.create({ data: mine(user) });
}

function settingsDTO(row: Awaited<ReturnType<typeof settingsRow>>, slackConnected: boolean): CommitmentSettingsDTO {
  return {
    gmailEnabled: row.gmailEnabled,
    slackEnabled: row.slackEnabled,
    meetingsEnabled: row.meetingsEnabled,
    calendarEnabled: row.calendarEnabled,
    lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
    syncing: Boolean(row.syncStartedAt && row.syncStartedAt.getTime() > Date.now() - CLAIM_TTL_MS),
    sourceStatus: (row.sourceStatus as Record<string, CommitmentSourceStatus> | null) ?? {},
    slackConnected,
  };
}

async function slackConnected(workspaceId: string): Promise<boolean> {
  const ws = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { slackBotToken: true, slackBotTokenEncrypted: true },
  });
  return Boolean(getSlackBotToken(ws));
}

export async function getCommitmentSettings(user: EffectiveUser): Promise<CommitmentSettingsDTO> {
  const [row, slack] = await Promise.all([settingsRow(user), slackConnected(user.workspaceId)]);
  return settingsDTO(row, slack);
}

export async function updateCommitmentSettings(
  user: EffectiveUser,
  patch: Partial<Pick<CommitmentSettingsDTO, "gmailEnabled" | "slackEnabled" | "meetingsEnabled" | "calendarEnabled">>,
): Promise<CommitmentSettingsDTO> {
  const row = await settingsRow(user);
  const updated = await prisma.commitmentSettings.update({
    where: { id: row.id },
    data: {
      ...(patch.gmailEnabled !== undefined ? { gmailEnabled: patch.gmailEnabled } : {}),
      ...(patch.slackEnabled !== undefined ? { slackEnabled: patch.slackEnabled } : {}),
      ...(patch.meetingsEnabled !== undefined ? { meetingsEnabled: patch.meetingsEnabled } : {}),
      ...(patch.calendarEnabled !== undefined ? { calendarEnabled: patch.calendarEnabled } : {}),
    },
  });
  return settingsDTO(updated, await slackConnected(user.workspaceId));
}

// ── Sources ──────────────────────────────────────────────────────────────────

/** A message the person wrote, ready for the AI read. Held in memory only. */
interface WrittenMessage {
  source: "gmail" | "slack";
  id: string;
  text: string;
  label: string;
  url: string | null;
  at: Date;
  to: string | null;
}

/** A suggestion that needs no AI (Scribe item, calendar follow-up). */
interface DirectSuggestion {
  source: "meeting" | "calendar";
  refId: string;
  title: string;
  dueAt: Date | null;
  counterpart: string | null;
  quote: string | null;
  label: string;
  url: string | null;
  at: Date | null;
  reason: string;
}

type SourceOutcome<T> = { items: T[]; status: CommitmentSourceStatus };

function ok<T>(items: T[], message: string): SourceOutcome<T> {
  return { items, status: { ok: true, message, at: new Date().toISOString() } };
}
function failed<T>(message: string): SourceOutcome<T> {
  return { items: [], status: { ok: false, message, at: new Date().toISOString() } };
}

function decodeBase64Url(data: string): string {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

function htmlToText(html: string): string {
  return html
    .replace(/<blockquote[\s\S]*?<\/blockquote>/gi, "\n")
    .replace(/<div class="gmail_quote"[\s\S]*$/i, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');
}

/** The plain text of an email: the text/plain part when there is one, else the HTML as text. */
export function emailBodyText(payload: gmail_v1.Schema$MessagePart | undefined): string {
  if (!payload) return "";
  const plain: string[] = [];
  const html: string[] = [];
  const walk = (part: gmail_v1.Schema$MessagePart) => {
    const data = part.body?.data;
    if (data && part.mimeType === "text/plain") plain.push(decodeBase64Url(data));
    else if (data && part.mimeType === "text/html") html.push(decodeBase64Url(data));
    for (const child of part.parts ?? []) walk(child);
  };
  walk(payload);
  if (plain.length) return plain.join("\n");
  return html.map(htmlToText).join("\n");
}

function firstRecipient(to: string | null): string | null {
  if (!to) return null;
  const first = to.split(",")[0]?.trim() ?? "";
  const named = /^"?([^"<]+?)"?\s*<([^>]+)>$/.exec(first);
  if (named) return clipText(named[1], 80);
  return first ? clipText(first, 80) : null;
}

async function readSentGmail(refreshToken: string | null, after: Date): Promise<SourceOutcome<WrittenMessage>> {
  if (!refreshToken) return failed("Google isn't connected for you. Sign out of Foundry and back in.");
  const auth = googleClientForRefreshToken(refreshToken);
  if (!auth) return failed("Google sign-in isn't configured on this server.");
  try {
    const gmail = google.gmail({ version: "v1", auth });
    const afterSecs = Math.floor(after.getTime() / 1000);
    const list = await gmail.users.messages.list({
      userId: "me",
      q: `in:sent after:${afterSecs} -in:chats`,
      maxResults: MAX_SENT_EMAILS,
    });
    const ids = (list.data.messages ?? []).map((m) => m.id).filter((id): id is string => Boolean(id));
    const items: WrittenMessage[] = [];
    for (let i = 0; i < ids.length; i += 10) {
      const batch = await Promise.all(
        ids.slice(i, i + 10).map((id) => gmail.users.messages.get({ userId: "me", id, format: "full" })),
      );
      for (const res of batch) {
        const headers = res.data.payload?.headers ?? [];
        const header = (name: string) =>
          headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? null;
        const written = stripQuotedEmail(emailBodyText(res.data.payload ?? undefined));
        if (!written) continue;
        const subject = header("Subject")?.trim() || "(no subject)";
        items.push({
          source: "gmail",
          id: `gmail:${res.data.id}`,
          text: clipText(written, MESSAGE_TEXT_MAX),
          label: clipText(subject, 140),
          url: res.data.threadId ? `https://mail.google.com/mail/u/0/#sent/${res.data.threadId}` : null,
          at: res.data.internalDate ? new Date(Number(res.data.internalDate)) : new Date(),
          to: firstRecipient(header("To")),
        });
      }
    }
    return ok(items, items.length ? `Read ${items.length} sent email${items.length === 1 ? "" : "s"}.` : "No new sent email.");
  } catch (err) {
    const message = (err as Error).message ?? "unknown error";
    return failed(
      /invalid_grant/i.test(message)
        ? "Your Google access has expired or was revoked. Sign out of Foundry and back in."
        : /insufficient|scope/i.test(message)
          ? "Foundry doesn't have permission to read your Gmail. Sign out and back in to grant it."
          : `Couldn't read your Gmail: ${message}`,
    );
  }
}

const SLACK_ERRORS: Record<string, string> = {
  missing_scope: "The Slack app can't read channel history. It needs reinstalling with that permission.",
  invalid_auth: "The Slack bot token is invalid. Reconnect Slack in Settings.",
  users_not_found: "Your Foundry email isn't on a Slack account, so your messages can't be found.",
};

async function readOwnSlack(user: EffectiveUser, after: Date): Promise<SourceOutcome<WrittenMessage>> {
  const ws = await prisma.workspace.findUnique({
    where: { id: user.workspaceId },
    select: { slackBotToken: true, slackBotTokenEncrypted: true },
  });
  const token = getSlackBotToken(ws);
  if (!token) return failed("Slack isn't connected to Foundry.");
  const headers = { Authorization: `Bearer ${token}` };
  try {
    const lookup = (await (
      await fetch(`${SLACK_API}/users.lookupByEmail?email=${encodeURIComponent(user.email)}`, {
        headers,
        cache: "no-store",
      })
    ).json()) as { ok: boolean; error?: string; user?: { id?: string; team_id?: string } };
    if (!lookup.ok || !lookup.user?.id) {
      return failed(SLACK_ERRORS[lookup.error ?? ""] ?? `Couldn't find you on Slack (${lookup.error ?? "unknown"}).`);
    }
    const myId = lookup.user.id;
    const teamId = lookup.user.team_id ?? null;

    const scopeIds = canSeeAllClients(user) ? null : await assignedClientIds(user);
    const clients = await prisma.workspaceClient.findMany({
      where: {
        workspaceId: user.workspaceId,
        hidden: false,
        ...(scopeIds ? { id: { in: scopeIds.length ? scopeIds : ["__none__"] } } : {}),
        OR: [{ slackInternalChannelId: { not: null } }, { slackChannelId: { not: null } }],
      },
      select: { name: true, slackChannelId: true, slackInternalChannelId: true },
      orderBy: { updatedAt: "desc" },
      take: MAX_SLACK_CHANNELS,
    });
    const channels = new Map<string, string>();
    for (const c of clients) {
      for (const id of [c.slackInternalChannelId, c.slackChannelId]) {
        if (id?.trim()) channels.set(id.trim(), c.name);
      }
    }
    const items: WrittenMessage[] = [];
    let refused = 0;
    for (const [channelId, clientName] of channels) {
      const data = (await (
        await fetch(
          `${SLACK_API}/conversations.history?channel=${encodeURIComponent(channelId)}&oldest=${(after.getTime() / 1000).toFixed(6)}&limit=${MAX_SLACK_PER_CHANNEL}`,
          { headers, cache: "no-store" },
        )
      ).json()) as { ok: boolean; error?: string; messages?: Array<{ user?: string; subtype?: string; text?: string; ts?: string }> };
      if (!data.ok) {
        if (data.error === "missing_scope" || data.error === "invalid_auth") {
          return failed(SLACK_ERRORS[data.error]);
        }
        refused += 1;
        continue;
      }
      for (const m of data.messages ?? []) {
        if (m.user !== myId || m.subtype || !m.ts) continue;
        const text = cleanSlackText(m.text ?? "");
        if (text.length < 15) continue;
        items.push({
          source: "slack",
          id: `slack:${channelId}:${m.ts}`,
          text: clipText(text, MESSAGE_TEXT_MAX),
          label: `#${clientName}`,
          url: teamId ? `https://app.slack.com/client/${teamId}/${channelId}/p${m.ts.replace(".", "")}` : null,
          at: new Date(Number(m.ts) * 1000),
          to: clientName,
        });
      }
    }
    const note = refused ? ` ${refused} channel${refused === 1 ? "" : "s"} couldn't be read (the bot may not be in them).` : "";
    return ok(items, `Read ${items.length} of your Slack message${items.length === 1 ? "" : "s"}.${note}`);
  } catch (err) {
    return failed(`Couldn't reach Slack: ${(err as Error).message}`);
  }
}

async function readMeetingItems(user: EffectiveUser): Promise<SourceOutcome<DirectSuggestion>> {
  const myTasks = await prisma.task.findMany({
    where: { workspaceId: user.workspaceId, OR: [{ assignees: { some: { id: user.id } } }, { assigneeId: user.id }] },
    select: { id: true },
  });
  const myTaskIds = new Set(myTasks.map((t) => t.id));
  // Only items that are yours: on a board task assigned to you, or a meeting you were in where
  // the notes name you as the owner. Everyone else's action items are not your to-dos.
  const relevance: Prisma.MeetingActionItemWhereInput[] = [];
  if (user.email) relevance.push({ meeting: { attendees: { has: user.email } }, owner: { not: null } });
  if (myTaskIds.size) relevance.push({ taskId: { in: [...myTaskIds] } });
  if (!relevance.length) return ok([], "No meeting notes include you.");
  const candidates = await prisma.meetingActionItem.findMany({
    where: {
      done: false,
      createdAt: { gte: new Date(Date.now() - SUGGESTION_TTL_DAYS * DAY_MS) },
      meeting: { workspaceId: user.workspaceId },
      OR: relevance,
    },
    include: { meeting: { select: { id: true, title: true, startedAt: true, client: { select: { slug: true, name: true } } } } },
    orderBy: { createdAt: "desc" },
    take: 80,
  });
  const rows = candidates.filter(
    (r) => (r.taskId && myTaskIds.has(r.taskId)) || actionItemIsMine(r.owner, { email: user.email, name: user.name }),
  );
  const items: DirectSuggestion[] = rows.map((r) => ({
    source: "meeting",
    refId: r.id,
    title: clipText((r.title ?? r.text).trim(), TITLE_MAX),
    dueAt: null,
    counterpart: r.meeting.client?.name ?? null,
    quote: clipText(r.text, QUOTE_MAX),
    label: r.meeting.title,
    url: r.meeting.client ? `/app/portal/${r.meeting.client.slug}` : null,
    at: r.meeting.startedAt,
    reason: "The meeting notes name you as the owner.",
  }));
  return ok(items, `${items.length} open action item${items.length === 1 ? "" : "s"} owned by you in your meetings.`);
}

/**
 * Everyone on our side by address: active members and the developers on Staff, many of whom use
 * a personal gmail.com. A meeting with only them is not one you follow up with a client after.
 */
async function teamEmails(workspaceId: string): Promise<Set<string>> {
  const [members, staff] = await Promise.all([
    prisma.workspaceMember.findMany({
      where: { workspaceId, ...ACTIVE_MEMBER },
      select: { user: { select: { email: true } } },
    }),
    prisma.candidate.findMany({
      where: { workspaceId, email: { not: null } },
      select: { email: true },
    }),
  ]);
  const out = new Set<string>();
  for (const m of members) if (m.user.email) out.add(m.user.email.toLowerCase());
  for (const c of staff) if (c.email) out.add(c.email.toLowerCase());
  return out;
}

/** Marks a suggestion Foundry let go of itself, as opposed to one the person turned down. */
export const LET_GO_REASON = "Let go: no longer offered, or not acted on within a week.";
/** Dismissals before this were not marked, so they can't be told apart; ignore them. */
const DECLINE_MEMORY_SINCE = new Date("2026-11-04T19:00:00Z");

/** Who this person has said "Not mine" to a follow-up with, in the last 180 days. */
async function declinedFollowUps(user: EffectiveUser): Promise<Set<string>> {
  const rows = await prisma.commitment.findMany({
    where: {
      ...mine(user),
      source: "calendar",
      state: "dismissed",
      counterpart: { not: null },
      // Only a person's own "Not mine": let-go dismissals carry LET_GO_REASON, and the ones let
      // go before that marker existed are excluded by the cut-off.
      updatedAt: { gte: new Date(Math.max(Date.now() - 180 * DAY_MS, DECLINE_MEMORY_SINCE.getTime())) },
      NOT: { reason: LET_GO_REASON },
    },
    select: { counterpart: true },
    take: 500,
  });
  return new Set(rows.map((r) => (r.counterpart ?? "").trim().toLowerCase()).filter(Boolean));
}

async function readCalendar(user: EffectiveUser, refreshToken: string | null): Promise<SourceOutcome<DirectSuggestion>> {
  if (!refreshToken) return failed("Google isn't connected for you. Sign out of Foundry and back in.");
  const auth = googleClientForRefreshToken(refreshToken);
  if (!auth) return failed("Google sign-in isn't configured on this server.");
  try {
    const internalEmails = await teamEmails(user.workspaceId);
    const declined = await declinedFollowUps(user);
    const calendar = google.calendar({ version: "v3", auth });
    const now = new Date();
    const res = await calendar.events.list({
      calendarId: "primary",
      timeMin: new Date(now.getTime() - 4 * DAY_MS).toISOString(),
      timeMax: now.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 100,
    });
    const items: DirectSuggestion[] = [];
    for (const event of res.data.items ?? []) {
      if (!event.id) continue;
      const follow = followUpFromEvent(event as CalendarEventLike, {
        userEmail: user.email,
        internalDomains: INTERNAL_DOMAINS,
        internalEmails,
        now,
      });
      if (!follow) continue;
      // "Not mine" on a follow-up with someone means: stop suggesting follow-ups with them
      // (a teammate on a personal address, say). Their next meeting is not suggested either.
      if (declined.has(follow.counterpart.trim().toLowerCase())) continue;
      items.push({
        source: "calendar",
        refId: event.id,
        title: follow.title,
        dueAt: follow.dueAt,
        counterpart: follow.counterpart,
        quote: null,
        label: clipText(event.summary?.trim() || "Meeting", 140),
        url: event.htmlLink ?? null,
        at: follow.endedAt,
        reason: "You met someone outside Gitwork and haven't followed up here yet.",
      });
    }
    return ok(items, `${items.length} one-off meeting${items.length === 1 ? "" : "s"} with people outside Gitwork to follow up.`);
  } catch (err) {
    const message = (err as Error).message ?? "unknown error";
    return failed(
      /invalid_grant/i.test(message)
        ? "Your Google access has expired or was revoked. Sign out of Foundry and back in."
        : `Couldn't read your calendar: ${message}`,
    );
  }
}

// ── The AI read ──────────────────────────────────────────────────────────────

const EXTRACT_SYSTEM = `You read messages ONE person wrote (their sent emails and their own Slack messages) and list the promises THEY made: things they said they will do for someone.

Examples of promises: "I'll send the revised quote by Friday", "Will get back to you tomorrow", "Let me check with the team and come back to you", "I'll book a call next week".
Not promises: questions, things other people will do, things already done ("I've attached"), vague pleasantries ("let's catch up sometime"), and requests to others.

For each promise return:
- title: what they need to do, as an imperative under 12 words ("Send revised quote to Valu").
- quote: the exact words from the message that make the promise, copied character for character, at least 5 words.
- messageId: copied exactly from the input.
- due: YYYY-MM-DD only when the message gives or clearly implies a date (resolve "Friday" or "tomorrow" against the message's date), otherwise null.
- to: who it was promised to, when clear, otherwise null.
- reason: one short sentence.

Be conservative. Return an empty list when nothing is clearly a promise.
Reply with JSON only: {"commitments":[{"title":"","quote":"","messageId":"","due":null,"to":null,"reason":""}]}`;

async function extractPromises(
  user: EffectiveUser,
  messages: WrittenMessage[],
): Promise<{ suggestions: ReturnType<typeof normaliseExtraction>; skipped: string | null }> {
  if (messages.length === 0) return { suggestions: [], skipped: null };
  if (!canGenerateAi(user)) {
    return {
      suggestions: [],
      skipped: "Reading promises from your messages uses AI, which your role doesn't include. Ask an admin to grant “Generate with AI”.",
    };
  }
  const ws = await prisma.workspace.findUnique({
    where: { id: user.workspaceId },
    select: {
      aiProvider: true,
      anthropicApiKey: true,
      platformAiKeysAllowed: true,
      anthropicModel: true,
      openaiApiKey: true,
      openaiModel: true,
      geminiApiKey: true,
      geminiModel: true,
      localLlmUrl: true,
      localLlmModel: true,
    },
  });
  if (!ws) return { suggestions: [], skipped: null };
  const config = resolveAiConfig(ws);
  if (!config.apiKey && config.provider !== "LOCAL") {
    return { suggestions: [], skipped: "No AI provider is configured, so promises can't be read from your messages." };
  }
  const picked = [...messages].sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, MAX_READ_MESSAGES);
  const forModel: ExtractionMessage[] = picked.map((m) => ({ id: m.id, text: m.text }));
  const payload = {
    today: new Date().toISOString().slice(0, 10),
    messages: picked.map((m) => ({
      id: m.id,
      kind: m.source === "gmail" ? "email they sent" : "their Slack message",
      date: m.at.toISOString().slice(0, 10),
      to: m.to,
      text: m.text,
    })),
  };
  try {
    const result = await cachedOrCompute<{ raw: unknown }>({
      workspaceId: user.workspaceId,
      cacheKey: `commitments:${user.id}:${hashInputs(picked.map((m) => m.id))}`,
      inputsHash: hashInputs(payload),
      compute: async () => {
        const text = await completeText({
          config,
          system: EXTRACT_SYSTEM,
          user: JSON.stringify(payload),
          maxTokens: 1_500,
          tier: "light",
          usageContext: { module: "COMMITMENTS", workspaceId: user.workspaceId, operation: "commitments.extract" },
        });
        return { response: { raw: parseJsonObject<unknown>(text) }, modelUsed: config.model };
      },
    });
    return { suggestions: normaliseExtraction(result?.response.raw ?? null, forModel, new Date()), skipped: null };
  } catch (err) {
    console.error("[commitments] extraction failed", err);
    return { suggestions: [], skipped: `The AI read failed: ${(err as Error).message}` };
  }
}

// ── Sync ─────────────────────────────────────────────────────────────────────

interface NewSuggestion {
  source: CommitmentSource;
  externalId: string;
  title: string;
  dueAt: Date | null;
  counterpart: string | null;
  quote: string | null;
  evidenceLabel: string | null;
  evidenceUrl: string | null;
  evidenceAt: Date | null;
  reason: string | null;
}

/** Saves suggestions not seen before. Dismissed and finished ones count as seen. */
async function saveSuggestions(user: EffectiveUser, suggestions: NewSuggestion[]): Promise<number> {
  if (!suggestions.length) return 0;
  const existing = await prisma.commitment.findMany({
    where: { ...mine(user), externalId: { in: suggestions.map((s) => s.externalId) } },
    select: { externalId: true },
  });
  const seen = new Set(existing.map((e) => e.externalId));
  const fresh = suggestions.filter((s) => {
    if (seen.has(s.externalId)) return false;
    seen.add(s.externalId);
    return true;
  });
  if (!fresh.length) return 0;
  // A handful a day, not a backlog. What doesn't fit waits for tomorrow's read (the sources
  // re-read their window), so nothing is lost by holding it back.
  const today = await prisma.commitment.count({
    where: { ...mine(user), source: { not: "manual" }, createdAt: { gte: new Date(Date.now() - DAY_MS) } },
  });
  const room = Math.max(0, MAX_SUGGESTIONS_PER_DAY - today);
  const kept = fresh.slice(0, room);
  if (!kept.length) return 0;
  await prisma.commitment.createMany({
    data: kept.map((s) => ({ ...mine(user), ...s, state: "suggested" })),
  });
  return kept.length;
}

/**
 * Lets go of suggestions nobody needs any more: any over a week old, and meeting or calendar ones
 * the source no longer offers (the item was finished, or isn't yours under the current rules).
 * Only a source that was read this time can let go of its own, so a failed read changes nothing.
 * Let-go suggestions become "dismissed", so the same item is never suggested again.
 */
async function letGoOfSuggestions(
  user: EffectiveUser,
  now: Date,
  current: { meeting: Set<string> | null; calendar: Set<string> | null },
): Promise<void> {
  await prisma.commitment.updateMany({
    where: { ...mine(user), state: "suggested", createdAt: { lt: new Date(now.getTime() - SUGGESTION_TTL_DAYS * DAY_MS) } },
    data: { state: "dismissed", reason: LET_GO_REASON },
  });
  for (const source of ["meeting", "calendar"] as const) {
    const keep = current[source];
    if (!keep) continue;
    await prisma.commitment.updateMany({
      where: { ...mine(user), state: "suggested", source, externalId: { notIn: [...keep] } },
      data: { state: "dismissed", reason: LET_GO_REASON },
    });
  }
}

/**
 * Reads every enabled source and saves new suggestions. Claims the person's settings row so two
 * reads can't overlap; a concurrent call returns `status: "busy"`.
 */
export async function syncCommitments(user: EffectiveUser): Promise<CommitmentSyncResult> {
  const settings = await settingsRow(user);
  const now = new Date();
  const claimed = await prisma.commitmentSettings.updateMany({
    where: {
      id: settings.id,
      OR: [{ syncStartedAt: null }, { syncStartedAt: { lt: new Date(now.getTime() - CLAIM_TTL_MS) } }],
    },
    data: { syncStartedAt: now },
  });
  if (claimed.count === 0) return { status: "busy", added: 0, sources: {} };

  try {
    const after = settings.lastSyncedAt
      ? new Date(settings.lastSyncedAt.getTime() - OVERLAP_MS)
      : new Date(now.getTime() - FIRST_LOOKBACK_DAYS * DAY_MS);
    const account = await prisma.user.findUnique({
      where: { id: user.id },
      select: { googleOAuthRefreshToken: true },
    });
    const refreshToken = account?.googleOAuthRefreshToken ?? null;

    const [gmail, slack, meetings, calendar] = await Promise.all([
      settings.gmailEnabled ? readSentGmail(refreshToken, after) : null,
      settings.slackEnabled ? readOwnSlack(user, after) : null,
      settings.meetingsEnabled ? readMeetingItems(user) : null,
      settings.calendarEnabled ? readCalendar(user, refreshToken) : null,
    ]);

    const sources: Record<string, CommitmentSourceStatus> = {};
    if (gmail) sources.gmail = gmail.status;
    if (slack) sources.slack = slack.status;
    if (meetings) sources.meeting = meetings.status;
    if (calendar) sources.calendar = calendar.status;

    const written = [...(gmail?.items ?? []), ...(slack?.items ?? [])];
    const byId = new Map(written.map((m) => [m.id, m]));
    const extraction = await extractPromises(user, written);
    if (extraction.skipped) {
      const status: CommitmentSourceStatus = { ok: false, message: extraction.skipped, at: now.toISOString() };
      if (sources.gmail?.ok) sources.gmail = status;
      if (sources.slack?.ok) sources.slack = status;
    }

    const suggestions: NewSuggestion[] = [];
    for (const s of extraction.suggestions) {
      const m = byId.get(s.messageId);
      if (!m) continue;
      suggestions.push({
        source: m.source,
        externalId: suggestionKey(m.source, m.id, s.title),
        title: s.title,
        dueAt: s.dueAt,
        counterpart: s.counterpart ?? m.to,
        quote: s.quote,
        evidenceLabel: m.label,
        evidenceUrl: m.url,
        evidenceAt: m.at,
        reason: s.reason,
      });
    }
    for (const d of [...(meetings?.items ?? []), ...(calendar?.items ?? [])]) {
      suggestions.push({
        source: d.source,
        externalId: suggestionKey(d.source, d.refId, d.source === "calendar" ? "follow up" : d.title),
        title: d.title,
        dueAt: d.dueAt,
        counterpart: d.counterpart,
        quote: d.quote,
        evidenceLabel: d.label,
        evidenceUrl: d.url,
        evidenceAt: d.at,
        reason: d.reason,
      });
    }
    const added = await saveSuggestions(user, suggestions);
    await letGoOfSuggestions(user, now, {
      meeting: meetings?.status.ok ? new Set((meetings.items ?? []).map((d) => suggestionKey(d.source, d.refId, d.title))) : null,
      calendar: calendar?.status.ok ? new Set((calendar.items ?? []).map((d) => suggestionKey(d.source, d.refId, "follow up"))) : null,
    });

    // Only move the window forward when every enabled source was actually read.
    const allRead = Object.values(sources).every((s) => s.ok);
    await prisma.commitmentSettings.update({
      where: { id: settings.id },
      data: {
        syncStartedAt: null,
        sourceStatus: sources as unknown as Prisma.InputJsonValue,
        ...(allRead ? { lastSyncedAt: now } : {}),
      },
    });
    return { status: allRead ? "ok" : "partial", added, sources };
  } catch (err) {
    await prisma.commitmentSettings.update({ where: { id: settings.id }, data: { syncStartedAt: null } });
    throw err;
  }
}

/**
 * From the every-minute job worker: reads a few people whose last read is over
 * `AUTO_SYNC_EVERY_MS` old and who have Gmail or Slack switched on. Scribe and Calendar alone
 * are read when the person opens their list, so nobody's calendar is read on a schedule unless
 * they've asked for the intelligent sources.
 */
export async function syncDueCommitments(): Promise<{ synced: number; failed: number }> {
  const cutoff = new Date(Date.now() - AUTO_SYNC_EVERY_MS);
  const due = await prisma.commitmentSettings.findMany({
    where: {
      OR: [{ gmailEnabled: true }, { slackEnabled: true }],
      // updatedAt moves on every attempt (the claim writes the row), so a person whose read keeps
      // failing waits their turn instead of jumping the queue every tick. lastSyncedAt only
      // moves on a full read, which is what keeps a failed window re-read.
      updatedAt: { lt: cutoff },
    },
    orderBy: { updatedAt: "asc" },
    take: AUTO_SYNC_PER_TICK,
  });
  let synced = 0;
  let failedCount = 0;
  for (const row of due) {
    const member = await prisma.workspaceMember.findFirst({
      where: { workspaceId: row.workspaceId, userId: row.userId, ...ACTIVE_MEMBER },
      select: {
        id: true,
        role: true,
        permissions: true,
        user: { select: { id: true, email: true, name: true, avatarUrl: true } },
      },
    });
    if (!member) {
      // Archived or removed: stop reading their accounts.
      await prisma.commitmentSettings.update({
        where: { id: row.id },
        data: { gmailEnabled: false, slackEnabled: false },
      });
      continue;
    }
    const user: EffectiveUser = {
      id: member.user.id,
      email: member.user.email,
      name: member.user.name,
      avatarUrl: member.user.avatarUrl,
      role: member.role,
      permissions: Array.isArray(member.permissions) ? (member.permissions as string[]) : [],
      workspaceId: row.workspaceId,
      membershipId: member.id,
    };
    try {
      await syncCommitments(user);
      synced += 1;
    } catch (err) {
      console.error("[commitments] scheduled read failed", err);
      failedCount += 1;
    }
  }
  return { synced, failed: failedCount };
}
