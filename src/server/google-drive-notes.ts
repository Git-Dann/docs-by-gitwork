/**
 * Google Drive reader for Scribe — pulls Google Meet's "Notes by Gemini" docs.
 *
 * Gitwork's Meet calls auto-generate a "Notes by Gemini" Google Doc in the organiser's Drive
 * (summary + decisions + action items, already attributed to the meeting). Rather than read raw
 * Meet transcripts (which Gitwork doesn't generate), Scribe reads these finished notes via the
 * Drive API using the signed-in user's OAuth client (needs the `drive.readonly` scope — see
 * src/auth.ts) and hands the text to the summariser to normalise into our structured shape.
 */

import { google } from "googleapis";

type OAuth2Client = InstanceType<typeof google.auth.OAuth2>;

export interface GeminiNotes {
  docId: string;
  title: string;
  text: string;
  webViewLink: string | null;
}

/** Strip a Meet URL / query down to the bare meeting code, e.g. "abc-defg-hij". */
export function extractMeetingCode(meetLinkOrCode: string | null | undefined): string | null {
  if (!meetLinkOrCode) return null;
  const trimmed = meetLinkOrCode.trim();
  const match = trimmed.match(/meet\.google\.com\/([a-z0-9-]+)/i);
  const code = (match ? match[1] : trimmed).split("?")[0].trim();
  return code.length > 0 ? code : null;
}

// Generic words in meeting titles that don't help locate the matching doc.
const TITLE_STOPWORDS = new Set([
  "the", "and", "with", "meeting", "call", "sync", "standup", "stand", "weekly",
  "catch", "gitwork", "team", "check", "review", "chat", "intro", "kickoff", "kick",
]);

/** Pick the most distinctive word from a meeting title to narrow the Drive search. */
function pickTitleToken(title: string): string | null {
  const words = title
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !TITLE_STOPWORDS.has(w));
  words.sort((a, b) => b.length - a.length);
  return words[0] ?? null;
}

function escapeDriveQuery(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/**
 * Find the "Notes by Gemini" doc that matches a calendar event (by a distinctive title word and
 * a time window around the event start), read its text, and return it. Returns null when no
 * matching doc exists yet (notes weren't generated, or aren't ready).
 */
export async function findGeminiNotesForEvent(
  client: OAuth2Client,
  event: { title: string; startISO?: string | null },
): Promise<GeminiNotes | null> {
  const drive = google.drive({ version: "v3", auth: client });

  const clauses = [
    "name contains 'Notes by Gemini'",
    "mimeType = 'application/vnd.google-apps.document'",
    "trashed = false",
  ];
  const token = pickTitleToken(event.title);
  if (token) clauses.push(`name contains '${escapeDriveQuery(token)}'`);
  if (event.startISO) {
    const start = new Date(event.startISO).getTime();
    // Gemini writes the doc shortly after the call; allow a generous window either side.
    clauses.push(`createdTime > '${new Date(start - 2 * 3600_000).toISOString()}'`);
    clauses.push(`createdTime < '${new Date(start + 8 * 3600_000).toISOString()}'`);
  }

  const res = await drive.files.list({
    q: clauses.join(" and "),
    orderBy: "createdTime",
    fields: "files(id,name,createdTime,webViewLink)",
    pageSize: 10,
    spaces: "drive",
  });

  const files = res.data.files ?? [];
  if (files.length === 0) return null;

  // Prefer the doc created closest to the event start.
  const target = event.startISO ? new Date(event.startISO).getTime() : null;
  const best =
    target != null
      ? [...files].sort(
          (a, b) =>
            Math.abs(new Date(a.createdTime ?? 0).getTime() - target) -
            Math.abs(new Date(b.createdTime ?? 0).getTime() - target),
        )[0]
      : files[0];
  if (!best?.id) return null;

  // Export the Google Doc as plain text.
  const exported = await drive.files.export(
    { fileId: best.id, mimeType: "text/plain" },
    { responseType: "text" },
  );
  const text = typeof exported.data === "string" ? exported.data : String(exported.data ?? "");
  if (!text.trim()) return null;

  return {
    docId: best.id,
    title: best.name ?? "",
    text,
    webViewLink: best.webViewLink ?? null,
  };
}
