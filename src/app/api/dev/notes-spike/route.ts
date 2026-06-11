import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { assertSuperAdmin, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { getUserGoogleAuth } from "@/server/google-auth";
import { findGeminiNotesForEvent } from "@/server/google-drive-notes";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * GET /api/dev/notes-spike?title={meeting title}&start={ISO}
 *
 * Scribe go/no-go diagnostic. Confirms Drive access works and that we can locate the
 * "Notes by Gemini" doc for a given meeting. Requires a signed-in @gitwork.co.uk user with the
 * drive.readonly scope (sign out / back in after deploy to grant it).
 *
 * A 403 means the Drive scope wasn't granted. `found: false` means no matching doc — check the
 * title/time, or the meeting simply didn't get Gemini notes.
 */
export async function GET(req: NextRequest) {
  try {
    assertSuperAdmin(await getEffectiveUserOrNull(req));
    const title = req.nextUrl.searchParams.get("title");
    const start = req.nextUrl.searchParams.get("start");
    if (!title) return apiError("Pass ?title= the meeting title (and optionally &start=ISO)", 400);

    const auth = await getUserGoogleAuth();
    if (!auth.ok) return apiError(`Google not connected: ${auth.reason}`, 422);

    const notes = await findGeminiNotesForEvent(auth.client, { title, startISO: start });
    if (!notes) {
      return apiOk({
        connectedAs: auth.email,
        found: false,
        verdict: "NO_NOTES — no matching 'Notes by Gemini' doc found for that title/time",
      });
    }

    return apiOk({
      connectedAs: auth.email,
      found: true,
      docId: notes.docId,
      docTitle: notes.title,
      webViewLink: notes.webViewLink,
      chars: notes.text.length,
      preview: notes.text.slice(0, 800),
      verdict: "GO — Gemini notes reachable ✅",
    });
  } catch (error) {
    return fromError(error);
  }
}
