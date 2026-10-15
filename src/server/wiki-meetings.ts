/**
 * wiki-meetings.ts — what was agreed in each call, in the client's wiki.
 *
 * ## Nothing is shared by default
 *
 * Scribe's notes are written from our calls for us (§14). Some of what is said in a client
 * call should not be published back at them verbatim, so a meeting appears here ONLY once
 * someone sets `Meeting.sharedWithClientAt` — per meeting, deliberately. Turning the section
 * on shares nothing by itself.
 *
 * ## What a shared meeting shows, and what it never shows
 *
 * Shown: title, date, the summary, decisions, and action items with their owner and whether
 * they are done.
 * Never: the transcript or Gemini notes text, attendee email addresses, who in Gitwork
 * surfaced the notes, the model used.
 *
 * ## "Done" is derived when it can be
 *
 * An action item turned into a board task (`taskId`) is done when THAT TASK is done — the
 * same rule as Requests (§47.2). Otherwise the item's own checkbox is used. A task that has
 * since been deleted falls back to the checkbox rather than claiming either way.
 */

import { prisma } from "@/lib/prisma";

export interface WikiMeetingAction {
  id: string;
  title: string;
  owner: string | null;
  done: boolean;
}

export interface WikiMeeting {
  id: string;
  title: string;
  /** ISO, or null when Scribe never learnt when it happened. */
  startedAt: string | null;
  summary: string | null;
  decisions: string[];
  actions: WikiMeetingAction[];
}

export interface WikiMeetingsSection {
  enabled: boolean;
  /** Shared meetings only, newest first. */
  meetings: WikiMeeting[];
}

export const EMPTY_MEETINGS: WikiMeetingsSection = { enabled: false, meetings: [] };

/** How many shared meetings ride down in the DTO. Older ones are still in Portal. */
const MAX_MEETINGS = 30;

/** `Meeting.decisions` is loose JSON — anything that is not a list of strings is skipped. */
export function readDecisions(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((d) => (typeof d === "string" ? d.trim() : ""))
    .filter((d) => d.length > 0);
}

/** An item's done state: the linked task's status when that task exists, else its checkbox. */
export function actionDone(
  item: { done: boolean; taskId: string | null },
  taskStatus: ReadonlyMap<string, string>,
): boolean {
  if (item.taskId && taskStatus.has(item.taskId)) return taskStatus.get(item.taskId) === "DONE";
  return item.done;
}

export async function loadWikiMeetings(clientId: string): Promise<WikiMeetingsSection> {
  const wiki = await prisma.clientWiki.findUnique({
    where: { clientId },
    select: { meetingsEnabled: true },
  });
  if (!wiki?.meetingsEnabled) return EMPTY_MEETINGS;

  const rows = await prisma.meeting.findMany({
    where: { clientId, sharedWithClientAt: { not: null } },
    orderBy: [{ startedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    take: MAX_MEETINGS,
    // ⚠️ An explicit select, not an include: transcriptText, transcriptData and attendees
    // must never be loaded into a structure that is sent to a client.
    select: {
      id: true,
      title: true,
      startedAt: true,
      summary: true,
      decisions: true,
      actionItems: {
        orderBy: { createdAt: "asc" },
        select: { id: true, title: true, text: true, owner: true, done: true, taskId: true },
      },
    },
  });

  const taskIds = rows.flatMap((r) => r.actionItems.map((a) => a.taskId)).filter((t): t is string => Boolean(t));
  const tasks = taskIds.length
    ? await prisma.task.findMany({
        where: { id: { in: taskIds }, clientId },
        select: { id: true, status: true },
      })
    : [];
  const taskStatus = new Map(tasks.map((t) => [t.id, t.status as string]));

  return {
    enabled: true,
    meetings: rows.map((r) => ({
      id: r.id,
      title: r.title,
      startedAt: r.startedAt?.toISOString() ?? null,
      summary: r.summary?.trim() || null,
      decisions: readDecisions(r.decisions),
      actions: r.actionItems.map((a) => ({
        id: a.id,
        title: (a.title?.trim() || a.text.trim()).slice(0, 300),
        owner: a.owner?.trim() || null,
        done: actionDone({ done: a.done, taskId: a.taskId }, taskStatus),
      })),
    })),
  };
}

export async function setWikiMeetingsEnabled(clientId: string, enabled: boolean): Promise<void> {
  await prisma.clientWiki.upsert({
    where: { clientId },
    create: { clientId, meetingsEnabled: enabled },
    update: { meetingsEnabled: enabled },
    select: { id: true },
  });
}

/**
 * Share or unshare one meeting. Scoped to the client by the WHERE clause, so a meeting id
 * from another client matches nothing rather than being shared into the wrong wiki.
 */
export async function setMeetingShared(
  clientId: string,
  meetingId: string,
  shared: boolean,
): Promise<boolean> {
  const res = await prisma.meeting.updateMany({
    where: { id: meetingId, clientId },
    data: { sharedWithClientAt: shared ? new Date() : null },
  });
  return res.count > 0;
}

/** The internal picker: this client's meetings with notes, and which are shared. */
export async function listShareableMeetings(clientId: string) {
  const rows = await prisma.meeting.findMany({
    where: { clientId, summary: { not: null } },
    orderBy: [{ startedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    take: 60,
    select: { id: true, title: true, startedAt: true, sharedWithClientAt: true },
  });
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    startedAt: r.startedAt?.toISOString() ?? null,
    shared: r.sharedWithClientAt !== null,
  }));
}
