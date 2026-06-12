/**
 * Scribe — client-scoped meeting notes from Google Meet transcripts.
 *
 * Pipeline (all serverless-friendly; no long-running capture here):
 *   calendar event → fetchMeetTranscript() → upsert Meeting → summariseMeeting() (Claude)
 *
 * The manual flow (a teammate on a client page clicking "Fetch notes") passes the client
 * explicitly, so attribution is trivial. attributeToClient() is for the automated cron path,
 * which discovers meetings without a client context and matches by attendee email domain.
 */

import { google } from "googleapis";
import { prisma } from "@/lib/prisma";
import { findGeminiNotesForEvent, extractMeetingCode } from "@/server/google-drive-notes";
import { resolveAiConfig, completeText, parseJsonObject, type WorkspaceAiFields } from "@/server/ai-provider";

type OAuth2Client = InstanceType<typeof google.auth.OAuth2>;

// Cap transcript size fed to the model — keeps a single call within token/latency limits.
// A ~60k-char transcript is roughly a 1.5–2h meeting; longer ones are truncated with a note.
const MAX_TRANSCRIPT_CHARS = 60_000;

// Domains that never identify a client (free/consumer mail) — skipped during attribution.
const GENERIC_EMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com",
  "yahoo.com", "icloud.com", "me.com", "aol.com", "proton.me", "protonmail.com",
  "gitwork.co.uk", // our own domain — never identifies the *client*
]);

function domainOf(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.lastIndexOf("@");
  if (at === -1) return null;
  const d = email.slice(at + 1).trim().toLowerCase();
  return d.length > 0 ? d : null;
}

function domainOfUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const host = new URL(url.includes("://") ? url : `https://${url}`).hostname.toLowerCase();
    return host.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

/**
 * Match a meeting's external attendees to exactly one workspace client by email domain.
 * Returns the clientId, or null when there's no match or it's ambiguous.
 */
export async function attributeToClient(
  workspaceId: string,
  attendeeEmails: string[],
): Promise<string | null> {
  const attendeeDomains = new Set(
    attendeeEmails.map(domainOf).filter((d): d is string => !!d && !GENERIC_EMAIL_DOMAINS.has(d)),
  );
  if (attendeeDomains.size === 0) return null;

  const clients = await prisma.workspaceClient.findMany({
    where: { workspaceId, hidden: false },
    select: { id: true, website: true, primaryContactEmail: true },
  });

  const matched = new Set<string>();
  for (const c of clients) {
    const clientDomains = [domainOfUrl(c.website), domainOf(c.primaryContactEmail)].filter(
      (d): d is string => !!d && !GENERIC_EMAIL_DOMAINS.has(d),
    );
    if (clientDomains.some((d) => attendeeDomains.has(d))) matched.add(c.id);
  }

  return matched.size === 1 ? [...matched][0] : null;
}

export interface IngestMeetingArgs {
  workspaceId: string;
  clientId: string; // explicit for the manual flow (the page's client)
  ownerUserId: string | null;
  client: OAuth2Client; // resolved Google OAuth client for the signed-in user
  calendarEventId: string;
  title: string;
  meetingCode: string; // bare code or full Meet URL — normalised here
  eventStart?: string | null;
  eventEnd?: string | null;
  attendees?: string[];
}

/**
 * Fetch the Meet transcript for a calendar event and persist a Meeting record, then summarise.
 * Idempotent per (workspaceId, calendarEventId). When no transcript is available (transcription
 * was off, or it's still processing), the row is stored as NO_TRANSCRIPT and can be retried.
 */
export async function ingestMeeting(args: IngestMeetingArgs) {
  const code = extractMeetingCode(args.meetingCode);
  const baseData = {
    clientId: args.clientId,
    meetingCode: code,
    title: args.title,
    startedAt: args.eventStart ? new Date(args.eventStart) : null,
    endedAt: args.eventEnd ? new Date(args.eventEnd) : null,
    attendees: args.attendees ?? [],
    ownerUserId: args.ownerUserId,
  };

  // Find the "Notes by Gemini" doc Google generated for this call (by title + time).
  const notes = await findGeminiNotesForEvent(args.client, {
    title: args.title,
    startISO: args.eventStart,
  }).catch(() => null);

  // Fields written only when the notes doc was found. transcriptText holds the Gemini notes
  // text (fed to the summariser); conferenceRecordName holds the Drive doc id for reference.
  const notesFields = notes
    ? {
        conferenceRecordName: notes.docId,
        transcriptText: notes.text,
        status: "TRANSCRIBED" as const,
      }
    : null;

  const meeting = await prisma.meeting.upsert({
    where: { workspaceId_calendarEventId: { workspaceId: args.workspaceId, calendarEventId: args.calendarEventId } },
    create: {
      workspaceId: args.workspaceId,
      calendarEventId: args.calendarEventId,
      ...baseData,
      ...(notesFields ?? { status: "NO_TRANSCRIPT" as const }),
    },
    update: {
      ...baseData,
      ...(notesFields ?? {}),
    },
  });

  if (notes) {
    await summariseMeeting(meeting.id).catch((err) => {
      console.error("[scribe] summariseMeeting failed", meeting.id, err);
    });
  }

  return prisma.meeting.findUnique({
    where: { id: meeting.id },
    include: { actionItems: { orderBy: { createdAt: "asc" } } },
  });
}

interface SummaryShape {
  summary: string;
  decisions: string[];
  actionItems: Array<{ title?: string | null; text: string; owner?: string | null }>;
}

const SUMMARY_SYSTEM = `You are Scribe, the meeting-notes assistant for Gitwork, a UK digital design-and-build agency.
You are given Google's AI-generated notes ("Notes by Gemini") for a client meeting — typically with summary, decisions, and next-steps sections. Re-express them in our house format — British English, no filler, never invent content not supported by the source. Preserve action-item owners where Gemini names them (e.g. "[Saf] Draft Privacy Policy"). For each action item give a short imperative "title" (≤8 words, e.g. "Build messaging service") plus a fuller "text" describing what to do.

Respond with ONLY a JSON object, no prose, no code fences, in exactly this shape:
{
  "summary": "2–4 sentence plain-English overview of what the meeting covered",
  "decisions": ["each clear decision made, one per string"],
  "actionItems": [{ "title": "short imperative title, ≤8 words", "text": "the action / detail in one or two sentences", "owner": "person responsible, or null if unclear" }]
}
Use empty arrays when there are no decisions or action items.`;

/**
 * Summarise a meeting's stored transcript into summary + decisions + action items.
 * Replaces any existing action-item rows. Falls back to storing the raw model text as the
 * summary if structured JSON can't be parsed, so a meeting is never left un-summarised.
 */
export async function summariseMeeting(meetingId: string): Promise<void> {
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: { id: true, workspaceId: true, title: true, transcriptText: true },
  });
  if (!meeting?.transcriptText) return;

  const ws = await prisma.workspace.findUnique({
    where: { id: meeting.workspaceId },
    select: {
      aiProvider: true,
      anthropicApiKey: true, anthropicModel: true,
      openaiApiKey: true, openaiModel: true,
      geminiApiKey: true, geminiModel: true,
      localLlmUrl: true, localLlmModel: true,
    },
  });
  if (!ws) return;

  const config = resolveAiConfig(ws as WorkspaceAiFields);

  let notesText = meeting.transcriptText;
  let truncatedNote = "";
  if (notesText.length > MAX_TRANSCRIPT_CHARS) {
    notesText = notesText.slice(0, MAX_TRANSCRIPT_CHARS);
    truncatedNote = "\n\n[Notes truncated for length.]";
  }

  const userPrompt = `Meeting: ${meeting.title}\n\nNotes:\n${notesText}${truncatedNote}`;

  let raw = "";
  try {
    raw = await completeText({ config, system: SUMMARY_SYSTEM, user: userPrompt, maxTokens: 1500 });
  } catch (err) {
    console.error("[scribe] AI completion failed", meetingId, err);
    await prisma.meeting.update({ where: { id: meetingId }, data: { status: "ERROR" } });
    return;
  }

  const parsed = parseJsonObject<SummaryShape>(raw);

  const decisions = Array.isArray(parsed?.decisions)
    ? parsed!.decisions.filter((d): d is string => typeof d === "string" && d.trim().length > 0)
    : [];
  const actionItems = Array.isArray(parsed?.actionItems)
    ? parsed!.actionItems
        .filter((a) => a && typeof a.text === "string" && a.text.trim().length > 0)
        .map((a) => ({ title: a.title?.toString().trim() || null, text: a.text.trim(), owner: a.owner?.toString().trim() || null }))
    : [];

  await prisma.$transaction([
    prisma.meeting.update({
      where: { id: meetingId },
      data: {
        summary: parsed?.summary?.trim() || raw.trim() || null,
        decisions,
        modelUsed: config.model,
        status: "SUMMARISED",
      },
    }),
    prisma.meetingActionItem.deleteMany({ where: { meetingId } }),
    ...(actionItems.length > 0
      ? [prisma.meetingActionItem.createMany({ data: actionItems.map((a) => ({ meetingId, title: a.title, text: a.text, owner: a.owner })) })]
      : []),
  ]);
}

// ── Reads / mutations used by the API routes ─────────────────────────────────

/**
 * List view — omits the heavy transcript fields (fetched only in the detail endpoint).
 * When `q` is given, filters to meetings whose title, summary, or transcript contains it.
 */
export function listClientMeetings(workspaceId: string, clientId: string, q?: string) {
  const query = q?.trim();
  return prisma.meeting.findMany({
    where: {
      workspaceId,
      clientId,
      ...(query
        ? {
            OR: [
              { title: { contains: query, mode: "insensitive" as const } },
              { summary: { contains: query, mode: "insensitive" as const } },
              { transcriptText: { contains: query, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      clientId: true,
      calendarEventId: true,
      meetingCode: true,
      title: true,
      startedAt: true,
      endedAt: true,
      attendees: true,
      status: true,
      summary: true,
      decisions: true,
      modelUsed: true,
      createdAt: true,
      updatedAt: true,
      actionItems: { orderBy: { createdAt: "asc" } },
    },
    orderBy: [{ startedAt: "desc" }, { createdAt: "desc" }],
  });
}

export function getMeeting(workspaceId: string, id: string) {
  return prisma.meeting.findFirst({
    where: { id, workspaceId },
    include: {
      actionItems: { orderBy: { createdAt: "asc" } },
      client: { select: { id: true, name: true, slug: true } },
    },
  });
}

/** Toggle an action item, verifying it belongs to a meeting in this workspace. */
export async function setActionItemDone(workspaceId: string, itemId: string, done: boolean) {
  const item = await prisma.meetingActionItem.findFirst({
    where: { id: itemId, meeting: { workspaceId } },
    select: { id: true },
  });
  if (!item) return null;
  return prisma.meetingActionItem.update({ where: { id: itemId }, data: { done } });
}

/** Re-attribute a meeting to a different client (manual override for missed attribution). */
export async function reassignMeetingClient(workspaceId: string, meetingId: string, clientId: string | null) {
  const meeting = await prisma.meeting.findFirst({ where: { id: meetingId, workspaceId }, select: { id: true } });
  if (!meeting) return null;
  return prisma.meeting.update({ where: { id: meetingId }, data: { clientId } });
}

/** The set of email/web domains that identify a client (used to match calendar attendees). */
export function deriveClientDomains(client: { website: string | null; primaryContactEmail: string | null }): string[] {
  return [domainOfUrl(client.website), domainOf(client.primaryContactEmail)].filter(
    (d): d is string => !!d && !GENERIC_EMAIL_DOMAINS.has(d),
  );
}

export interface CalendarCandidate {
  calendarEventId: string;
  title: string;
  start: string;
  end: string;
  meetingCode: string | null;
  attendees: string[];
  organizerEmail: string | null;
}

/**
 * Recent *past* Meet calls (last `days`) on this OAuth client's primary calendar — every call
 * with a Meet link, regardless of client. The per-client UI filters these by domain; the cron
 * attributes each to a client. Returns [] when the calendar can't be read.
 */
export async function listRecentMeetCalls(client: OAuth2Client, days = 30): Promise<CalendarCandidate[]> {
  const calendar = google.calendar({ version: "v3", auth: client });
  const now = new Date();
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  const res = await calendar.events.list({
    calendarId: "primary",
    timeMin: since.toISOString(),
    timeMax: now.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
    // Google Calendar only orders ASCENDING (oldest first) and caps each page. With a low cap
    // over a 90-day window the page fills with the OLDEST events and recent calls — including
    // today's — never get returned, so our newest-first sort below has nothing recent to surface.
    // Pull the whole window (2500 is the API max; 90 days of Meet calls is far under that) and
    // let the sort put the most recent on top.
    maxResults: 2500,
  });

  const out: CalendarCandidate[] = [];
  for (const ev of res.data.items ?? []) {
    if ((ev.eventType ?? "default") !== "default") continue;
    if (!ev.start?.dateTime || !ev.id) continue;

    const meetLink =
      ev.hangoutLink ??
      ev.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video")?.uri ??
      null;
    const meetingCode = extractMeetingCode(meetLink);
    if (!meetingCode) continue;

    const attendeeEmails = (ev.attendees ?? [])
      .map((a) => a.email ?? "")
      .filter((e): e is string => e.length > 0);

    out.push({
      calendarEventId: ev.id,
      title: ev.summary ?? "(no title)",
      start: ev.start.dateTime,
      end: ev.end?.dateTime ?? ev.end?.date ?? "",
      meetingCode,
      attendees: attendeeEmails,
      organizerEmail: ev.organizer?.email ?? null,
    });
  }
  // Most recent first.
  return out.sort((a, b) => b.start.localeCompare(a.start));
}

/**
 * Recent past calls that involve a given client. A call matches if an attendee is on one of the
 * client's domains OR the meeting title contains the client's name (e.g. "Speakify x Gitwork",
 * "Echo Team"). The name fallback matters because partner/agency calls often have attendees on a
 * different domain than the client record — without it the per-client "Recent calls" list comes
 * up empty even though the call (and its Gemini notes) exist.
 */
export async function findPastClientCalls(
  client: OAuth2Client,
  match: { domains: string[]; name?: string | null },
  days = 90, // per-client manual "Recent calls" looks back a full quarter so older calls/notes still surface (cron uses its own shorter window)
): Promise<CalendarCandidate[]> {
  const domainSet = new Set(match.domains);
  // Normalise both sides for the name match: lowercase + drop non-alphanumerics, so a
  // client like "After Desk" still matches a call titled "AfterDesk Catch up" — spacing
  // and punctuation differences shouldn't break the substring check.
  const condense = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const nameKey = match.name ? condense(match.name) : "";
  const nameUsable = nameKey.length >= 3; // avoid noisy matches on 1–2 char names
  if (domainSet.size === 0 && !nameUsable) return [];

  const calls = await listRecentMeetCalls(client, days);
  return calls.filter((c) => {
    const byDomain = c.attendees.some((e) => {
      const at = e.lastIndexOf("@");
      return at !== -1 && domainSet.has(e.slice(at + 1).toLowerCase());
    });
    const byName = nameUsable && condense(c.title).includes(nameKey);
    return byDomain || byName;
  });
}
