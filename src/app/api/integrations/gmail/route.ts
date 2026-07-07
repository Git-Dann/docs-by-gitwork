import { google } from "googleapis";
import { apiOk, fromError } from "@/lib/api-response";
import { getUserGoogleAuth } from "@/server/google-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/integrations/gmail → recent inbox for the *signed-in user*.
 *
 * Strictly per-user. The previous workspace-shared OAuth path was removed because every
 * sign-in overwrote the workspace token, leaking the most-recent signer's inbox to
 * everyone else.
 */
export async function GET(request: Request) {
  try {
    const authResult = await getUserGoogleAuth();
    if (!authResult.ok) return apiOk({ connected: false, messages: [] });

    const gmail = google.gmail({ version: "v1", auth: authResult.client });

    // Optional ?q= Gmail search (e.g. "is:unread category:primary" for the Desk's
    // high-signal "Needs you today" feed). Defaults to the full inbox.
    const q = new URL(request.url).searchParams.get("q") || "in:inbox";
    const listRes = await gmail.users.messages.list({
      userId: "me",
      maxResults: 20,
      q,
    });

    const messageIds = listRes.data.messages ?? [];
    if (messageIds.length === 0) {
      return apiOk({ connected: true, messages: [], connectedAs: authResult.email });
    }

    const messageDetails = await Promise.all(
      messageIds.map((m) =>
        gmail.users.messages.get({
          userId: "me",
          id: m.id!,
          format: "metadata",
          metadataHeaders: ["From", "Subject", "Date"],
        }),
      ),
    );

    const messages = messageDetails.map((res) => {
      const headers = res.data.payload?.headers ?? [];
      const get = (name: string) => headers.find((h) => h.name === name)?.value ?? "";
      const labelIds = res.data.labelIds ?? [];
      return {
        id: res.data.id ?? "",
        threadId: res.data.threadId ?? "",
        subject: get("Subject") || "(no subject)",
        from: get("From"),
        snippet: res.data.snippet ?? "",
        date: get("Date"),
        unread: labelIds.includes("UNREAD"),
      };
    });

    return apiOk({ connected: true, messages, connectedAs: authResult.email });
  } catch (error) {
    return fromError(error);
  }
}
